import { describe, expect, it } from "vitest";
import { floorSegments } from "./collection-route";

describe("route floor projection", () => {
  it("splits a path at a floor transition instead of drawing between floors", () => {
    const points = [
      { id: "a", floor_id: "f1", x: 10, y: 20, kind: "corridor" },
      { id: "b", floor_id: "f1", x: 50, y: 20, kind: "stairs" },
      { id: "c", floor_id: "f2", x: 50, y: 20, kind: "stairs" },
      { id: "d", floor_id: "f2", x: 70, y: 20, kind: "corridor" },
    ];
    const leg = {
      index: 1,
      from_id: "start",
      to_id: "bin",
      seconds: 100,
      points,
    };
    expect(floorSegments([leg], "f1")).toEqual([
      { from: points[0], to: points[1], leg: 1 },
    ]);
    expect(floorSegments([leg], "f2")).toEqual([
      { from: points[2], to: points[3], leg: 1 },
    ]);
    expect(floorSegments([leg], "f3")).toEqual([]);
  });
});

it("points arrows along the graph edge and omits floor/zero-length links", async () => {
  const { directionArrows } = await import("./collection-route");
  const start = { id: "a", floor_id: "f1", x: 20, y: 26, kind: "corridor" };
  const right = { ...start, id: "b", x: 40 };
  const up = { ...start, id: "c", y: 15 };
  const arrows = directionArrows(start, right);
  expect(arrows.length).toBeGreaterThan(0);
  expect(
    arrows.every((a) => a.x > 20 && a.x < 40 && a.y === 26 && a.angle === 0),
  ).toBe(true);
  expect(directionArrows(start, up).every((a) => a.angle === -90)).toBe(true);
  expect(directionArrows(right, start).every((a) => a.angle === 180)).toBe(
    true,
  );
  expect(directionArrows(start, { ...right, floor_id: "f2" })).toEqual([]);
  expect(directionArrows(start, start)).toEqual([]);
});
