import { binAttentionKind, matchesAttention } from "@/lib/bin-attention";
import type { AttentionFilter } from "@/lib/bin-attention";
import { useId } from "react";
import {
  elevator,
  entrance,
  floorRooms,
  footprint,
  stairs,
  atrium,
} from "./layout";
import type { Building, Floor } from "./layout";
import type { Station } from "@/api";
export function FloorPlan({
  building,
  floor,
  level,
  stations,
  selectedId,
  onSelect,
  attention = "all",
}: {
  building: Building;
  floor: Floor;
  level: number;
  stations: Station[];
  selectedId?: string;
  onSelect: (bin: Station, anchor?: Element) => void;
  attention?: AttentionFilter;
}) {
  const gridId = `plan-grid-${useId().replaceAll(":", "")}`;
  return (
    <svg
      viewBox="0 0 100 92"
      className="floor-plan-svg"
      role="group"
      aria-label={`${building.name} ${floor.name} floor plan`}
    >
      <title>
        {building.name} · {floor.name}
      </title>
      <defs>
        <pattern id={gridId} width="5" height="5" patternUnits="userSpaceOnUse">
          <path
            d="M5 0H0V5"
            fill="none"
            stroke="var(--border)"
            strokeWidth=".15"
          />
        </pattern>
      </defs>
      <rect width="100" height="92" fill={`url(#${gridId})`} />
      <rect
        x={footprint.x}
        y={footprint.y}
        width={footprint.width}
        height={footprint.depth}
        rx="1"
        fill="var(--background)"
        stroke="var(--muted-foreground)"
        strokeWidth=".7"
      />
      {floorRooms(building.id, level).map((room) => (
        <g key={room.name}>
          <rect
            x={room.x}
            y={room.y}
            width={room.width}
            height={room.depth}
            rx=".5"
            fill="var(--muted)"
            stroke="var(--border)"
            strokeWidth=".4"
          />
          <text x={room.x + 2} y={room.y + 4} className="plan-room-label">
            {room.name}
          </text>
        </g>
      ))}
      <text x="50" y="46" textAnchor="middle" className="plan-small-label">
        {building.id === "mall" ? "ATRIUM" : "CORRIDOR"}
      </text>
      {building.id === "mall" && level > 0 && (
        <rect
          x={atrium.x}
          y={atrium.y}
          width={atrium.width}
          height={atrium.depth}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth=".4"
          strokeDasharray="1 1"
        />
      )}
      <g aria-label="Elevator">
        <rect
          x={elevator.x}
          y={elevator.y}
          width={elevator.width}
          height={elevator.depth}
          rx=".5"
          fill="var(--card)"
          stroke="var(--muted-foreground)"
          strokeWidth=".4"
        />
        <path
          d="M48 59v4m-1-3 1-1 1 1m3 3v-4m-1 3 1 1 1-1"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth=".4"
        />
        <text x="50" y="70" textAnchor="middle" className="plan-small-label">
          ELEVATOR
        </text>
      </g>
      <g aria-label="Stairs">
        <rect
          x={stairs.x}
          y={stairs.y}
          width={stairs.width}
          height={stairs.depth}
          fill="var(--card)"
          stroke="var(--border)"
          strokeWidth=".4"
        />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M46 ${20 + i * 2}h8`}
            stroke="var(--muted-foreground)"
            strokeWidth=".4"
          />
        ))}
        <text x="50" y="33" textAnchor="middle" className="plan-small-label">
          STAIRS
        </text>
      </g>
      {level === 0 && (
        <g aria-label="Main entrance">
          <path
            d={`M${entrance.x - 5} ${entrance.y}h10`}
            stroke="var(--background)"
            strokeWidth="1.4"
          />
          <path
            d={`M${entrance.x} ${entrance.y + 7}v-5m-2 2 2-2 2 2`}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth=".5"
          />
          <text
            x={entrance.x}
            y={entrance.y + 11}
            textAnchor="middle"
            className="plan-small-label"
          >
            ENTRANCE
          </text>
        </g>
      )}
      {stations
        .filter((bin) => bin.floor_id === floor.id)
        .map((bin) => (
          <g
            key={bin.id}
            role="button"
            tabIndex={0}
            aria-label={`Select ${bin.name} on ${floor.name}`}
            aria-pressed={selectedId === bin.id}
            className="plan-bin"
            data-dimmed={!matchesAttention(bin, attention)}
            data-attention={binAttentionKind(bin)}
            data-bin-id={bin.id}
            onClick={(event) => onSelect(bin, event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(bin, event.currentTarget);
              }
            }}
          >
            <rect
              x={bin.x - 7}
              y={bin.y - 7}
              width="14"
              height="14"
              fill="transparent"
            />
            <title>
              {bin.name} · {bin.id.toUpperCase()}
            </title>
            {binAttentionKind(bin) !== "none" && (
              <circle
                className="plan-bin-status"
                cx={bin.x + 4.5}
                cy={bin.y - 4.5}
                r="1.4"
              />
            )}
            <rect
              x={bin.x - 5}
              y={bin.y - 4}
              width="10"
              height="8"
              rx="2"
              className="plan-bin-body"
              fill={selectedId === bin.id ? "var(--primary)" : "var(--card)"}
              stroke="var(--primary)"
              strokeWidth={selectedId === bin.id ? ".8" : ".45"}
            />
            <path
              d={`M${bin.x - 2} ${bin.y - 2}h4`}
              stroke={
                selectedId === bin.id
                  ? "var(--primary-foreground)"
                  : "var(--primary)"
              }
              strokeWidth=".7"
            />
            <text
              x={bin.x}
              y={bin.y + 1.5}
              textAnchor="middle"
              className="plan-bin-label"
              fill={
                selectedId === bin.id
                  ? "var(--primary-foreground)"
                  : "var(--primary)"
              }
            >
              {bin.id.toUpperCase()}
            </text>
          </g>
        ))}
    </svg>
  );
}
