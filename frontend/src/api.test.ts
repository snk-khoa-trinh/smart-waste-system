import { describe, expect, it, vi } from "vitest";
import { api, fillText } from "./api";

describe("measurement display", () => {
  it("does not display invalid readings as empty compartments", () => {
    expect(
      fillText({
        category: "e_waste",
        fill: null,
        quality: "invalid",
        source: "sensor",
        stale: false,
        measured_at: null,
      }),
    ).toBe("invalid");
    expect(
      fillText({
        category: "recyclable",
        fill: 0,
        quality: "valid",
        source: "simulated",
        stale: false,
        measured_at: null,
      }),
    ).toBe("0%");
  });
  it("exposes backend errors to dashboard callers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Inference timed out" } }),
      }),
    );
    await expect(api("/classify")).rejects.toThrow("Inference timed out");
    vi.unstubAllGlobals();
  });
});

describe("chart data", () => {
  it("keeps invalid readings null while aligning compartment times", async () => {
    const { chartReadings } = await import("./api");
    const rows = chartReadings([
      {
        id: "a",
        category: "e_waste",
        fill: null,
        source: "simulated",
        quality: "invalid",
        measured_at: "2026-11-01T08:00:00.900Z",
      },
      {
        id: "b",
        category: "recyclable",
        fill: 45,
        source: "simulated",
        quality: "valid",
        measured_at: "2026-11-01T08:00:00.100Z",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].e_waste).toBeNull();
    expect(rows[0].recyclable).toBe(45);
  });
});
