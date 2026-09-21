import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type { SalesOption, SalesStatsResult } from "../../../shared/salesStats.ts";

export type SalesStatsQuery = {
  preset?: "today" | "week" | "month";
  from?: string;
  to?: string;
  salesUserId?: string;
};

export type SalesStatsResponse = SalesStatsResult & { salesOptions: SalesOption[] };

export async function fetchSalesStats(params: SalesStatsQuery): Promise<SalesStatsResponse> {
  const qs = new URLSearchParams();
  if (params.preset) qs.set("preset", params.preset);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.salesUserId && params.salesUserId !== "all") qs.set("salesUserId", params.salesUserId);
  return customFetch(`/api/sales-stats?${qs.toString()}`);
}
