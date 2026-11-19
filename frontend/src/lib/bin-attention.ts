import type { Compartment, Station } from "../api";
export function isCurrentSensorReading(reading: Compartment) {
  return (
    reading.source === "sensor" &&
    reading.quality === "valid" &&
    !reading.stale &&
    reading.measured_at !== null &&
    reading.fill !== null &&
    Number.isFinite(reading.fill)
  );
}
export function binAttention(bin: Station) {
  const sensors = bin.compartments.filter(
    (reading) => reading.source === "sensor",
  );
  const collection = sensors.filter(
    (reading) => isCurrentSensorReading(reading) && reading.fill! >= 80,
  );
  const missing = sensors.some((reading) => !isCurrentSensorReading(reading));
  const offline = bin.devices.some((device) => !device.online);
  return {
    monitored: sensors.length > 0,
    collection,
    needsChecking: sensors.length > 0 && (missing || offline),
    missing,
    offline,
  };
}

export type AttentionFilter = "all" | "collection" | "checking";
export function matchesAttention(bin: Station, filter: AttentionFilter) {
  const attention = binAttention(bin);
  return (
    filter === "all" ||
    (filter === "collection"
      ? attention.collection.length > 0
      : attention.needsChecking)
  );
}
export function binAttentionKind(bin: Station) {
  const attention = binAttention(bin);
  return attention.needsChecking
    ? "checking"
    : attention.collection.length
      ? "collection"
      : "none";
}
