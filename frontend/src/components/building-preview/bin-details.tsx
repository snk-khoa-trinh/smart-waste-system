import { Link } from "@tanstack/react-router";
import { ArrowUpRight, X } from "lucide-react";
import type { Station } from "@/api";
import { fillText, labels } from "@/api";
import { binAttention } from "@/lib/bin-attention";
import { date } from "@/lib/dashboard";
import { Button } from "@/components/ui/button";
export function BinDetails({
  bin,
  floorName,
  available,
  onClose,
}: {
  bin: Station;
  floorName?: string;
  available: boolean;
  onClose: () => void;
}) {
  const attention = binAttention(bin);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="selected-bin-title">{bin.name}</h3>
          <p className="text-xs text-muted-foreground">
            {bin.id.toUpperCase()}
            {floorName ? ` · ${floorName}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close bin details"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {!available && (
        <p className="text-xs text-destructive">
          Cached readings · refresh failed
        </p>
      )}
      {!attention.monitored && (
        <p className="text-xs text-muted-foreground">
          Demo bin · no live sensor readings
        </p>
      )}
      {attention.collection.length > 0 && (
        <p className="text-xs">
          Collection alert:{" "}
          {attention.collection
            .map((reading) => labels[reading.category])
            .join(", ")}
        </p>
      )}
      {attention.needsChecking && (
        <p className="text-xs">
          Needs checking:{" "}
          {attention.missing
            ? "sensor readings are unavailable or out of date"
            : "a board is offline"}
          .
        </p>
      )}
      <dl className="space-y-2 text-sm">
        {bin.compartments.map((reading) => (
          <div
            className="flex items-center justify-between gap-3"
            key={reading.category}
          >
            <dt>
              {labels[reading.category]}
              <span className="ml-2 text-xs text-muted-foreground">
                {reading.source === "sensor" ? "Sensor" : "Demo"}
              </span>
            </dt>
            <dd
              className="font-medium"
              title={
                reading.measured_at
                  ? `Last recorded ${reading.fill ?? "unknown"}% · ${date(reading.measured_at)}`
                  : "No measurement received"
              }
            >
              {reading.stale &&
              reading.measured_at &&
              reading.quality === "valid"
                ? "Out of date"
                : fillText(reading)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t pt-3 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {bin.devices.map((device) => (
            <span
              key={device.id}
              title={`Last heartbeat: ${date(device.last_seen)}`}
              className={device.online ? "online" : "text-muted-foreground"}
            >
              {device.role === "camera_sorter" ? "Camera" : "Brain"}:{" "}
              {device.online
                ? "Online"
                : device.last_seen
                  ? "Offline"
                  : "No heartbeat"}
            </span>
          ))}
        </div>
      </div>
      <Button asChild className="w-full">
        <Link to="/bins/$stationId" params={{ stationId: bin.id }}>
          Open bin <ArrowUpRight />
        </Link>
      </Button>
    </div>
  );
}
