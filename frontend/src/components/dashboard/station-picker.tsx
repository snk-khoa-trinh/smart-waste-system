import { useSearch, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Station } from "@/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAPI } from "@/lib/dashboard";
export function StationPicker({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (station: Station) => ReactNode;
}) {
  const { station: selected } = useSearch({ strict: false }) as {
    station?: string;
  };
  const navigate = useNavigate();
  const stations = useAPI<Station[]>("/stations");
  const current =
    stations.data?.find((s) => s.id === selected) ||
    (!selected ? stations.data?.[0] : undefined);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <label className="station-picker">
          Bin
          <Select
            value={current?.id || ""}
            disabled={!stations.data?.length}
            onValueChange={(station) =>
              void navigate({
                to: ".",
                search: (previous) => ({ ...previous, station }),
              })
            }
          >
            <SelectTrigger aria-label="Bin">
              <SelectValue placeholder="Select a bin" />
            </SelectTrigger>
            <SelectContent>
              {stations.data?.map((s) => (
                <SelectItem value={s.id} key={s.id}>
                  {s.name} · {s.id.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      {stations.isPending ? (
        <p className="empty">Loading bins…</p>
      ) : stations.isError ? (
        <p className="error" role="alert">
          {stations.error.message}
        </p>
      ) : current ? (
        <div key={current.id}>{children(current)}</div>
      ) : (
        <p className="empty">
          {selected
            ? "Bin not found. Choose another bin."
            : "No bins available."}
        </p>
      )}
    </>
  );
}
