import { useState } from "react";
import type { Station } from "@/api";
import { labels } from "@/api";
import { date } from "@/lib/dashboard";
import type {
  CollectionRoute,
  RouteLeg,
  RouteStop,
} from "@/lib/collection-route";
import {
  directionArrows,
  floorSegments,
  minutes,
} from "@/lib/collection-route";
import { FloorPlan } from "@/components/building-preview/floor-plan";
import type { Floor } from "@/components/building-preview/layout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function BinFillSummary({
  bin,
  demo,
  generatedAt,
  dataState = "ready",
}: {
  bin: Station;
  demo: boolean;
  generatedAt: string;
  dataState?: "ready" | "loading" | "error";
}) {
  return (
    <div className="space-y-2 text-xs">
      <p className="font-semibold">
        {bin.id.toUpperCase()} · {bin.name}
      </p>
      <p>
        {demo
          ? "Synthetic route scenario"
          : dataState === "error"
            ? "Cached readings · refresh failed"
            : "Current readings · route is a separate snapshot"}
      </p>
      {dataState === "loading" ? (
        <p>Loading current readings…</p>
      ) : (
        <dl className="space-y-2">
          {(Object.keys(labels) as (keyof typeof labels)[]).map((category) => {
            const reading = bin.compartments.find(
              (item) => item.category === category,
            );
            const value =
              reading?.quality === "valid" && reading.fill !== null
                ? `${Math.round(reading.fill)}%`
                : reading?.quality === "invalid"
                  ? "Invalid"
                  : "Missing";
            return (
              <div
                key={category}
                className="flex items-start justify-between gap-4"
              >
                <dt>
                  {labels[category]}
                  <span className="block opacity-75">
                    {reading
                      ? `${reading.source === "sensor" ? "Sensor" : "Synthetic"}${reading.stale ? " · stale" : ""}`
                      : "No reading"}
                  </span>
                </dt>
                <dd
                  className="font-semibold tabular-nums"
                  title={
                    reading?.measured_at
                      ? date(reading.measured_at)
                      : "No measurement"
                  }
                >
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="opacity-75">
        {demo
          ? `Scenario: ${date(generatedAt)}`
          : `Measured: ${date(bin.compartments.find((c) => c.measured_at)?.measured_at || null)}`}
      </p>
    </div>
  );
}

export function CollectionRouteMap({
  plan,
  floor,
  stations,
  stops,
  legs,
  selectedId,
  onSelect,
  readingsState,
}: {
  plan: CollectionRoute;
  floor: Floor;
  stations: Station[];
  stops: RouteStop[];
  legs: RouteLeg[];
  selectedId?: string;
  onSelect: (bin: Station) => void;
  readingsState: "ready" | "loading" | "error";
}) {
  const [view, setView] = useState("selected");
  const activeLeg = legs.find((leg) => leg.to_id === selectedId);
  const activeStop = stops.find((stop) => stop.id === selectedId);
  const segments = floorSegments(legs, floor.id);
  const activeSegments = segments.filter(
    (segment) => segment.leg === activeLeg?.index,
  );
  const fromStop = stops.find((stop) => stop.id === activeLeg?.from_id);
  const fromFloor = plan.floors.find(
    (item) => item.id === activeLeg?.points[0]?.floor_id,
  );
  const transitions =
    activeLeg?.points.filter(
      (node, index, points) =>
        index > 0 && node.floor_id !== points[index - 1].floor_id,
    ) || [];
  const transitionNodes =
    activeLeg?.points.filter(
      (node, index, points) =>
        node.floor_id === floor.id &&
        ((points[index - 1]?.floor_id &&
          points[index - 1].floor_id !== node.floor_id) ||
          (points[index + 1]?.floor_id &&
            points[index + 1].floor_id !== node.floor_id)),
    ) || [];
  const startNode = plan.nodes.find((node) => node.id === plan.start_node_id);
  function routeLines(items: typeof segments, active: boolean) {
    return items.map((segment, index) => {
      const returning =
        legs.find((leg) => leg.index === segment.leg)?.to_id === "start";
      const color = returning
        ? "var(--route-return)"
        : active
          ? "var(--route-active)"
          : "var(--route-other)";
      return (
        <g
          key={`${segment.leg}-${index}`}
          data-route-leg={segment.leg}
          data-active-leg={active}
        >
          <line
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            stroke="var(--background)"
            strokeWidth={active ? 2.1 : 1.45}
            strokeLinecap="round"
          />
          <line
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            stroke={color}
            strokeWidth={active ? 1.2 : 0.7}
            strokeLinecap="round"
            opacity={active ? 1 : 0.7}
            strokeDasharray={returning && !active ? "2 1" : undefined}
          />
          {directionArrows(segment.from, segment.to).map((arrow, i) => (
            <path
              key={i}
              data-route-arrow="true"
              d="M-1 -1 0 0 -1 1"
              transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
              fill="none"
              stroke={color}
              strokeWidth={active ? 0.8 : 0.55}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      );
    });
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" role="status" aria-label="Selected route leg">
          {activeLeg && (activeStop || activeLeg.to_id === "start") ? (
            <>
              <strong>Leg {activeLeg.index}:</strong>{" "}
              {fromStop
                ? `Stop ${fromStop.order} · ${fromStop.id.toUpperCase()}`
                : "Start"}{" "}
              →{" "}
              <strong>
                {activeStop
                  ? `Stop ${activeStop.order} · ${activeStop.id.toUpperCase()}`
                  : "Start / finish"}
              </strong>
              <span className="block text-xs text-muted-foreground">
                {minutes(activeLeg.seconds)} travel
                {transitions.length
                  ? ` · ${plan.travel_mode}: ${fromFloor?.name} → ${plan.floors.find((f) => f.id === transitions.at(-1)?.floor_id)?.name}`
                  : ` · ${floor.name}`}
              </span>
            </>
          ) : (
            "Select a numbered stop to see its approach."
          )}
        </p>
        <Tabs value={view} onValueChange={setView}>
          <TabsList aria-label="Path visibility">
            <TabsTrigger value="selected">Selected leg</TabsTrigger>
            <TabsTrigger value="all">All legs</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <FloorPlan
        building={plan.building}
        floor={floor}
        level={plan.floors.findIndex((f) => f.id === floor.id)}
        stations={stations}
        selectedId={selectedId}
        onSelect={onSelect}
        binPreview={(bin) => (
          <BinFillSummary
            bin={bin}
            demo={plan.source === "demo"}
            generatedAt={plan.generated_at}
            dataState={readingsState}
          />
        )}
        binAccent={(bin) =>
          bin.id === selectedId
            ? {
                color: "var(--route-active)",
                foreground: "var(--route-foreground)",
              }
            : undefined
        }
        overlay={
          <g aria-label="Directional walking paths" pointerEvents="none">
            {plan.edges
              .filter((edge) => edge.kind === "walk")
              .map((edge) => {
                const a = plan.nodes.find((n) => n.id === edge.a)!;
                const b = plan.nodes.find((n) => n.id === edge.b)!;
                return a.floor_id === floor.id && b.floor_id === floor.id ? (
                  <line
                    key={`${a.id}-${b.id}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--muted-foreground)"
                    strokeWidth=".25"
                    strokeDasharray="1 1.5"
                    opacity=".4"
                  />
                ) : null;
              })}
            {view === "all"
              ? routeLines(
                  segments.filter((s) => s.leg !== activeLeg?.index),
                  false,
                )
              : segments
                  .filter((s) => s.leg !== activeLeg?.index)
                  .map((segment, i) => (
                    <line
                      key={i}
                      x1={segment.from.x}
                      y1={segment.from.y}
                      x2={segment.to.x}
                      y2={segment.to.y}
                      stroke="var(--muted-foreground)"
                      strokeWidth=".45"
                      opacity=".15"
                    />
                  ))}
            {routeLines(activeSegments, true)}
            {transitionNodes.map((node) => (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="2.4"
                  fill="var(--route-active)"
                  stroke="var(--background)"
                  strokeWidth=".6"
                />
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  fontSize="3"
                  fill="var(--route-foreground)"
                >
                  ↕
                </text>
              </g>
            ))}
            {startNode?.floor_id === floor.id && (
              <g aria-label="Route start and finish">
                <circle
                  cx={startNode.x}
                  cy={startNode.y}
                  r="2.6"
                  fill="var(--route-return)"
                  stroke="var(--background)"
                  strokeWidth=".5"
                />
                <text
                  x={startNode.x}
                  y={startNode.y + 0.9}
                  textAnchor="middle"
                  fontSize="2.6"
                  fill="var(--route-foreground)"
                >
                  S
                </text>
              </g>
            )}
            {stops
              .filter((stop) => stop.floor_id === floor.id)
              .map((stop) => (
                <g key={stop.id}>
                  <circle
                    cx={stop.x + 6}
                    cy={stop.y - 6}
                    r="2.8"
                    fill={
                      stop.id === selectedId
                        ? "var(--route-active)"
                        : "var(--background)"
                    }
                    stroke={
                      stop.id === selectedId
                        ? "var(--route-active)"
                        : "var(--route-other)"
                    }
                    strokeWidth=".6"
                  />
                  <text
                    x={stop.x + 6}
                    y={stop.y - 5}
                    fontSize="2.7"
                    fontWeight="600"
                    textAnchor="middle"
                    fill={
                      stop.id === selectedId
                        ? "var(--route-foreground)"
                        : "var(--route-other)"
                    }
                  >
                    {stop.order}
                  </text>
                </g>
              ))}
          </g>
        }
      />
      <div
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        aria-label="Route legend"
      >
        <span className="flex items-center gap-1.5">
          <span
            className="h-1 w-5 rounded"
            style={{
              background:
                activeLeg?.to_id === "start"
                  ? "var(--route-return)"
                  : "var(--route-active)",
            }}
          />
          {activeLeg?.to_id === "start"
            ? "Return to start →"
            : "Selected approach →"}
        </span>
        {view === "all" && (
          <>
            <span className="flex items-center gap-1.5">
              <span
                className="h-1 w-5 rounded"
                style={{ background: "var(--route-other)" }}
              />
              Other legs →
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-1 w-5 rounded"
                style={{ background: "var(--route-return)" }}
              />
              Return →
            </span>
          </>
        )}
        <span>
          S: start/finish · ↕: floor connection · numbers: stop order
        </span>
      </div>
    </>
  );
}
