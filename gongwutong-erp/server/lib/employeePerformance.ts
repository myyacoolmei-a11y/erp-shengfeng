/** @deprecated Import from ./statistics/statisticsService — kept for route compatibility */
export {
  computeAllEmployeeKpis as listEmployeePerformance,
  computeEmployeeKpi,
  currentMonthRange,
  parseStatsRange,
  type StatsRangeParams,
} from "./statistics/statisticsService";

export { currentMonthParam } from "./statistics/dateRange";

export type {
  EmployeeKpiRow as EmployeePerformanceRow,
  SalesKpi as SalesPerformance,
  TechnicianKpi as TechnicianPerformance,
} from "./statistics/statisticsService";
