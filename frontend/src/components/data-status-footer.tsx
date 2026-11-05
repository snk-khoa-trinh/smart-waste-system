import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Snapshot = { status: string; fetching: string; updatedAt: number }[];
function subscribeConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
export function DataStatusFooter() {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const subscribe = useCallback(
    (callback: () => void) => cache.subscribe(callback),
    [cache],
  );
  const getSnapshot = useCallback(
    () =>
      JSON.stringify(
        cache
          .getAll()
          .filter(
            (query) =>
              query.isActive() &&
              typeof query.queryKey[0] === "string" &&
              query.queryKey[0].startsWith("/"),
          )
          .map((query) => ({
            status: query.state.status,
            fetching: query.state.fetchStatus,
            updatedAt: query.state.dataUpdatedAt,
          })),
      ),
    [cache],
  );
  // A string snapshot remains stable between cache events, unlike a new array.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  const queries = JSON.parse(snapshot) as Snapshot;
  const online = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true,
  );
  const fetching = queries.some((query) => query.fetching === "fetching");
  const failed = queries.some((query) => query.status === "error");
  const paused = queries.some((query) => query.fetching === "paused");
  const timestamps = queries
    .map((query) => query.updatedAt)
    .filter((time) => time > 0);
  // Use the oldest active result so one fast request cannot hide older data.
  const fetchedAt = timestamps.length ? Math.min(...timestamps) : 0;
  const status = !online
    ? "Browser offline"
    : fetching
      ? "Refreshing…"
      : failed
        ? "Refresh failed"
        : paused
          ? "Refresh paused"
          : queries.length === 0
            ? "Nothing to refresh"
            : timestamps.length === queries.length
              ? "Data refreshed"
              : "Waiting for data";
  const Icon = !online
    ? WifiOff
    : failed
      ? CircleAlert
      : fetching
        ? RefreshCw
        : CircleCheck;
  return (
    <footer className="app-footer" aria-label="Data status">
      <span className="flex items-center gap-2" role="status">
        <Icon
          className={`size-3.5 ${fetching ? "animate-spin" : ""} ${failed && online ? "text-destructive" : ""}`}
          aria-hidden="true"
        />
        {status}
      </span>
      <div className="flex items-center gap-3">
        {fetchedAt > 0 && (
          <time
            className="tabular-nums"
            dateTime={new Date(fetchedAt).toISOString()}
            title={`Displayed data fetched ${new Date(fetchedAt).toLocaleString()}; sensor measurement times may be older.`}
          >
            <span className="sr-only">Data fetched at </span>
            {new Date(fetchedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </time>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={!online || fetching || queries.length === 0}
          onClick={() =>
            void client.refetchQueries({
              type: "active",
              predicate: (query) =>
                typeof query.queryKey[0] === "string" &&
                query.queryKey[0].startsWith("/"),
            })
          }
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>
    </footer>
  );
}
