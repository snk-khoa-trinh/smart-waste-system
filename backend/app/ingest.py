from datetime import UTC

from .contracts import Fill, Heartbeat, SortingOutcome
from .db import Compartment, Device, Message, SortingEvent, Telemetry


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def report_outcome(db, event, outcome, measured_at):
    if event.outcome is not None:
        if event.outcome != outcome.outcome or event.simulated != outcome.simulated:
            raise ValueError("Conflicting sorting outcome")
        return
    if outcome.outcome == "completed" and event.decision == "unknown":
        raise ValueError("Rejected classification cannot complete sorting")
    event.outcome = outcome.outcome
    event.outcome_at = measured_at
    event.simulated = outcome.simulated


def ingest(db, topic, payload):
    parts = topic.split("/")
    if len(parts) != 6 or parts[:2] != ["waste", "v1"] or parts[2] != "stations":
        raise ValueError("Invalid topic")
    kind = parts[5]
    cls = {"fill": Fill, "heartbeat": Heartbeat, "outcome": SortingOutcome}.get(kind)
    if cls is None:
        raise ValueError("Unknown message type")
    msg = cls.model_validate(payload)
    if [msg.station_id, msg.device_id] != parts[3:5]:
        raise ValueError("Topic identity mismatch")
    device = db.get(Device, msg.device_id)
    if not device or device.station_id != msg.station_id:
        raise ValueError("Unknown station/device pair")
    if (kind == "fill" and device.role != "fill_monitor") or (kind == "outcome" and device.role != "camera_sorter"):
        raise ValueError("Device role mismatch")
    mid = str(msg.message_id)
    if db.get(Message, mid):
        return False
    if kind == "fill":
        compartment = db.get(Compartment, f"{msg.station_id}:{msg.category}")
        if not compartment:
            raise ValueError("Unknown compartment")
        db.add(
            Telemetry(
                id=mid,
                station_id=msg.station_id,
                device_id=msg.device_id,
                category=msg.category,
                fill=msg.fill_percentage,
                source=msg.source,
                quality=msg.quality,
                measured_at=msg.measured_at,
            )
        )
        if compartment.measured_at is None or msg.measured_at > utc(compartment.measured_at):
            compartment.fill = msg.fill_percentage
            compartment.quality = msg.quality
            compartment.source = msg.source
            compartment.measured_at = msg.measured_at
    elif kind == "outcome":
        event = db.get(SortingEvent, str(msg.event_id))
        if not event or event.device_id != msg.device_id or event.station_id != msg.station_id:
            raise ValueError("Unknown sorting event for this device")
        if msg.measured_at < utc(event.created_at):
            raise ValueError("Outcome predates classification")
        report_outcome(db, event, msg, msg.measured_at)
    if device.last_seen is None or msg.measured_at > utc(device.last_seen):
        device.last_seen = msg.measured_at
        device.status = msg.status if kind == "heartbeat" else "online"
    db.add(Message(id=mid, payload=payload))
    db.commit()
    return True
