/**
 * 業務統計 — 純函式（案件去重、分類、彙總）。
 * 成交日期用 quotes.won_at；業務歸屬用 repair_cases.sales_user_id
 * 與 quotes.sales_rep_id → users.linked_employee_id。
 */

export const UNASSIGNED_SALES_KEY = "unassigned";
export const UNASSIGNED_SALES_NAME = "未指定業務";

export type SalesCaseCategory = "安裝" | "保養" | "維修" | "其他";
export type SalesStatsPreset = "today" | "week" | "month" | "custom";

export type SalesPersonKey = string;

export interface SalesStatCase {
  caseKey: string;
  salesKey: SalesPersonKey;
  salesUserId: number | null;
  salesName: string;
  date: string;
  customerName: string;
  category: SalesCaseCategory;
  content: string;
  wonAmount: number;
  receivedAmount: number;
  status: string;
}

export interface SalesPersonStatRow {
  salesKey: SalesPersonKey;
  salesUserId: number | null;
  salesName: string;
  caseCount: number;
  installCount: number;
  maintenanceCount: number;
  repairCount: number;
  otherCount: number;
  wonAmount: number;
  receivedAmount: number;
  cases: SalesStatCase[];
}

export interface SalesStatsTotals {
  caseCount: number;
  installCount: number;
  maintenanceCount: number;
  repairCount: number;
  otherCount: number;
  wonAmount: number;
  receivedAmount: number;
}

export interface SalesStatsResult {
  from: string;
  to: string;
  rows: SalesPersonStatRow[];
  totals: SalesStatsTotals;
}

export interface SalesOption {
  id: number;
  name: string;
  isSales: boolean;
}

export function taipeiDateString(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export function timestampToTaipeiDate(ts: Date | string | null | undefined): string | null {
  if (ts == null) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export function dateInRange(date: string | null | undefined, from: string, to: string): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

/** Same Taipei presets as 工時統計（today / week Mon–Sun / month / custom）. */
export function resolveSalesStatsDateRange(
  preset?: string,
  from?: string,
  to?: string,
): { from: string; to: string } | null {
  const today = taipeiDateString();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      from: monday.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }),
      to: sunday.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }),
    };
  }
  if (preset === "custom") {
    if (!from || !to) return null;
    return { from, to };
  }
  if (from && to) return { from, to };
  const ymd = taipeiDateString();
  const y = ymd.slice(0, 4);
  const m = ymd.slice(5, 7);
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, "0")}` };
}

const INSTALL_TYPES = new Set([
  "安裝",
  "新裝",
  "裝新機",
  "安裝新機",
  "安裝工程",
  "冷媒工程",
  "配管工程",
]);
const MAINTENANCE_TYPES = new Set(["保養", "保固服務", "壁掛式保養"]);
const REPAIR_TYPES = new Set(["維修", "修理", "維修項目"]);

const CATEGORY_ALIASES: Record<string, string> = {
  裝新機: "安裝新機",
  新裝: "安裝新機",
  維修: "維修項目",
  修理: "維修項目",
};

export function mapSalesCaseCategory(
  raw: string | null | undefined,
  source?: "quote" | "work_order" | "repair" | "receivable",
): SalesCaseCategory {
  if (source === "repair") return "維修";
  const text = String(raw ?? "").trim();
  if (!text) return "其他";
  const canonical = CATEGORY_ALIASES[text] ?? text;
  if (INSTALL_TYPES.has(text) || INSTALL_TYPES.has(canonical)) return "安裝";
  if (MAINTENANCE_TYPES.has(text) || MAINTENANCE_TYPES.has(canonical)) return "保養";
  if (REPAIR_TYPES.has(text) || REPAIR_TYPES.has(canonical)) return "維修";
  return "其他";
}

export function quoteCaseKey(quoteId: number): string {
  return `quote:${quoteId}`;
}

export function workOrderCaseKey(workOrderId: number): string {
  return `wo:${workOrderId}`;
}

export function receivableCaseKey(receivableId: number): string {
  return `recv:${receivableId}`;
}

export function repairCaseKey(repairId: number): string {
  return `repair:${repairId}`;
}

export function userSalesKey(userId: number): string {
  return `user:${userId}`;
}

export function employeeSalesKey(employeeId: number): string {
  return `employee:${employeeId}`;
}

export function resolveSalesIdentity(input: {
  salesUserId?: number | null;
  salesRepId?: number | null;
  userById: Map<number, { id: number; displayName: string }>;
  userByEmployeeId: Map<number, { id: number; displayName: string }>;
  employeeById: Map<number, { id: number; name: string }>;
}): { salesKey: SalesPersonKey; salesUserId: number | null; salesName: string } {
  if (input.salesUserId != null) {
    const user = input.userById.get(input.salesUserId);
    if (user) {
      return {
        salesKey: userSalesKey(user.id),
        salesUserId: user.id,
        salesName: user.displayName.trim() || UNASSIGNED_SALES_NAME,
      };
    }
  }
  if (input.salesRepId != null) {
    const linked = input.userByEmployeeId.get(input.salesRepId);
    if (linked) {
      return {
        salesKey: userSalesKey(linked.id),
        salesUserId: linked.id,
        salesName: linked.displayName.trim() || UNASSIGNED_SALES_NAME,
      };
    }
    const employee = input.employeeById.get(input.salesRepId);
    if (employee) {
      return {
        salesKey: employeeSalesKey(employee.id),
        salesUserId: null,
        salesName: employee.name.trim() || UNASSIGNED_SALES_NAME,
      };
    }
  }
  return {
    salesKey: UNASSIGNED_SALES_KEY,
    salesUserId: null,
    salesName: UNASSIGNED_SALES_NAME,
  };
}

export function toMoneyNumber(val: unknown): number {
  if (val == null || val === "") return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  return Number.isFinite(n) ? n : 0;
}

export function formatSalesMoney(amount: number): string {
  return `$${Math.round(toMoneyNumber(amount)).toLocaleString("en-US")}`;
}

export function formatSalesCount(n: number): string {
  return String(Math.round(toMoneyNumber(n)));
}

export function formatCaseDate(date: string | null | undefined): string {
  if (!date) return "—";
  const m = date.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  return `${m[2]}/${m[3]}`;
}

export function casePaymentStatus(wonAmount: number, receivedAmount: number, fallback?: string | null): string {
  const won = toMoneyNumber(wonAmount);
  const received = toMoneyNumber(receivedAmount);
  if (won > 0 && received + 0.0001 >= won) return "已結案";
  if (received > 0 && received < won) return "部分收款";
  if (won > 0 && received <= 0) return "未收款";
  const fb = (fallback ?? "").trim();
  return fb || "未收款";
}

function emptyCounts() {
  return {
    caseCount: 0,
    installCount: 0,
    maintenanceCount: 0,
    repairCount: 0,
    otherCount: 0,
    wonAmount: 0,
    receivedAmount: 0,
  };
}

function bumpCategory(row: ReturnType<typeof emptyCounts>, category: SalesCaseCategory) {
  row.caseCount += 1;
  if (category === "安裝") row.installCount += 1;
  else if (category === "保養") row.maintenanceCount += 1;
  else if (category === "維修") row.repairCount += 1;
  else row.otherCount += 1;
}

export function matchesSalesFilter(
  sales: { salesKey: string; salesUserId: number | null },
  filter: string | null | undefined,
): boolean {
  if (!filter || filter === "all" || filter === "全部" || filter === "全部業務") return true;
  if (filter === UNASSIGNED_SALES_KEY || filter === "未指定業務") {
    return sales.salesKey === UNASSIGNED_SALES_KEY;
  }
  const uid = parseInt(filter, 10);
  if (!Number.isNaN(uid)) return sales.salesUserId === uid;
  return sales.salesKey === filter;
}

export function aggregateSalesStats(
  cases: SalesStatCase[],
  range: { from: string; to: string },
): SalesStatsResult {
  const byKey = new Map<string, SalesPersonStatRow>();

  for (const item of cases) {
    let row = byKey.get(item.salesKey);
    if (!row) {
      row = {
        salesKey: item.salesKey,
        salesUserId: item.salesUserId,
        salesName: item.salesName,
        ...emptyCounts(),
        cases: [],
      };
      byKey.set(item.salesKey, row);
    }
    bumpCategory(row, item.category);
    row.wonAmount += item.wonAmount;
    row.receivedAmount += item.receivedAmount;
    row.cases.push(item);
  }

  const rows = [...byKey.values()].map((row) => ({
    ...row,
    cases: [...row.cases].sort((a, b) => a.date.localeCompare(b.date) || a.caseKey.localeCompare(b.caseKey)),
  }));

  rows.sort((a, b) => {
    if (b.wonAmount !== a.wonAmount) return b.wonAmount - a.wonAmount;
    if (b.caseCount !== a.caseCount) return b.caseCount - a.caseCount;
    return a.salesName.localeCompare(b.salesName, "zh-Hant");
  });

  const totals = emptyCounts();
  for (const row of rows) {
    totals.caseCount += row.caseCount;
    totals.installCount += row.installCount;
    totals.maintenanceCount += row.maintenanceCount;
    totals.repairCount += row.repairCount;
    totals.otherCount += row.otherCount;
    totals.wonAmount += row.wonAmount;
    totals.receivedAmount += row.receivedAmount;
  }

  return { from: range.from, to: range.to, rows, totals };
}
