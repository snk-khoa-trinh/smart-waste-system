import type { Category } from "@/api";
import type { Building, Floor } from "@/components/building-preview/layout";
export type RouteNode = {
  id: string;
  floor_id: string;
  x: number;
  y: number;
  kind: string;
};
export type RouteLeg = {
  index: number;
  from_id: string;
  to_id: string;
  seconds: number;
  points: RouteNode[];
};
export type RouteStop = {
  id: string;
  name: string;
  floor_id: string;
  x: number;
  y: number;
  order: number;
  compartments: { category: Category; fill: number; source: string }[];
};
export type CollectionRoute = {
  building: Building;
  source: "live" | "demo";
  generated_at: string;
  threshold: number;
  travel_mode: string;
  start_node_id: string;
  floors: Floor[];
  nodes: RouteNode[];
  edges: {
    a: string;
    b: string;
    kind: string;
    seconds: number;
    meters: number;
  }[];
  start_options: RouteNode[];
  bins: {
    id: string;
    name: string;
    floor_id: string;
    x: number;
    y: number;
    values: RouteStop["compartments"];
  }[];
  stops: RouteStop[];
  excluded: { id: string; name: string; reason: string }[];
  legs: RouteLeg[];
  baseline_legs: RouteLeg[];
  baseline_order: string[];
  algorithm: string;
  optimal_for_modeled_graph: boolean;
  assumptions: string[];
  summary: {
    total_bins: number;
    stops: number;
    walking_meters: number;
    travel_seconds: number;
    service_seconds: number;
    total_seconds: number;
    baseline_travel_seconds: number;
    baseline_walking_meters: number;
    saved_travel_seconds: number;
    saved_percent: number;
  };
};
export const minutes = (seconds: number) => `${(seconds / 60).toFixed(1)} min`;
/** Break paths at floor transitions: never join two floors with a diagonal line. */
export function floorSegments(legs: RouteLeg[], floorId: string) {
  return legs.flatMap((leg) =>
    leg.points.slice(1).flatMap((point, index) => {
      const previous = leg.points[index];
      return point.floor_id === floorId && previous.floor_id === floorId
        ? [{ from: previous, to: point, leg: leg.index }]
        : [];
    }),
  );
}

/** Direction marks stay on the actual graph segment; zero-length/floor links get none. */
export function directionArrows(from: RouteNode, to: RouteNode) {
  if (from.floor_id !== to.floor_id) return [];
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 3) return [];
  const count = Math.max(1, Math.floor(length / 6));
  return Array.from({ length: count }, (_, index) => ({
    x: from.x + (dx * (index + 0.5)) / count,
    y: from.y + (dy * (index + 0.5)) / count,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  }));
}
