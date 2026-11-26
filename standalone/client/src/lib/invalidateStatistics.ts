import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getListEmployeesPerformanceQueryKey,
  getGetEmployeePerformanceQueryKey,
  getListReceivablesQueryKey,
  getListPaymentsQueryKey,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";

/** Invalidate all statistics-related React Query caches after data mutations. */
export function invalidateStatistics(queryClient: QueryClient, employeeId?: number) {
  queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListEmployeesPerformanceQueryKey() });
  queryClient.invalidateQueries({ queryKey: ["sales-stats"] });
  queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && /^\/api\/employees\/\d+\/performance$/.test(q.queryKey[0]) });
  queryClient.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
  // payments API retained for legacy data; dashboard/collection stats use receivables
  queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
  if (employeeId != null) {
    queryClient.invalidateQueries({ queryKey: getGetEmployeePerformanceQueryKey(employeeId) });
  }
}
