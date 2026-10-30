/** Shared date-range helpers for Dashboard / Employee KPI statistics. */

export type StatsPeriodPreset = "today" | "week" | "month" | "quarter" | "year" | "custom";

export interface StatsDateRange {
  preset: StatsPeriodPreset;
  /** Human-readable label, e.g. 2026-07, 2026-Q3, 2026-01-01 ~ 2026-01-31 */
  label: string;
  /** YYYY-MM-DD inclusive — for date columns (paymentDate, completedDate, …) */
  startDate: string;
  endDate: string;
  /** For timestamptz columns (createdAt) — inclusive lower bound */
  startTs: Date;
  /** For timestamptz columns — exclusive upper bound */
  endTsExclusive: Date;
}

export interface StatsRangeParams {
  period?: string;
  month?: string;
  quarter?: string;
  year?: string;
  from?: string;
  to?: string;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthStart(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, 1);
}

function monthEndExclusive(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 1);
}

function parseQuarter(quarter: string): { year: number; q: number } {
  const m = quarter.match(/^(\d{4})-Q([1-4])$/i);
  if (!m) throw new Error("Invalid quarter format, expected YYYY-Q1");
  return { year: Number(m[1]), q: Number(m[2]) };
}

export function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function currentMonthRange(): StatsDateRange {
  return parseStatsRange({ period: "month", month: currentMonthParam() });
}

export function todayRange(): StatsDateRange {
  return parseStatsRange({ period: "today" });
}

/** Resolve a statistics period from API query params. Defaults to current month. */
export function parseStatsRange(params: StatsRangeParams = {}): StatsDateRange {
  const period = (params.period ?? (params.month ? "month" : "month")) as StatsPeriodPreset;
  const now = new Date();

  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const d = fmtDate(start);
    return {
      preset: "today",
      label: d,
      startDate: d,
      endDate: d,
      startTs: start,
      endTsExclusive: endExclusive,
    };
  }

  if (period === "week") {
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 7);
    const end = new Date(endExclusive);
    end.setDate(end.getDate() - 1);
    return {
      preset: "week",
      label: `${fmtDate(start)} ~ ${fmtDate(end)}`,
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      startTs: start,
      endTsExclusive: endExclusive,
    };
  }

  if (period === "quarter") {
    const qStr = params.quarter ?? `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    const { year, q } = parseQuarter(qStr);
    const startMonth = (q - 1) * 3;
    const start = monthStart(year, startMonth);
    const endExclusive = monthStart(year, startMonth + 3);
    const end = new Date(endExclusive);
    end.setDate(end.getDate() - 1);
    return {
      preset: "quarter",
      label: `${year}-Q${q}`,
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      startTs: start,
      endTsExclusive: endExclusive,
    };
  }

  if (period === "year") {
    const year = Number(params.year ?? now.getFullYear());
    if (!year) throw new Error("Invalid year");
    const start = new Date(year, 0, 1);
    const endExclusive = new Date(year + 1, 0, 1);
    const end = new Date(year, 11, 31);
    return {
      preset: "year",
      label: String(year),
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      startTs: start,
      endTsExclusive: endExclusive,
    };
  }

  if (period === "custom") {
    const from = params.from;
    const to = params.to;
    if (!from || !to) throw new Error("Custom period requires from and to (YYYY-MM-DD)");
    const startParts = from.split("-").map(Number);
    const endParts = to.split("-").map(Number);
    const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
    if (end < start) throw new Error("End date must be on or after start date");
    const endExclusive = new Date(end);
    endExclusive.setDate(endExclusive.getDate() + 1);
    return {
      preset: "custom",
      label: `${from} ~ ${to}`,
      startDate: from,
      endDate: to,
      startTs: start,
      endTsExclusive: endExclusive,
    };
  }

  // month (default)
  const month = params.month ?? currentMonthParam();
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error("Invalid month format, expected YYYY-MM");
  const start = monthStart(y, m - 1);
  const endExclusive = monthEndExclusive(y, m - 1);
  const lastDay = new Date(y, m, 0);
  return {
    preset: "month",
    label: month,
    startDate: `${y}-${pad2(m)}-01`,
    endDate: fmtDate(lastDay),
    startTs: start,
    endTsExclusive: endExclusive,
  };
}
