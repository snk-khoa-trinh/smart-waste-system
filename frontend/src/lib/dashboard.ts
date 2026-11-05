import { useQuery } from "@tanstack/react-query";
import { api, labels } from "@/api";
import type { Category } from "@/api";
export const categories = Object.keys(labels) as Category[];
export const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "No measurement yet";
export function useAPI<T>(path: string) {
  return useQuery({ queryKey: [path], queryFn: () => api<T>(path) });
}
export type Summary = {
  stations: number;
  devices_offline: number;
  needing_collection: number;
  inference_provider: string;
};
