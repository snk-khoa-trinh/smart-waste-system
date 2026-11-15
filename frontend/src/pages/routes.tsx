import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Download, RefreshCw, Route } from "lucide-react";
import { api, labels } from "@/api";
import type { Station } from "@/api";
import { useAPI, date } from "@/lib/dashboard";
import { minutes } from "@/lib/collection-route";
import type { CollectionRoute } from "@/lib/collection-route";
import type { Building } from "@/components/building-preview/layout";
import { CollectionRouteMap } from "@/components/collection-route-map";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/info-tooltip";

function Choice({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { id: string; name: string }[];
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function RoutesPage() {
  const buildings = useAPI<Building[]>("/buildings");
  const [chosenBuilding, setBuilding] = useState("tower");
  const [source, setSource] = useState("live");
  const [threshold, setThreshold] = useState("80");
  const [travelMode, setTravelMode] = useState("elevator");
  const [start, setStart] = useState("entrance");
  const [floorId, setFloor] = useState("");
  const [selectedId, setSelected] = useState("");
  const [comparison, setComparison] = useState("optimized");
  const buildingId = buildings.data?.some((b) => b.id === chosenBuilding)
    ? chosenBuilding
    : buildings.data?.[0]?.id || "tower";
  const query = useQuery({
    queryKey: [
      "collection-route",
      buildingId,
      source,
      threshold,
      travelMode,
      start,
    ],
    queryFn: () =>
      api<CollectionRoute>("/routes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: buildingId,
          source,
          threshold: Number(threshold),
          travel_mode: travelMode,
          start_node_id: start === "entrance" ? null : start,
        }),
      }),
    enabled: Boolean(buildings.data?.length),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const plan = query.data;
  const currentReadings = useQuery({
    queryKey: ["/stations"],
    queryFn: () => api<Station[]>("/stations"),
    enabled: source === "live",
    refetchInterval: 5000,
  });
  const stops =
    plan && comparison === "baseline"
      ? plan.baseline_order.map((id, index) => ({
          ...plan.stops.find((stop) => stop.id === id)!,
          order: index + 1,
        }))
      : plan?.stops || [];
  const selected = selectedId
    ? stops.find((stop) => stop.id === selectedId)
    : stops.find((stop) => stop.floor_id === floorId) || stops[0];
  const activeBin = plan?.bins.find(
    (bin) => bin.id === selectedId || (!selectedId && bin.id === selected?.id),
  );
  const floor =
    plan?.floors.find((f) => f.id === floorId) ||
    plan?.floors.find((f) => f.id === selected?.floor_id) ||
    plan?.floors[0];
  const legs =
    comparison === "baseline" ? plan?.baseline_legs || [] : plan?.legs || [];
  function changeBuilding(id: string) {
    setBuilding(id);
    setStart("entrance");
    setFloor("");
    setSelected("");
  }
  function exportPlan() {
    if (!plan) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sws-${plan.building.id}-route.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const stations: Station[] =
    plan?.bins.map((bin) =>
      source === "live"
        ? currentReadings.data?.find((item) => item.id === bin.id) || {
            ...bin,
            devices: [],
            compartments: [],
          }
        : {
            ...bin,
            devices: [],
            compartments: bin.values.map((value) => ({
              ...value,
              quality: "valid",
              stale: false,
              measured_at: plan.generated_at,
            })),
          },
    ) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Collection route</h1>
          <p>Visit bins that need collection, with less backtracking.</p>
        </div>
      </div>
      <div className="card mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Choice
          label="Building"
          value={buildingId}
          onChange={changeBuilding}
          items={(buildings.data || []).filter((b) =>
            ["campus", "mall", "tower"].includes(b.id),
          )}
        />
        <Choice
          label="Readings"
          value={source}
          onChange={(value) => {
            setSource(value);
            setSelected("");
          }}
          items={[
            { id: "live", name: "Live sensor readings" },
            { id: "demo", name: "Demo fill scenario" },
          ]}
        />
        <Choice
          label="Collect at"
          value={threshold}
          onChange={(value) => {
            setThreshold(value);
            setSelected("");
          }}
          items={[60, 70, 80, 90, 100].map((n) => ({
            id: String(n),
            name: `${n}% or above`,
          }))}
        />
        <Choice
          label="Between floors"
          value={travelMode}
          onChange={setTravelMode}
          items={[
            { id: "elevator", name: "Elevator" },
            { id: "stairs", name: "Stairs" },
          ]}
        />
        <Choice
          label="Start and finish"
          value={start}
          onChange={(value) => {
            setStart(value);
            setSelected("");
          }}
          items={[
            { id: "entrance", name: "Main entrance" },
            ...(plan?.start_options
              .filter((node) => node.kind !== "entrance")
              .map((node) => ({
                id: node.id,
                name: `${plan.floors.find((f) => f.id === node.floor_id)?.name} · ${node.kind}`,
              })) || []),
          ]}
        />
      </div>
      {buildings.isError && (
        <p role="alert" className="error">
          {buildings.error.message}
        </p>
      )}
      {query.isPending && (
        <p role="status" className="empty">
          Preparing the walking route…
        </p>
      )}
      {query.isError && (
        <p role="alert" className="error">
          {query.error.message}
        </p>
      )}
      {plan && floor && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {source === "demo"
                ? "Synthetic scenario · no hardware readings changed"
                : "Fresh sensor readings only · one stop per bin"}{" "}
              · {date(plan.generated_at)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw />
                Recalculate
              </Button>
              <Button variant="ghost" size="sm" onClick={exportPlan}>
                <Download />
                Export
              </Button>
              <InfoTooltip label="Route assumptions">
                {plan.assumptions.join(" ")}{" "}
                {plan.optimal_for_modeled_graph
                  ? "Exact minimum travel cost for the selected stops on this model."
                  : "Heuristic improvement; global optimality is not guaranteed."}
              </InfoTooltip>
            </div>
          </div>
          <div
            className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Route comparison"
          >
            <article className="card">
              <p className="text-sm text-muted-foreground">Collection stops</p>
              <p className="mt-2 text-2xl font-semibold">
                {plan.summary.stops}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {plan.summary.total_bins} bins
                </span>
              </p>
            </article>
            <article className="card">
              <p className="text-sm text-muted-foreground">
                ID-order baseline · travel
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {minutes(plan.summary.baseline_travel_seconds)}
              </p>
            </article>
            <article className="card">
              <p className="text-sm text-muted-foreground">Planned travel</p>
              <p className="mt-2 text-2xl font-semibold">
                {minutes(plan.summary.travel_seconds)}
              </p>
              <p className="text-xs text-muted-foreground">
                {plan.summary.walking_meters} m walking · estimated
              </p>
            </article>
            <article className="card">
              <p className="text-sm text-muted-foreground">
                Estimated travel saved
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {plan.summary.saved_percent}%
              </p>
              <p className="text-xs text-muted-foreground">
                Total with collection: {minutes(plan.summary.total_seconds)}
              </p>
            </article>
          </div>
          {!stops.length && (
            <p role="status" className="card mb-6">
              {source === "demo"
                ? "No demo bins meet this threshold. Try a lower threshold."
                : "No bins meet this threshold with fresh sensor readings. Missing, stale, simulated or already-collected readings are excluded. Choose Demo fill scenario to explore a synthetic route."}
            </p>
          )}
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
            <section className="card min-w-0" aria-label="Collection route map">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Choice
                  label="Route floor"
                  value={floor.id}
                  onChange={(id) => {
                    setFloor(id);
                    setSelected(
                      stops.find((stop) => stop.floor_id === id)?.id || "",
                    );
                  }}
                  items={plan.floors}
                />
                <Tabs
                  value={comparison}
                  onValueChange={(value) => {
                    setComparison(value);
                    setSelected("");
                  }}
                >
                  <TabsList aria-label="Route display">
                    <TabsTrigger value="optimized">Planned</TabsTrigger>
                    <TabsTrigger value="baseline">ID order</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <CollectionRouteMap
                plan={plan}
                floor={floor}
                stations={stations}
                stops={stops}
                legs={legs}
                selectedId={
                  selectedId === "start"
                    ? "start"
                    : activeBin?.id || selected?.id
                }
                readingsState={
                  source === "demo"
                    ? "ready"
                    : currentReadings.isPending
                      ? "loading"
                      : currentReadings.isError
                        ? "error"
                        : "ready"
                }
                onSelect={(bin) => {
                  setSelected(bin.id);
                  setFloor(bin.floor_id);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Hover or focus a bin for fill levels; click or tap to keep them
                open. Select a stop to follow its blue arrows.{" "}
                {plan.optimal_for_modeled_graph
                  ? "Exact for this modeled graph."
                  : "Heuristic route; not a guaranteed global optimum."}
              </p>
            </section>
            <section className="card min-w-0" aria-label="Collection itinerary">
              <div className="card-title">
                <h2>Stops · {floor.name}</h2>
                <Route className="size-4" />
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Start and finish at{" "}
                {
                  plan.start_options.find(
                    (node) => node.id === plan.start_node_id,
                  )?.kind
                }
                ,{" "}
                {
                  plan.floors.find(
                    (f) =>
                      f.id ===
                      plan.nodes.find((node) => node.id === plan.start_node_id)
                        ?.floor_id,
                  )?.name
                }
                . Use the {travelMode} between floors.
              </p>
              <ol className="space-y-2">
                {stops
                  .filter((stop) => stop.floor_id === floor.id)
                  .map((stop) => (
                    <li key={stop.id}>
                      <Button
                        variant="outline"
                        className="h-auto w-full justify-start whitespace-normal text-left"
                        aria-pressed={selected?.id === stop.id}
                        onClick={() => {
                          setSelected(stop.id);
                          setFloor(stop.floor_id);
                        }}
                      >
                        <span className="mr-2 tabular-nums">{stop.order}.</span>
                        <span>
                          {stop.id.toUpperCase()} · {stop.name}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {stop.compartments
                              .map((c) => `${labels[c.category]} ${c.fill}%`)
                              .join(" · ")}
                          </span>
                        </span>
                      </Button>
                    </li>
                  ))}
              </ol>
              {!stops.some((stop) => stop.floor_id === floor.id) && (
                <p className="empty">No collection stops on this floor.</p>
              )}
              {activeBin && activeBin.floor_id === floor.id && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      to="/bins/$stationId"
                      params={{ stationId: activeBin.id }}
                    >
                      Open bin
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    disabled={!selected}
                    onClick={() => {
                      if (selected && selected.order === stops.length) {
                        setSelected("start");
                        setFloor(
                          plan.nodes.find(
                            (node) => node.id === plan.start_node_id,
                          )?.floor_id || floor.id,
                        );
                        return;
                      }
                      const next = selected && stops[selected.order];
                      if (next) {
                        setSelected(next.id);
                        setFloor(next.floor_id);
                      }
                    }}
                  >
                    {selected?.order === stops.length
                      ? "Return to start"
                      : "Next stop"}
                    <ArrowRight />
                  </Button>
                </div>
              )}
              <details className="mt-6 text-sm">
                <summary className="cursor-pointer">
                  Skipped bins ({plan.excluded.length})
                </summary>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  {plan.excluded.map((bin) => (
                    <li key={bin.id}>
                      {bin.id.toUpperCase()}: {bin.reason}
                    </li>
                  ))}
                </ul>
              </details>
              <p className="mt-4 text-xs text-muted-foreground">
                This is a plan snapshot, not a collection record. Record actual
                collection in Records → Collections; then recalculate when fresh
                readings arrive.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
