import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { RecordFilter } from "./record-filter";
import { api, labels } from "@/api";
import type { Category, Event, Station } from "@/api";
import { date, useAPI } from "@/lib/dashboard";
export function SortingActivity({
  station,
  expanded = false,
}: {
  station: Station;
  expanded?: boolean;
}) {
  const [category, setCategory] = useState("all");
  const [result, setResult] = useState("all");
  const cache = useQueryClient();
  const events = useAPI<Event[]>(`/events?station_id=${station.id}`);
  const outcome = useMutation({
    mutationFn: (event: Event) =>
      api("/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          outcome: event.decision === "unknown" ? "disabled" : "completed",
          simulated: true,
        }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({
        queryKey: [`/events?station_id=${station.id}`],
      });
    },
  });
  const filtered = (events.data || []).filter(
    (e) =>
      (category === "all" || e.decision === category) &&
      (result === "all" ||
        (result === "pending" ? !e.outcome : e.outcome === result)),
  );
  return (
    <article className="card">
      <div className="card-title">
        <h3>Sorting activity</h3>
        <InfoTooltip label="About sorting records">
          A classification is a prediction. Only a reported outcome confirms the
          physical cycle. Shows the latest 50 records for this bin, newest
          first.
        </InfoTooltip>
      </div>
      {expanded && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2"
          aria-label="Sorting filters"
        >
          <RecordFilter
            label="Decision"
            value={category}
            onChange={setCategory}
            options={
              [
                ["all", "All decisions"],
                ...Object.entries(labels),
                ["unknown", "Unknown"],
              ] as [string, string][]
            }
          />
          <RecordFilter
            label="Outcome"
            value={result}
            onChange={setResult}
            options={[
              ["all", "All outcomes"],
              ["completed", "Completed"],
              ["disabled", "Disabled"],
              ["failed", "Failed"],
              ["pending", "Not reported"],
            ]}
          />
          {(category !== "all" || result !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategory("all");
                setResult("all");
              }}
            >
              Reset filters
            </Button>
          )}
          {events.data && (
            <span className="text-xs text-muted-foreground" role="status">
              {filtered.length} of {events.data.length} recent records
            </span>
          )}
        </div>
      )}
      {events.isError ? (
        <p role="alert" className="error">
          {events.error.message}
        </p>
      ) : !filtered.length ? (
        <p className="empty">
          {events.isPending
            ? "Loading events…"
            : events.data?.length
              ? "No records match these filters."
              : "No sorting decisions yet."}
        </p>
      ) : (
        <div className={expanded ? "history records-history" : "history"}>
          {filtered.map((e) => (
            <div key={e.id} data-event-id={e.id}>
              <div className="event-heading">
                <strong>
                  {labels[e.decision as Category] ||
                    e.decision.replaceAll("_", " ")}
                </strong>
                <span className="badge">
                  {e.provider}
                  {e.simulated ? " · demo" : ""}
                </span>
              </div>
              <p>
                {date(e.created_at)} ·{" "}
                {e.confidence == null
                  ? "No confidence"
                  : `${Math.round(e.confidence * 100)}%`}{" "}
                · raw label: {e.raw_label ?? "none"}
              </p>
              <p>
                Outcome: {e.outcome || "Not reported"}
                {e.simulated ? " · simulated" : ""}
              </p>
              {e.reason && <p>{e.reason}</p>}
              {!e.outcome && e.provider === "mock" && (
                <Button
                  variant="secondary"
                  disabled={outcome.isPending}
                  onClick={() => outcome.mutate(e)}
                >
                  Report simulated{" "}
                  {e.decision === "unknown" ? "disabled" : "completion"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {outcome.isError && (
        <p role="alert" className="error">
          {outcome.error.message}
        </p>
      )}
    </article>
  );
}
