export type Category = "recyclable" | "non_recyclable" | "e_waste";
export type Compartment = {
  category: Category;
  fill: number | null;
  quality: string;
  source: string;
  stale: boolean;
  measured_at: string | null;
};
export type Device = {
  id: string;
  role: string;
  online: boolean;
  last_seen: string | null;
};
export type Station = {
  id: string;
  floor_id: string;
  name: string;
  x: number;
  y: number;
  compartments: Compartment[];
  devices: Device[];
};
export type Event = {
  id: string;
  decision: string;
  confidence: number | null;
  provider: string;
  model: string;
  raw_label: string | null;
  reason: string | null;
  outcome: string | null;
  simulated: boolean;
  created_at: string;
};
export type Collection = {
  id: string;
  station_id: string;
  category: string;
  operator: string;
  note: string;
  created_at: string;
};
export type Reading = {
  id: string;
  category: Category;
  fill: number | null;
  source: string;
  quality: string;
  measured_at: string;
};
export const labels: Record<Category, string> = {
  recyclable: "Recyclable",
  non_recyclable: "Non-recyclable",
  e_waste: "E-waste",
};
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message || `Request failed (${response.status})`,
    );
  }
  return response.json();
}
export function fillText(c: Compartment) {
  return c.quality !== "valid" || c.fill === null
    ? c.quality
    : `${Math.round(c.fill)}%`;
}

export function chartReadings(readings: Reading[]) {
  const buckets = new Map<number, Record<string, number | null>>();
  for (const reading of [...readings].reverse()) {
    const time =
      Math.floor(new Date(reading.measured_at).getTime() / 1000) * 1000;
    const row = buckets.get(time) || { time };
    row[reading.category] = reading.fill;
    buckets.set(time, row);
  }
  return [...buckets.values()].sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
}
