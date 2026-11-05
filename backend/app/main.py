import hashlib
import io
from datetime import datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from .config import settings
from .contracts import CollectionInput, Outcome
from .db import Building, Collection, Compartment, Device, Floor, Session, SortingEvent, Station, Telemetry, now
from .inference import normalize, provider
from .ingest import report_outcome, utc

app = FastAPI(title="Smart Waste API", version="0.1.0")


def db_session():
    with Session() as db:
        yield db


DB = Depends(db_session)


def serialize(model):
    result = {c.name: getattr(model, c.name) for c in model.__table__.columns}
    return {key: utc(value) if isinstance(value, datetime) else value for key, value in result.items()}


@app.middleware("http")
async def request_id(request: Request, call_next):
    request.state.request_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


def error(request, status, message):
    return JSONResponse(
        status_code=status, content={"error": {"message": message, "request_id": request.state.request_id}}
    )


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return error(request, exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return error(request, 422, "; ".join(e["msg"] for e in exc.errors()))


@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    return error(request, 500, "Internal server error")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ready")
def ready(db: DBSession = DB):
    try:
        db.execute(text("SELECT 1 FROM stations LIMIT 1"))
    except Exception:
        raise HTTPException(503, "Database or migrations unavailable") from None
    return {"status": "ready"}


@app.get("/api/buildings")
def buildings(db: DBSession = DB):
    return [serialize(x) for x in db.scalars(select(Building))]


@app.get("/api/floors")
def floors(db: DBSession = DB):
    return [serialize(x) for x in db.scalars(select(Floor))]


def station_data(db, station):
    result = serialize(station)
    result["compartments"] = []
    for c in db.scalars(select(Compartment).where(Compartment.station_id == station.id)):
        item = serialize(c)
        item["stale"] = c.measured_at is None or now() - utc(c.measured_at) > timedelta(
            seconds=settings.heartbeat_expiry
        )
        result["compartments"].append(item)
    result["devices"] = []
    for device in db.scalars(select(Device).where(Device.station_id == station.id)):
        item = serialize(device)
        item["online"] = (
            device.status == "online"
            and device.last_seen is not None
            and now() - utc(device.last_seen) < timedelta(seconds=settings.heartbeat_expiry)
        )
        result["devices"].append(item)
    return result


def require_station(db, station_id):
    station = db.get(Station, station_id)
    if not station:
        raise HTTPException(404, "Station not found")
    return station


@app.get("/api/stations")
def stations(db: DBSession = DB):
    return [station_data(db, s) for s in db.scalars(select(Station))]


@app.get("/api/stations/{station_id}")
def station(station_id: str, db: DBSession = DB):
    return station_data(db, require_station(db, station_id))


@app.get("/api/summary")
def summary(db: DBSession = DB):
    rows = stations(db)
    return {
        "stations": len(rows),
        "devices_offline": sum(not d["online"] for s in rows for d in s["devices"]),
        "needing_collection": sum(c["fill"] is not None and c["fill"] >= 80 for s in rows for c in s["compartments"]),
        "inference_provider": settings.inference_provider,
        "heartbeat_expiry_seconds": settings.heartbeat_expiry,
    }


@app.get("/api/stations/{station_id}/telemetry")
def telemetry(station_id: str, db: DBSession = DB):
    require_station(db, station_id)
    rows = db.scalars(
        select(Telemetry).where(Telemetry.station_id == station_id).order_by(Telemetry.measured_at.desc()).limit(180)
    )
    return [serialize(x) for x in rows]


@app.get("/api/events")
def events(station_id: str | None = None, db: DBSession = DB):
    query = select(SortingEvent)
    if station_id:
        query = query.where(SortingEvent.station_id == station_id)
    return [serialize(x) for x in db.scalars(query.order_by(SortingEvent.created_at.desc()).limit(50))]


async def read_jpeg(image: UploadFile) -> bytes:
    data = await image.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "JPEG exceeds upload limit")
    try:
        with Image.open(io.BytesIO(data)) as picture:
            if picture.format != "JPEG" or picture.width * picture.height > 20_000_000:
                raise ValueError()
            picture.verify()
    except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, "Valid JPEG required") from None
    return data


@app.get("/api/inference/config")
def inference_config():
    return {
        "provider": settings.inference_provider,
        "max_upload_bytes": settings.max_upload_bytes,
        "max_pixels": 20_000_000,
        "confidence_threshold": settings.confidence_threshold,
    }


@app.post("/api/inference/test")
async def test_inference(image: UploadFile = File(...), scenario: str = Form("plastic")):
    data = await read_jpeg(image)
    try:
        result = await provider().predict(data, scenario)
        decision, reason = normalize(result)
    except httpx.TimeoutException:
        raise HTTPException(504, "Inference timed out; no decision returned") from None
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(502, "Inference provider failed; no fallback used") from None
    return {"decision": decision, "reason": reason, "provider": settings.inference_provider, **result}


@app.post("/api/classify")
async def classify(
    station_id: str = Form(...),
    device_id: str = Form(...),
    request_id: UUID = Form(...),
    scenario: str = Form("plastic"),
    image: UploadFile = File(...),
    db: DBSession = DB,
):
    require_station(db, station_id)
    device = db.get(Device, device_id)
    if not device or device.station_id != station_id or device.role != "camera_sorter":
        raise HTTPException(422, "Camera/sorter device required")
    data = await read_jpeg(image)
    fingerprint = hashlib.sha256(data + f"{station_id}:{device_id}:{scenario}".encode()).hexdigest()
    existing = db.get(SortingEvent, str(request_id))
    if existing:
        if existing.fingerprint != fingerprint:
            raise HTTPException(409, "Request ID reused with different input")
        return serialize(existing)
    try:
        result = await provider().predict(data, scenario)
        decision, reason = normalize(result)
    except httpx.TimeoutException:
        raise HTTPException(504, "Inference timed out; no sorting decision") from None
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(502, "Inference provider failed; no fallback used") from None
    event = SortingEvent(
        id=str(request_id),
        station_id=station_id,
        device_id=device_id,
        fingerprint=fingerprint,
        decision=decision,
        reason=reason,
        provider=settings.inference_provider,
        **result,
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(SortingEvent, str(request_id))
        if not existing or existing.fingerprint != fingerprint:
            raise HTTPException(409, "Conflicting classification request") from None
        return serialize(existing)
    if settings.store_images:
        Path("images").mkdir(exist_ok=True)
        Path(f"images/{event.id}.jpg").write_bytes(data)
    return serialize(event)


@app.post("/api/outcomes")
def outcome(body: Outcome, db: DBSession = DB):
    event = db.get(SortingEvent, str(body.event_id))
    if not event:
        raise HTTPException(404, "Event not found")
    try:
        report_outcome(db, event, body, now())
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None
    db.commit()
    return serialize(event)


@app.post("/api/stations/{station_id}/collections", status_code=201)
def collect(station_id: str, body: CollectionInput, db: DBSession = DB):
    require_station(db, station_id)
    record = Collection(id=str(uuid4()), station_id=station_id, **body.model_dump())
    db.add(record)
    db.commit()
    return serialize(record)


@app.get("/api/collections")
def collections(station_id: str | None = None, db: DBSession = DB):
    query = select(Collection)
    if station_id:
        query = query.where(Collection.station_id == station_id)
    return [serialize(x) for x in db.scalars(query.order_by(Collection.created_at.desc()).limit(100))]
