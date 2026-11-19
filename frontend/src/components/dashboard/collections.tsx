import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/info-tooltip";
import { RecordFilter } from "./record-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, labels } from "@/api";
import type { Category, Collection, Station } from "@/api";
import { categories, date, useAPI } from "@/lib/dashboard";
export function Collections({ station }: { station: Station }) {
  const cache = useQueryClient();
  const collections = useAPI<Collection[]>(
    `/collections?station_id=${station.id}`,
  );
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("recyclable");
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const collection = useMutation({
    mutationFn: () =>
      api(`/stations/${station.id}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          operator: operator.trim(),
          note: note.trim(),
        }),
      }),
    onSuccess: () => {
      setNote("");
      void cache.invalidateQueries({
        queryKey: [`/collections?station_id=${station.id}`],
      });
    },
  });
  const filtered = (collections.data || []).filter(
    (c) =>
      (filter === "all" || c.category === filter) &&
      `${c.operator} ${c.note}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <section className="detail-grid">
      <article className="card" id="activity">
        <div className="card-title">
          <h3>Record a collection</h3>
          <InfoTooltip label="About collection records">
            Record a collection after emptying a compartment. The last measured
            fill remains until fresh sensor telemetry arrives.
          </InfoTooltip>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (operator.trim()) collection.mutate();
          }}
        >
          <label>
            Compartment
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as Category)}
            >
              <SelectTrigger aria-label="Compartment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {labels[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            Collected by
            <Input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="Operator name"
              maxLength={100}
              required
            />
          </label>
          <label>
            Collection note
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              maxLength={500}
            />
          </label>

          <Button disabled={collection.isPending || !operator.trim()}>
            {collection.isPending ? "Saving…" : "Record collection"}
          </Button>
          {collection.isSuccess && (
            <p role="status" className="online">
              Collection saved.
            </p>
          )}
          {collection.isError && (
            <p role="alert" className="error">
              {collection.error.message}
            </p>
          )}
        </form>
      </article>
      <article className="card">
        <div className="card-title">
          <h3>Collection history</h3>
          <InfoTooltip label="About collection history">
            Shows the latest 100 collection records for this bin, newest first.
            Filters apply to these loaded records.
          </InfoTooltip>
        </div>
        <div
          className="mb-4 flex flex-wrap gap-2"
          aria-label="Collection filters"
        >
          <RecordFilter
            label="Collection compartment"
            value={filter}
            onChange={setFilter}
            options={
              [["all", "All compartments"], ...Object.entries(labels)] as [
                string,
                string,
              ][]
            }
          />
          <Input
            className="min-w-0 flex-1 basis-40"
            type="search"
            aria-label="Search collections"
            placeholder="Operator or note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(filter !== "all" || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilter("all");
                setSearch("");
              }}
            >
              Reset filters
            </Button>
          )}
          {collections.data && (
            <span
              className="w-full text-xs text-muted-foreground"
              role="status"
            >
              {filtered.length} of {collections.data.length} recent records
            </span>
          )}
        </div>
        {collections.isError ? (
          <p role="alert" className="error">
            {collections.error.message}
          </p>
        ) : !filtered.length ? (
          <p className="empty">
            {collections.isPending
              ? "Loading collections…"
              : collections.data?.length
                ? "No records match these filters."
                : "No collections recorded yet."}
          </p>
        ) : (
          <div className="history records-history">
            {filtered.map((c) => (
              <div key={c.id}>
                <strong>{labels[c.category as Category]}</strong>
                <p>
                  {c.operator} · {date(c.created_at)}
                </p>
                {c.note && <p>{c.note}</p>}
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
