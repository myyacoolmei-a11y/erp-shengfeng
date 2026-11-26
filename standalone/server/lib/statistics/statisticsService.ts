/**
 * Unified business statistics — single source of truth for Dashboard, Employee KPI,
 * and any future analytics (rankings, charts, AI).
 */
import { and, count, eq, gte, lt, lte, ne, sum, inArray, desc, isNotNull, gt } from "drizzle-orm";
import {
  db,
  customersTable,
  quotesTable,
  quoteItemsTable,
  workOrdersTable,
  paymentsTable,
  maintenanceRemindersTable,
  warrantiesTable,
  receivablesTable,
  repairCasesTable,
  employeesTable,
  usersTable,
} from "@workspace/db";
import { computeSalesStats } from "./salesStatsService";
import { buildEmployeeReportingIndex } from "../../../shared/employeeReporting.ts";
import { mapSalesCaseCategory } from "../../../shared/salesStats.ts";
import { isQuoteWon } from "../../../shared/quoteStatus.ts";
import { computeQuoteDisplayTotal } from "../quoteTotals";
import { listPendingDispatchQuotes } from "../quoteWorkflow";
import {
  currentMonthRange,
  todayRange,
  type StatsDateRange,
  type StatsRangeParams,
  parseStatsRange,
} from "./dateRange";

export { parseStatsRange, currentMonthRange, todayRange, type StatsDateRange, type StatsRangeParams };

// ── Shared helpers ───────────────────────────────────────────────────────────

export function toAmount(val: unknown): number {
  if (val == null) return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  return Number.isFinite(n) ? n : 0;
}

function isFullyPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === "paid" || s === "已收款" || s === "已收";
}

export function remainingAmount(total: unknown, received: unknown): number {
  return Math.max(0, toAmount(total) - toAmount(received));
}

const QUOTE_SUMMARY_SELECT = {
  id: quotesTable.id,
  customerId: quotesTable.customerId,
  salesRepId: quotesTable.salesRepId,
  amount: quotesTable.amount,
  finalAmount: quotesTable.finalAmount,
  discountAmount: quotesTable.discountAmount,
  taxType: quotesTable.taxType,
  createdAt: quotesTable.createdAt,
};

async function loadQuoteItemsByQuoteId(quoteIds: number[]) {
  const map = new Map<number, Array<{ subtotal?: unknown }>>();
  if (quoteIds.length === 0) return map;
  const rows = await db
    .select({ quoteId: quoteItemsTable.quoteId, subtotal: quoteItemsTable.subtotal })
    .from(quoteItemsTable)
    .where(inArray(quoteItemsTable.quoteId, quoteIds));
  for (const row of rows) {
    const list = map.get(row.quoteId) ?? [];
    list.push({ subtotal: row.subtotal });
    map.set(row.quoteId, list);
  }
  return map;
}

function quoteDisplayTotal(
  quote: { id: number } & Parameters<typeof computeQuoteDisplayTotal>[0],
  itemsByQuoteId: Map<number, Array<{ subtotal?: unknown }>>,
): number {
  return computeQuoteDisplayTotal(quote, itemsByQuoteId.get(quote.id) ?? []);
}

// ── Period stats (shared by Dashboard + future APIs) ───────────────────────

export interface QuotePeriodStats {
  count: number;
  amount: number;
}

export interface ReceivablePeriodStats {
  count: number;
  amount: number;
}

export interface PaymentPeriodStats {
  amount: number;
}

export async function computeQuotePeriodStats(range: StatsDateRange): Promise<QuotePeriodStats> {
  const quotes = await db
    .select(QUOTE_SUMMARY_SELECT)
    .from(quotesTable)
    .where(and(
      gte(quotesTable.createdAt, range.startTs),
      lt(quotesTable.createdAt, range.endTsExclusive),
    ));

  const itemsByQuoteId = await loadQuoteItemsByQuoteId(quotes.map(q => q.id));
  let amount = 0;
  for (const q of quotes) {
    amount += quoteDisplayTotal(q, itemsByQuoteId);
  }
  return { count: quotes.length, amount };
}

/** All receivables created in period — creation = 成交 */
export async function computeReceivablePeriodStats(range: StatsDateRange): Promise<ReceivablePeriodStats> {
  const [row] = await db
    .select({
      count: count(),
      amount: sum(receivablesTable.totalAmount),
    })
    .from(receivablesTable)
    .where(and(
      gte(receivablesTable.createdAt, range.startTs),
      lt(receivablesTable.createdAt, range.endTsExclusive),
    ));
  return { count: row?.count ?? 0, amount: toAmount(row?.amount) };
}

/** Receivables collected in period — same source as 應收帳款 / 收款紀錄 pages */
export async function computeReceivableCollectionPeriodStats(range: StatsDateRange): Promise<PaymentPeriodStats> {
  const [row] = await db
    .select({ amount: sum(receivablesTable.receivedAmount) })
    .from(receivablesTable)
    .where(and(
      isNotNull(receivablesTable.actualPaymentDate),
      gt(receivablesTable.receivedAmount, "0"),
      gte(receivablesTable.actualPaymentDate, range.startDate),
      lte(receivablesTable.actualPaymentDate, range.endDate),
    ));
  return { amount: toAmount(row?.amount) };
}

/** @deprecated Alias — use computeReceivableCollectionPeriodStats */
export const computePaymentPeriodStats = computeReceivableCollectionPeriodStats;

export interface ReceivableBalanceStats {
  totalAmount: number;
  unpaidAmount: number;
  overdueAmount: number;
}

/** All-time receivable balances — matches 應收帳款 list unpaid sums */
export async function computeReceivableBalanceStats(today = fmtToday()): Promise<ReceivableBalanceStats> {
  const rows = await db.select({
    totalAmount: receivablesTable.totalAmount,
    receivedAmount: receivablesTable.receivedAmount,
    paymentStatus: receivablesTable.paymentStatus,
    expectedPaymentDate: receivablesTable.expectedPaymentDate,
  }).from(receivablesTable);

  let totalAmount = 0;
  let unpaidAmount = 0;
  let overdueAmount = 0;

  for (const r of rows) {
    totalAmount += toAmount(r.totalAmount);
    const remaining = remainingAmount(r.totalAmount, r.receivedAmount);
    if (remaining > 0) {
      unpaidAmount += remaining;
      const isOverdueStatus = r.paymentStatus === "逾期" || r.paymentStatus?.toLowerCase() === "overdue";
      if (
        isOverdueStatus
        || (r.expectedPaymentDate && r.expectedPaymentDate < today && !isFullyPaidStatus(r.paymentStatus))
      ) {
        overdueAmount += remaining;
      }
    }
  }

  return { totalAmount, unpaidAmount, overdueAmount };
}

function fmtToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Dashboard summary ────────────────────────────────────────────────────────

export async function getDashboardSummary() {
  const today = fmtToday();
  const monthRange = currentMonthRange();
  const todayRng = todayRange();

  const inThirtyDays = new Date();
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const thirtyDaysStr = inThirtyDays.toISOString().split("T")[0];

  const [
    quoteStats,
    receivableStats,
    paymentStats,
    balanceStats,
    todayPaymentStats,
    [totalCustomersResult],
    [totalQuotesResult],
    [totalWorkOrdersResult],
    [pendingWorkOrdersResult],
    [inProgressWorkOrdersResult],
    [completedWorkOrdersResult],
    [totalPaymentsResult],
    [upcomingMaintenanceResult],
    [expiringWarrantiesResult],
    recentCustomers,
    [invoiceNotIssuedResult],
    [todayWorkOrderCountResult],
    [todayMaintenanceResult],
    [todayDueResult],
    [todayWarrantyExpiryResult],
    todayWorkOrderRows,
    pendingDispatchQuotes,
  ] = await Promise.all([
    computeQuotePeriodStats(monthRange),
    computeReceivablePeriodStats(monthRange),
    computeReceivableCollectionPeriodStats(monthRange),
    computeReceivableBalanceStats(today),
    computeReceivableCollectionPeriodStats(todayRng),
    db.select({ count: count() }).from(customersTable),
    db.select({ count: count() }).from(quotesTable),
    db.select({ count: count() }).from(workOrdersTable),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.status, "待施工")),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.status, "進行中")),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.status, "已完成")),
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable),
    db.select({ count: count() }).from(maintenanceRemindersTable).where(
      and(eq(maintenanceRemindersTable.status, "待處理"), lte(maintenanceRemindersTable.reminderDate, thirtyDaysStr)),
    ),
    db.select({ count: count() }).from(warrantiesTable).where(
      and(gte(warrantiesTable.endDate, today), lte(warrantiesTable.endDate, thirtyDaysStr)),
    ),
    db.select().from(customersTable).orderBy(desc(customersTable.createdAt)).limit(5),
    db.select({ count: count() }).from(receivablesTable).where(
      and(eq(receivablesTable.invoiceStatus, "未開立"), ne(receivablesTable.paymentStatus, "已收款")),
    ),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.scheduledDate, today)),
    db.select({ count: count() }).from(maintenanceRemindersTable).where(
      and(eq(maintenanceRemindersTable.reminderDate, today), eq(maintenanceRemindersTable.status, "待處理")),
    ),
    db.select({ count: count() }).from(receivablesTable).where(
      and(eq(receivablesTable.expectedPaymentDate, today), ne(receivablesTable.paymentStatus, "已收款")),
    ),
    db.select({ count: count() }).from(warrantiesTable).where(eq(warrantiesTable.endDate, today)),
    db.select({
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      scheduledTime: workOrdersTable.scheduledTime,
      technicians: workOrdersTable.technicians,
      installAddress: workOrdersTable.installAddress,
      customerName: customersTable.name,
    })
      .from(workOrdersTable)
      .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
      .where(eq(workOrdersTable.scheduledDate, today))
      .orderBy(workOrdersTable.scheduledTime),
    listPendingDispatchQuotes(20),
  ]);

  const todayDueCount = todayDueResult.count;
  const todayWarrantyExpiryCount = todayWarrantyExpiryResult.count;
  const todayReminderCount = todayDueCount + todayWarrantyExpiryCount;

  return {
    totalCustomers: totalCustomersResult.count,
    totalQuotes: totalQuotesResult.count,
    totalWorkOrders: totalWorkOrdersResult.count,
    pendingWorkOrders: pendingWorkOrdersResult.count,
    inProgressWorkOrders: inProgressWorkOrdersResult.count,
    completedWorkOrders: completedWorkOrdersResult.count,
    totalPaymentsAmount: toAmount(totalPaymentsResult.total),
    upcomingMaintenanceCount: upcomingMaintenanceResult.count,
    expiringWarrantiesCount: expiringWarrantiesResult.count,
    totalReceivables: balanceStats.totalAmount,
    totalUnpaid: balanceStats.unpaidAmount,
    overdueAmount: balanceStats.overdueAmount,
    paidThisMonthAR: paymentStats.amount,
    invoiceNotIssuedCount: invoiceNotIssuedResult.count,
    recentCustomers: recentCustomers.map(c => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    })),
    todayWorkOrderCount: todayWorkOrderCountResult.count,
    todayPaymentsAmount: todayPaymentStats.amount,
    todayMaintenanceCount: todayMaintenanceResult.count,
    monthlyQuoteAmount: quoteStats.amount,
    monthlyWonAmount: receivableStats.amount,
    monthlyPaidAmount: paymentStats.amount,
    todayDueCount,
    todayWarrantyExpiryCount,
    todayReminderCount,
    pendingDispatchCount: pendingDispatchQuotes.length,
    pendingDispatchQuotes,
    todayWorkOrders: todayWorkOrderRows.map(o => ({
      id: o.id,
      workOrderNumber: o.workOrderNumber,
      customerName: o.customerName,
      scheduledTime: o.scheduledTime,
      technicians: o.technicians,
      installAddress: o.installAddress,
    })),
  };
}

// ── Employee KPI ─────────────────────────────────────────────────────────────

export interface SalesKpi {
  caseCount: number;
  salesInstallCount: number;
  salesMaintenanceCount: number;
  salesRepairCount: number;
  salesOtherCount: number;
  quoteWonInCohort: number;
  quoteCount: number;
  quoteAmount: number;
  wonCount: number;
  wonAmount: number;
  winRate: number;
  collectedAmount: number;
  unpaidAmount: number;
  collectionRate: number;
  avgTicket: number;
  performanceAmount: number;
}

export interface TechnicianKpi {
  installCount: number;
  maintenanceCount: number;
  repairCount: number;
  completedWorkOrderCount: number;
}

export interface EmployeeKpiRow {
  employeeId: number;
  employeeName: string;
  position: string;
  month: string;
  period: StatsDateRange["preset"];
  sales: SalesKpi;
  technician: TechnicianKpi;
}

function emptySales(): SalesKpi {
  return {
    caseCount: 0, salesInstallCount: 0, salesMaintenanceCount: 0, salesRepairCount: 0, salesOtherCount: 0, quoteWonInCohort: 0,
    quoteCount: 0,
    quoteAmount: 0,
    wonCount: 0,
    wonAmount: 0,
    winRate: 0,
    collectedAmount: 0,
    unpaidAmount: 0,
    collectionRate: 0,
    avgTicket: 0,
    performanceAmount: 0,
  };
}

function emptyTechnician(): TechnicianKpi {
  return { installCount: 0, maintenanceCount: 0, repairCount: 0, completedWorkOrderCount: 0 };
}

/** Batch-compute KPI for all employees in one pass (shared statistics core). */
export async function computeAllEmployeeKpis(range: StatsDateRange): Promise<EmployeeKpiRow[]> {
  // Use Taipei calendar dates for both pages, independent of server timezone.
  const startTs = new Date(`${range.startDate}T00:00:00+08:00`);
  const endTsExclusive = new Date(new Date(`${range.endDate}T00:00:00+08:00`).getTime() + 86400000);
  const [employees, users, monthQuotes, completedWorkOrders, repairRows, customerRows, salesStats] = await Promise.all([
    db.select().from(employeesTable).orderBy(employeesTable.name, employeesTable.id),
    db.select({ id: usersTable.id, linkedEmployeeId: usersTable.linkedEmployeeId, displayName: usersTable.displayName }).from(usersTable),
    db.select({ ...QUOTE_SUMMARY_SELECT, status: quotesTable.status }).from(quotesTable).where(and(
      gte(quotesTable.createdAt, startTs), lt(quotesTable.createdAt, endTsExclusive),
      ne(quotesTable.documentType, "intent"),
    )),
    db.select({
      id: workOrdersTable.id, projectType: workOrdersTable.projectType,
      assignedTo: workOrdersTable.assignedTo, assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians, primaryTechnician: workOrdersTable.primaryTechnician,
      extraTechnician: workOrdersTable.extraTechnician, jobTypes: workOrdersTable.jobTypes,
    }).from(workOrdersTable).where(and(
      eq(workOrdersTable.status, "已完成"),
      gte(workOrdersTable.completedDate, range.startDate), lte(workOrdersTable.completedDate, range.endDate),
    )),
    db.select({ employeeId: repairCasesTable.employeeId }).from(repairCasesTable).where(and(
      eq(repairCasesTable.status, "已完工"),
      gte(repairCasesTable.createdAt, startTs), lt(repairCasesTable.createdAt, endTsExclusive),
    )),
    db.select({ id: customersTable.id, primarySalesRepId: customersTable.primarySalesRepId }).from(customersTable),
    computeSalesStats({ from: range.startDate, to: range.endDate }),
  ]);
  const reporting = buildEmployeeReportingIndex(employees, users);
  const itemsByQuoteId = await loadQuoteItemsByQuoteId(monthQuotes.map(q => q.id));
  const customerSalesRep = new Map(customerRows.map(c => [c.id, c.primarySalesRepId]));
  const salesByEmp = new Map<number, SalesKpi>();
  const techByEmp = new Map<number, TechnicianKpi>();
  for (const emp of employees) {
    const id = reporting.employeeId(emp.id)!;
    if (!salesByEmp.has(id)) salesByEmp.set(id, emptySales());
    if (!techByEmp.has(id)) techByEmp.set(id, emptyTechnician());
  }
  for (const q of monthQuotes) {
    const repId = reporting.employeeId(q.salesRepId) ?? reporting.employeeId(q.customerId != null ? customerSalesRep.get(q.customerId) : null);
    if (repId == null) continue;
    const sales = salesByEmp.get(repId)!;
    sales.quoteCount += 1;
    sales.quoteAmount += quoteDisplayTotal(q, itemsByQuoteId);
    if (isQuoteWon(q.status)) sales.quoteWonInCohort += 1;
  }
  // The exact same case list/amounts as 業務統計, not a separate receivable count.
  for (const row of salesStats.rows) {
    for (const item of row.cases) {
      const id = reporting.employeeId(item.salesEmployeeId);
      if (id == null) continue; // Unlinked login remains visible in sales statistics, not guessed.
      const sales = salesByEmp.get(id)!;
      sales.caseCount += 1;
      if (item.category === "安裝") sales.salesInstallCount += 1;
      else if (item.category === "保養") sales.salesMaintenanceCount += 1;
      else if (item.category === "維修") sales.salesRepairCount += 1;
      else sales.salesOtherCount += 1;
      if (item.caseKey.startsWith("quote:") || item.wonAmount > 0) sales.wonCount += 1;
      sales.wonAmount += item.wonAmount;
      sales.collectedAmount += item.receivedAmount;
      sales.unpaidAmount += Math.max(0, item.wonAmount - item.receivedAmount);
    }
  }
  // Old technician assignments are stored as names. Resolve only unique employee
  // identities, and deduplicate each completed work order across multiple roles.
  const names = new Map<string, Set<number>>();
  for (const emp of employees) {
    const name = emp.name.trim();
    if (!name) continue;
    const ids = names.get(name) ?? new Set<number>();
    ids.add(reporting.employeeId(emp.id)!); names.set(name, ids);
  }
  for (const wo of completedWorkOrders) {
    const assigned = new Set<number>();
    const labels = [wo.assignedTo, wo.assistantTo, wo.primaryTechnician, wo.extraTechnician];
    try {
      const parsed = JSON.parse(wo.technicians ?? "[]");
      if (Array.isArray(parsed)) labels.push(...parsed.filter((v): v is string => typeof v === "string"));
    } catch { /* legacy non-JSON field: retain explicit assignments */ }
    for (const label of labels) {
      const ids = names.get((label ?? "").trim());
      if (ids?.size === 1) assigned.add([...ids][0]);
    }
    const categories = new Set([wo.projectType, ...(Array.isArray(wo.jobTypes) ? wo.jobTypes : [])].map(v => mapSalesCaseCategory(v, "work_order")));
    for (const id of assigned) {
      const tech = techByEmp.get(id)!;
      tech.completedWorkOrderCount += 1;
      if (categories.has("安裝")) tech.installCount += 1;
      if (categories.has("保養")) tech.maintenanceCount += 1;
      // Repair case table is the existing source for completed repair count.
    }
  }
  for (const rc of repairRows) {
    const id = reporting.employeeId(rc.employeeId);
    if (id != null) techByEmp.get(id)!.repairCount += 1;
  }

  return employees.map(emp => {
    const id = reporting.employeeId(emp.id)!;
    // Only the canonical row owns the totals. Historical records remain intact.
    const sales = id === emp.id ? salesByEmp.get(id)! : emptySales();
    sales.winRate = sales.quoteCount > 0 ? sales.quoteWonInCohort / sales.quoteCount : 0;
    sales.collectionRate = sales.wonAmount > 0 ? sales.collectedAmount / sales.wonAmount : 0;
    sales.avgTicket = sales.wonCount > 0 ? sales.wonAmount / sales.wonCount : 0;
    sales.performanceAmount = sales.wonAmount;
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      position: emp.position,
      month: range.label,
      period: range.preset,
      sales,
      technician: id === emp.id ? techByEmp.get(id)! : emptyTechnician(),
    };
  });
}

export async function computeEmployeeKpi(
  employee: { id: number; name: string; position: string },
  params: StatsRangeParams = {},
): Promise<EmployeeKpiRow> {
  const range = parseStatsRange(params);
  const rows = await computeAllEmployeeKpis(range);
  const row = rows.find(r => r.employeeId === employee.id);
  if (row) return row;
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    position: employee.position,
    month: range.label,
    period: range.preset,
    sales: emptySales(),
    technician: emptyTechnician(),
  };
}
