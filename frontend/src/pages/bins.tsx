import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { Station } from "@/api";
import { fillText, labels } from "@/api";
import { useAPI } from "@/lib/dashboard";
import { FillHistory } from "@/components/dashboard/fill-history";
import { SortingActivity } from "@/components/dashboard/sorting-activity";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTooltip } from "@/components/info-tooltip";
import { binAttention } from "@/lib/bin-attention";
import type { Building, Floor } from "@/components/building-preview/layout";
import { Button } from "@/components/ui/button";
function DeviceStatus({ station }: { station: Station }) {
  return (
    <div className="device-line">
      {!station.devices.length && <span>No boards registered</span>}
      {station.devices.map((d) => (
        <span key={d.id} className={d.online ? "online" : "offline"}>
          {d.role === "camera_sorter" ? "Camera" : "Brain"}{" "}
          {d.online ? "online" : "offline"}
        </span>
      ))}
    </div>
  );
}
function CompartmentFills({ station }: { station: Station }) {
  return (
    <div className="mini-fills">
      {station.compartments.map((c) => (
        <div key={c.category}>
          <div>
            <span>{labels[c.category]}</span>
            <b>
              {c.stale && c.quality === "valid" && c.measured_at
                ? "Out of date"
                : fillText(c)}
            </b>
          </div>
          <div className="track">
            <i
              className={c.category}
              style={{ width: `${c.quality === "valid" ? (c.fill ?? 0) : 0}%` }}
            />
          </div>
          <small>
            {c.source === "simulated" ? "Synthetic" : "Sensor"}
            {c.stale ? " · stale" : ""}
          </small>
        </div>
      ))}
    </div>
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
function BinLocation({ station }: { station: Station }) {
  const floors = useAPI<Floor[]>("/floors");
  const buildings = useAPI<Building[]>("/buildings");
  const floor = floors.data?.find((f) => f.id === station.floor_id);
  const building = buildings.data?.find((b) => b.id === floor?.building_id);
  return (
    <p className="text-xs text-muted-foreground">
      {station.id.toUpperCase()}
      {building ? ` · ${building.name}` : ""}
      {floor ? ` · ${floor.name}` : ""}
    </p>
  );
}
export function BinsPage() {
  const stations = useAPI<Station[]>("/stations");
  const buildings = useAPI<Building[]>("/buildings");
  const floors = useAPI<Floor[]>("/floors");
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState("all");
  const [floor, setFloor] = useState("all");
  const [connection, setConnection] = useState("all");
  const [attention, setAttention] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("name");
  const filtered = (stations.data || [])
    .filter((bin) => {
      const level = floors.data?.find((f) => f.id === bin.floor_id);
      const connected = bin.devices.filter((d) => d.online).length;
      const state = !bin.devices.length
        ? "none"
        : connected === bin.devices.length
          ? "online"
          : connected === 0
            ? "offline"
            : "partial";
      const task = binAttention(bin);
      return (
        (!search.trim() ||
          `${bin.name} ${bin.id}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())) &&
        (building === "all" || level?.building_id === building) &&
        (floor === "all" || bin.floor_id === floor) &&
        (connection === "all" || connection === state) &&
        (attention === "all" ||
          (attention === "collection"
            ? task.collection.length > 0
            : task.needsChecking)) &&
        (source === "all" ||
          (source === "sensor" ? task.monitored : !task.monitored))
      );
    })
    .sort((a, b) =>
      sort === "id"
        ? a.id.localeCompare(b.id, undefined, { numeric: true })
        : sort === "attention"
          ? Number(
              binAttention(b).needsChecking ||
                binAttention(b).collection.length > 0,
            ) -
              Number(
                binAttention(a).needsChecking ||
                  binAttention(a).collection.length > 0,
              ) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  const active =
    search !== "" ||
    [building, floor, connection, attention, source].some((v) => v !== "all") ||
    sort !== "name";
  const reset = () => {
    setSearch("");
    setBuilding("all");
    setFloor("all");
    setConnection("all");
    setAttention("all");
    setSource("all");
    setSort("name");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Bins</h1>
          <p>
            Board connectivity, compartment measurements and sorting activity.
          </p>
        </div>
      </div>
      <section aria-label="Bin filters" className="mb-6 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Search</span>
            <Input
              type="search"
              placeholder="Bin name or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <FilterSelect
            label="Building"
            value={building}
            onChange={(v) => {
              setBuilding(v);
              setFloor("all");
            }}
            disabled={!buildings.data?.length}
            options={[
              ["all", "All buildings"],
              ...(buildings.data || []).map(
                (b) => [b.id, b.name] as [string, string],
              ),
            ]}
          />
          <FilterSelect
            label="Floor"
            value={floor}
            onChange={setFloor}
            disabled={building === "all" || !floors.data?.length}
            options={[
              ["all", "All floors"],
              ...(floors.data || [])
                .filter((f) => f.building_id === building)
                .map((f) => [f.id, f.name] as [string, string]),
            ]}
          />
          <FilterSelect
            label="Board connection"
            value={connection}
            onChange={setConnection}
            options={[
              ["all", "Any connection"],
              ["online", "All boards online"],
              ["partial", "Some boards offline"],
              ["offline", "All boards offline"],
              ["none", "No boards registered"],
            ]}
          />
          <FilterSelect
            label="Task"
            value={attention}
            onChange={setAttention}
            options={[
              ["all", "All tasks"],
              ["collection", "Collection alerts"],
              ["checking", "Needs checking"],
            ]}
          />
          <FilterSelect
            label="Readings"
            value={source}
            onChange={setSource}
            options={[
              ["all", "All bins"],
              ["sensor", "Sensor-backed"],
              ["demo", "Demo only / no sensors"],
            ]}
          />
          <FilterSelect
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              ["name", "Name"],
              ["id", "Bin ID"],
              ["attention", "Needs attention first"],
            ]}
          />
          <div className="flex items-end gap-2">
            <Button variant="outline" disabled={!active} onClick={reset}>
              Reset filters
            </Button>
            <InfoTooltip label="About bin filters">
              Online means all registered boards are online. Task filters use
              current sensor readings and board status; demo-only bins are
              excluded. Collection alerts start at 80%. Select a building to
              filter its floors.
            </InfoTooltip>
          </div>
        </div>
        <p className="text-sm text-muted-foreground" role="status">
          {stations.data
            ? `${filtered.length} of ${stations.data.length} bins`
            : "Loading bins…"}
        </p>
        {(buildings.isError || floors.isError) && (
          <p role="alert" className="error">
            Location filters unavailable. Other filters still work.
          </p>
        )}
      </section>
      {stations.isPending ? (
        <p className="empty">Loading bins…</p>
      ) : stations.isError ? (
        <p className="error" role="alert">
          {stations.error.message}
        </p>
      ) : !filtered.length ? (
        <div className="empty">
          <p>
            {stations.data?.length
              ? "No bins match these filters."
              : "No bins available."}
          </p>
          {active && (
            <Button variant="link" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="station-grid">
          {filtered.map((station) => (
            <Link
              key={station.id}
              to="/bins/$stationId"
              params={{ stationId: station.id }}
              className="station-card"
            >
              <div className="station-heading">
                <strong>{station.name}</strong>
                <ArrowUpRight className="size-4" />
              </div>
              <BinLocation station={station} />
              <DeviceStatus station={station} />
              <CompartmentFills station={station} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function BinPage() {
  const { stationId } = useParams({ from: "/bins/$stationId" });
  const station = useAPI<Station>(`/stations/${stationId}`);
  return (
    <>
      <Button variant="ghost" asChild>
        <Link to="/bins">
          <ArrowLeft />
          All bins
        </Link>
      </Button>
      {station.isPending ? (
        <p className="empty">Loading bin…</p>
      ) : station.isError ? (
        <p className="error" role="alert">
          {station.error.message}
        </p>
      ) : (
        station.data && (
          <>
            <div className="page-heading">
              <div>
                <h1>{station.data.name}</h1>
                <BinLocation station={station.data} />
                <DeviceStatus station={station.data} />
              </div>
            </div>
            <div className="card mb-6">
              <CompartmentFills station={station.data} />
            </div>
            <div className="detail-grid">
              <FillHistory station={station.data} />
              <SortingActivity station={station.data} />
            </div>
          </>
        )
      )}
    </>
  );
}
