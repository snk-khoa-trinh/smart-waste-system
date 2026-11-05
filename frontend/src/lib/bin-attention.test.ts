import { describe, expect, it } from "vitest";
import { binAttention } from "./bin-attention";
import type { Compartment, Station } from "../api";
const sensor: Compartment = {
  category: "recyclable",
  source: "sensor",
  fill: 90,
  quality: "valid",
  stale: false,
  measured_at: "2026-11-03T09:00:00Z",
};
const bin = (compartments: Compartment[], online = true): Station => ({
  id: "s11",
  floor_id: "floor-1",
  name: "Bin",
  x: 0,
  y: 0,
  compartments,
  devices: [{ id: "s11-cam", role: "camera_sorter", online, last_seen: null }],
});
describe("collection work from real sensor data", () => {
  it("ignores high demo fills and offline demo boards", () => {
    const result = binAttention(
      bin([{ ...sensor, source: "simulated", fill: 100 }], false),
    );
    expect(result.monitored).toBe(false);
    expect(result.collection).toHaveLength(0);
    expect(result.needsChecking).toBe(false);
  });
  it("routes stale or missing measurements to checking instead of collection", () => {
    for (const reading of [
      { ...sensor, stale: true },
      { ...sensor, fill: null, quality: "missing" },
      { ...sensor, measured_at: null },
      { ...sensor, quality: "invalid" },
    ]) {
      const result = binAttention(bin([reading]));
      expect(result.collection).toHaveLength(0);
      expect(result.needsChecking).toBe(true);
    }
  });
  it("allows collecting a fresh full compartment while a board needs checking", () => {
    const result = binAttention(
      bin(
        [
          sensor,
          { ...sensor, category: "e_waste", source: "simulated", fill: 100 },
        ],
        false,
      ),
    );
    expect(result.collection).toHaveLength(1);
    expect(result.needsChecking).toBe(true);
  });
});
