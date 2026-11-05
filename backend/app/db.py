from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings


def now():
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Building(Base):
    __tablename__ = "buildings"
    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]


class Floor(Base):
    __tablename__ = "floors"
    id: Mapped[str] = mapped_column(primary_key=True)
    building_id: Mapped[str] = mapped_column(ForeignKey("buildings.id"))
    name: Mapped[str]


class Station(Base):
    __tablename__ = "stations"
    id: Mapped[str] = mapped_column(primary_key=True)
    floor_id: Mapped[str] = mapped_column(ForeignKey("floors.id"))
    name: Mapped[str]
    x: Mapped[float]
    y: Mapped[float]


class Compartment(Base):
    __tablename__ = "compartments"
    id: Mapped[str] = mapped_column(primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("stations.id"))
    category: Mapped[str]
    source: Mapped[str]
    fill: Mapped[float | None]
    quality: Mapped[str] = mapped_column(default="missing")
    measured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("stations.id"))
    role: Mapped[str]
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(default="offline")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)


class Telemetry(Base):
    __tablename__ = "telemetry"
    id: Mapped[str] = mapped_column(primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("stations.id"), index=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"))
    category: Mapped[str]
    fill: Mapped[float | None]
    source: Mapped[str]
    quality: Mapped[str]
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SortingEvent(Base):
    __tablename__ = "sorting_events"
    id: Mapped[str] = mapped_column(primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("stations.id"), index=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"))
    fingerprint: Mapped[str]
    decision: Mapped[str]
    confidence: Mapped[float | None]
    raw_label: Mapped[str | None]
    provider: Mapped[str]
    model: Mapped[str]
    reason: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    outcome: Mapped[str | None]
    outcome_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    simulated: Mapped[bool] = mapped_column(default=False)


class Collection(Base):
    __tablename__ = "collections"
    id: Mapped[str] = mapped_column(primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("stations.id"), index=True)
    category: Mapped[str]
    operator: Mapped[str] = mapped_column(String(100))
    note: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


engine = create_engine(settings.database_url)
Session = sessionmaker(engine, expire_on_commit=False)
