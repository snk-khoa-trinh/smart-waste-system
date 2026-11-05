import io
from datetime import timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import Base, Collection, Compartment, Device, Message, SortingEvent, Telemetry, now
from app.ingest import ingest
from app.main import app, db_session
from app.seed import seed


@pytest.fixture()
def system():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        seed(db)

    def override():
        with factory() as db:
            yield db

    app.dependency_overrides[db_session] = override
    old_provider = settings.inference_provider
    settings.inference_provider = "mock"
    with TestClient(app) as client, factory() as db:
        yield client, db
    settings.inference_provider = old_provider
    app.dependency_overrides.clear()
    engine.dispose()


def payload(**changes):
    data = dict(
        schema_version=1,
        message_id=str(uuid4()),
        station_id="s11",
        device_id="s11-monitor",
        measured_at=now().isoformat(),
        category="recyclable",
        fill_percentage=50,
        source="simulated",
        quality="valid",
    )
    return data | changes


def publish(db, data):
    return ingest(db, "waste/v1/stations/s11/s11-monitor/fill", data)


def jpeg():
    stream = io.BytesIO()
    Image.new("RGB", (16, 16), "green").save(stream, "JPEG")
    return stream.getvalue()


def classify(client, scenario="plastic", request_id=None, image=None):
    return client.post(
        "/api/classify",
        data={
            "station_id": "s11",
            "device_id": "s11-cam",
            "request_id": request_id or str(uuid4()),
            "scenario": scenario,
        },
        files={"image": ("test.jpg", image if image is not None else jpeg(), "image/jpeg")},
    )


def test_telemetry_dedup_order_and_invalid(system):
    client, db = system
    data = payload()
    assert publish(db, data)
    assert not publish(db, data)
    assert publish(db, payload(measured_at=(now() - timedelta(minutes=2)).isoformat(), fill_percentage=10))
    assert db.get(Compartment, "s11:recyclable").fill == 50
    assert db.scalar(select(func.count()).select_from(Telemetry)) == 2
    publish(db, payload(fill_percentage=None, quality="invalid"))
    assert db.get(Compartment, "s11:recyclable").fill is None
    result = client.get("/api/stations/s11").json()["compartments"][0]
    assert result["quality"] == "invalid"


@pytest.mark.parametrize(
    "changes",
    [
        dict(fill_percentage=101),
        dict(fill_percentage=-1),
        dict(fill_percentage=None),
        dict(quality="invalid"),
        dict(source="fake"),
        dict(schema_version=2),
        dict(measured_at="2026-01-01T00:00:00"),
        dict(device_id="s11-cam"),
        dict(measured_at=(now() + timedelta(hours=1)).isoformat()),
    ],
)
def test_rejects_invalid_telemetry(system, changes):
    _, db = system
    with pytest.raises(ValueError):
        publish(db, payload(**changes))
    assert db.scalar(select(func.count()).select_from(Message)) == 0


@pytest.mark.parametrize(
    "scenario,decision",
    [
        ("plastic", "recyclable"),
        ("battery", "e_waste"),
        ("trash", "non_recyclable"),
        ("low", "unknown"),
        ("unknown", "unknown"),
        ("ambiguous", "unknown"),
    ],
)
def test_classification_mapping_and_separate_outcome(system, scenario, decision):
    client, db = system
    response = classify(client, scenario)
    assert response.status_code == 200, response.text
    event = response.json()
    assert event["decision"] == decision
    assert event["outcome"] is None
    assert db.get(SortingEvent, event["id"]).outcome is None
    response = client.post(
        "/api/outcomes",
        json={
            "event_id": event["id"],
            "outcome": "disabled" if decision == "unknown" else "completed",
            "simulated": True,
        },
    )
    assert response.status_code == 200
    assert response.json()["simulated"]


def test_classify_retry_and_conflict(system):
    client, db = system
    rid = str(uuid4())
    one = classify(client, request_id=rid).json()
    assert classify(client, request_id=rid).json() == one
    assert classify(client, "battery", request_id=rid).status_code == 409
    assert db.scalar(select(func.count()).select_from(SortingEvent)) == 1


def test_upload_and_timeout(system):
    client, _ = system
    assert classify(client, image=b"not JPEG").status_code == 422
    assert classify(client, image=b"x" * (settings.max_upload_bytes + 1)).status_code == 413
    result = classify(client, "timeout")
    assert result.status_code == 504
    assert result.json()["error"]["request_id"]
    assert client.get("/api/events").json() == []


def test_collection_keeps_measurement(system):
    client, db = system
    publish(db, payload(fill_percentage=91))
    response = client.post(
        "/api/stations/s11/collections",
        json={"category": "recyclable", "operator": "Test operator", "note": "Test record"},
    )
    assert response.status_code == 201
    assert db.scalar(select(func.count()).select_from(Collection)) == 1
    db.expire_all()
    assert db.get(Compartment, "s11:recyclable").fill == 91
    assert len(client.get("/api/collections").json()) == 1
    assert client.get("/api/summary").json()["needing_collection"] == 1


def test_independent_device_offline_and_stale(system):
    client, db = system
    camera = db.get(Device, "s11-cam")
    camera.status = "online"
    camera.last_seen = now() - timedelta(seconds=settings.heartbeat_expiry + 1)
    db.commit()
    publish(db, payload())
    devices = {d["role"]: d for d in client.get("/api/stations/s11").json()["devices"]}
    assert devices["fill_monitor"]["online"]
    assert not devices["camera_sorter"]["online"]
    assert client.get("/api/stations/s12").json()["compartments"][0]["stale"]


def test_mqtt_outcome_and_role_checks(system):
    client, db = system
    event = classify(client).json()
    data = payload(device_id="s11-cam")
    for key in ["category", "fill_percentage", "source", "quality"]:
        data.pop(key)
    data.update(event_id=event["id"], outcome="completed", simulated=True)
    assert ingest(db, "waste/v1/stations/s11/s11-cam/outcome", data)
    assert not ingest(db, "waste/v1/stations/s11/s11-cam/outcome", data)
    db.expire_all()
    assert db.get(SortingEvent, event["id"]).outcome == "completed"
    assert (
        client.post("/api/outcomes", json={"event_id": event["id"], "outcome": "failed", "simulated": True}).status_code
        == 409
    )


def test_seed_is_repeatable(system):
    client, db = system
    seed(db)
    assert len(client.get("/api/stations").json()) == 12
    assert len(client.get("/api/floors").json()) == 5
    assert client.get("/api/ready").status_code == 200
    assert client.get("/api/stations/missing").status_code == 404
    assert {building["id"] for building in client.get("/api/buildings").json()} == {"campus", "mall"}
    floors = client.get("/api/floors").json()
    assert {floor["building_id"] for floor in floors if floor["id"].startswith("mall-floor-")} == {"mall"}
    mall = client.get("/api/stations/m11").json()
    assert mall["floor_id"] == "mall-floor-1"
    assert all(reading["source"] == "simulated" and reading["fill"] is None for reading in mall["compartments"])
    reading = db.get(Compartment, "s11:recyclable")
    reading.fill = 73
    reading.source = "sensor"
    reading.quality = "valid"
    reading.measured_at = now()
    db.commit()
    seed(db)
    db.refresh(reading)
    assert reading.fill == 73 and reading.source == "sensor" and reading.quality == "valid"


@pytest.mark.anyio
async def test_roboflow_format(monkeypatch):
    from app.inference import RoboflowProvider, normalize

    monkeypatch.setattr(settings, "roboflow_api_key", "test-only")
    captured = {}

    def respond(request):
        import json

        captured.update(json.loads(request.content))
        return httpx.Response(
            200, json={"outputs": [{"predictions": {"predictions": [{"class": "battery", "confidence": 0.9}]}}]}
        )

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs)
    )
    result = await RoboflowProvider().predict(jpeg(), "")
    assert normalize(result) == ("e_waste", None)
    assert captured["inputs"]["image"]["type"] == "base64"
    assert set(captured) == {"api_key", "inputs"}


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_heartbeat_out_of_order(system):
    client, db = system
    topic = "waste/v1/stations/s11/s11-cam/heartbeat"
    data = dict(
        schema_version=1,
        message_id=str(uuid4()),
        station_id="s11",
        device_id="s11-cam",
        measured_at=now().isoformat(),
        status="offline",
    )
    ingest(db, topic, data)
    ingest(
        db,
        topic,
        data
        | {"message_id": str(uuid4()), "measured_at": (now() - timedelta(minutes=2)).isoformat(), "status": "online"},
    )
    camera = next(d for d in client.get("/api/stations/s11").json()["devices"] if d["role"] == "camera_sorter")
    assert not camera["online"]


def test_sensor_source_and_old_invalid_reading(system):
    client, db = system
    publish(db, payload(source="sensor", fill_percentage=82))
    publish(
        db, payload(fill_percentage=None, quality="invalid", measured_at=(now() - timedelta(minutes=5)).isoformat())
    )
    c = next(c for c in client.get("/api/stations/s11").json()["compartments"] if c["category"] == "recyclable")
    assert c["fill"] == 82 and c["source"] == "sensor" and c["quality"] == "valid"
    publish(db, payload(source="sensor", fill_percentage=None, quality="missing"))
    db.expire_all()
    assert db.get(Compartment, "s11:recyclable").fill is None


def test_real_provider_timeout_never_falls_back(system, monkeypatch):
    client, _ = system
    monkeypatch.setattr(settings, "inference_provider", "roboflow")
    monkeypatch.setattr(settings, "roboflow_api_key", "test-only")

    def timeout(request):
        raise httpx.ReadTimeout("upstream timed out", request=request)

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(timeout), **kwargs)
    )
    result = classify(client)
    assert result.status_code == 504
    assert client.get("/api/events").json() == []


def test_unknown_cannot_be_reported_completed(system):
    client, _ = system
    event = classify(client, "unknown").json()
    assert (
        client.post(
            "/api/outcomes", json={"event_id": event["id"], "outcome": "completed", "simulated": True}
        ).status_code
        == 409
    )


@pytest.mark.parametrize(
    "output",
    [
        None,
        {},
        {"predictions": []},
        {"predictions": [{"class": "plastic", "confidence": 0.9}, {"class": "battery", "confidence": 0.9}]},
        {"top": "plastic", "confidence": "invalid"},
        {"top": "plastic", "confidence": float("nan")},
    ],
)
def test_roboflow_unsupported_outputs_are_unknown(output):
    from app.inference import normalize, parse_workflow

    prediction = parse_workflow({"outputs": [{"predictions": output}]})
    assert normalize(prediction)[0] == "unknown"
    assert prediction["confidence"] is None


def test_live_workflow_shape_preserves_model_and_raw_label(monkeypatch):
    import json
    from pathlib import Path

    from app.inference import normalize, parse_workflow

    monkeypatch.setattr(
        settings,
        "label_mapping",
        {"Recyclable": "recyclable", "Non-Recyclable": "non_recyclable", "E-Waste": "e_waste", "Empty": "unknown"},
    )
    body = json.loads((Path(__file__).parent / "fixtures/roboflow-classification.json").read_text())
    result = parse_workflow(body)
    assert result["raw_label"] == "Recyclable"
    assert result["confidence"] == 0.9851
    assert result["model"] == "waste-classifier-psdrg-0mtyc/1"
    assert normalize(result) == ("recyclable", None)


@pytest.mark.parametrize(
    "label,expected",
    [("Recyclable", "recyclable"), ("Non-Recyclable", "non_recyclable"), ("E-Waste", "e_waste"), ("Empty", "unknown")],
)
def test_verified_project_labels(monkeypatch, label, expected):
    from app.inference import normalize

    monkeypatch.setattr(
        settings,
        "label_mapping",
        {"Recyclable": "recyclable", "Non-Recyclable": "non_recyclable", "E-Waste": "e_waste", "Empty": "unknown"},
    )
    decision, reason = normalize({"raw_label": label, "confidence": 0.99})
    assert decision == expected
    if label == "Empty":
        assert "reject sorting" in reason


def test_real_upstream_error_is_not_mocked(system, monkeypatch):
    client, _ = system
    monkeypatch.setattr(settings, "inference_provider", "roboflow")
    monkeypatch.setattr(settings, "roboflow_api_key", "test-only")
    original = httpx.AsyncClient

    def rejected(request):
        return httpx.Response(403, json={"error": "invalid key"}, request=request)

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(rejected), **kwargs)
    )
    response = classify(client)
    assert response.status_code == 502
    assert "no fallback" in response.json()["error"]["message"]
    assert client.get("/api/events").json() == []


def test_inference_lab_is_independent_and_does_not_record_sorting(system):
    client, db = system
    config = client.get("/api/inference/config").json()
    assert config["max_upload_bytes"] == settings.max_upload_bytes
    assert config["max_pixels"] == 20_000_000
    before = db.scalar(select(func.count()).select_from(SortingEvent))
    response = client.post("/api/inference/test", data={"scenario": "battery"},
                           files={"image": ("battery.jpg", jpeg(), "image/jpeg")})
    assert response.status_code == 200
    assert response.json()["decision"] == "e_waste"
    assert "station_id" not in response.json()
    assert db.scalar(select(func.count()).select_from(SortingEvent)) == before
    assert client.post("/api/inference/test", files={"image": ("bad.jpg", b"bad", "image/jpeg")}).status_code == 422
    assert client.post("/api/inference/test", files={"image": ("big.jpg", b"x" * (settings.max_upload_bytes + 1), "image/jpeg")}).status_code == 413
    assert client.post("/api/inference/test", data={"scenario": "timeout"},
                       files={"image": ("test.jpg", jpeg(), "image/jpeg")}).status_code == 504
