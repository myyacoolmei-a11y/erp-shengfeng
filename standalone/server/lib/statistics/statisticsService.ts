/**
 * Unified business statistics — single source of truth for Dashboard, Employee KPI,
 * and any future analytics (rankings, charts, AI).
 */
import { and, count, eq, gte, lt, lte, ne, sum, inArray, desc } from "drizzle-orm";
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
} from "@workspace/db";
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

function isWorkOrderAssignedTo(
  wo: { assignedTo: string | null; assistantTo: string | null; technicians: string | null },
  employeeName: string,
): boolean {
  if (wo.assignedTo === employeeName || wo.assistantTo === employeeName) return true;
  if (!wo.technicians) return false;
  try {
    const techs = JSON.parse(wo.technicians);
    return Array.isArray(techs) && techs.includes(employeeName);
  } catch {
    return false;
  }
}

function isInstallType(projectType: string | null | undefined): boolean {
  return projectType === "新裝" || projectType === "安裝";
}

function isMaintenanceType(projectType: string | null | undefined): boolean {
  return projectType === "保養" || projectType === "保固服務";
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

/** Payments table only — same source as 收款紀錄 page */
export async function computePaymentPeriodStats(range: StatsDateRange): Promise<PaymentPeriodStats> {
  const [row] = await db
    .select({ amount: sum(paymentsTable.amount) })
    .from(paymentsTable)
    .where(and(
      gte(paymentsTable.paymentDate, range.startDate),
      lte(paymentsTable.paymentDate, range.endDate),
    ));
  return { amount: toAmount(row?.amount) };
}

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
    computePaymentPeriodStats(monthRange),
    computeReceivableBalanceStats(today),
    computePaymentPeriodStats(todayRng),
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
  const employees = await db.select().from(employeesTable).orderBy(employeesTable.name);

  const [
    monthQuotes,
    receivableRows,
    paymentRows,
    completedWorkOrders,
    repairRows,
    workOrdersForQuotes,
    quotesForLookup,
    customerRows,
  ] = await Promise.all([
    db.select(QUOTE_SUMMARY_SELECT).from(quotesTable).where(and(
      gte(quotesTable.createdAt, range.startTs),
      lt(quotesTable.createdAt, range.endTsExclusive),
    )),
    db.select({
      id: receivablesTable.id,
      customerId: receivablesTable.customerId,
      totalAmount: receivablesTable.totalAmount,
      workOrderId: receivablesTable.workOrderId,
    }).from(receivablesTable).where(and(
      gte(receivablesTable.createdAt, range.startTs),
      lt(receivablesTable.createdAt, range.endTsExclusive),
    )),
    db.select({
      amount: paymentsTable.amount,
      customerId: paymentsTable.customerId,
      quoteId: paymentsTable.quoteId,
      workOrderId: paymentsTable.workOrderId,
    }).from(paymentsTable).where(and(
      gte(paymentsTable.paymentDate, range.startDate),
      lte(paymentsTable.paymentDate, range.endDate),
    )),
    db.select({
      id: workOrdersTable.id,
      quoteId: workOrdersTable.quoteId,
      projectType: workOrdersTable.projectType,
      assignedTo: workOrdersTable.assignedTo,
      assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians,
      completedDate: workOrdersTable.completedDate,
    }).from(workOrdersTable).where(and(
      eq(workOrdersTable.status, "已完成"),
      gte(workOrdersTable.completedDate, range.startDate),
      lte(workOrdersTable.completedDate, range.endDate),
    )),
    db.select({
      employeeId: repairCasesTable.employeeId,
    }).from(repairCasesTable).where(and(
      eq(repairCasesTable.status, "已完工"),
      gte(repairCasesTable.createdAt, range.startTs),
      lt(repairCasesTable.createdAt, range.endTsExclusive),
    )),
    db.select({ id: workOrdersTable.id, quoteId: workOrdersTable.quoteId }).from(workOrdersTable),
    db.select({ id: quotesTable.id, salesRepId: quotesTable.salesRepId }).from(quotesTable),
    db.select({ id: customersTable.id, primarySalesRepId: customersTable.primarySalesRepId }).from(customersTable),
  ]);

  const itemsByQuoteId = await loadQuoteItemsByQuoteId(monthQuotes.map(q => q.id));

  const quoteSalesRep = new Map<number, number | null>();
  for (const q of quotesForLookup) quoteSalesRep.set(q.id, q.salesRepId);

  const woQuoteId = new Map<number, number | null>();
  for (const wo of workOrdersForQuotes) woQuoteId.set(wo.id, wo.quoteId);

  const customerSalesRep = new Map<number, number | null>();
  for (const c of customerRows) customerSalesRep.set(c.id, c.primarySalesRepId);

  function resolveSalesRepId(
    quoteId: number | null | undefined,
    workOrderId: number | null | undefined,
    customerId?: number | null,
  ): number | null {
    if (quoteId != null) {
      const rep = quoteSalesRep.get(quoteId);
      if (rep != null) return rep;
    }
    if (workOrderId != null) {
      const qid = woQuoteId.get(workOrderId);
      if (qid != null) {
        const rep = quoteSalesRep.get(qid);
        if (rep != null) return rep;
      }
    }
    if (customerId != null) {
      const rep = customerSalesRep.get(customerId);
      if (rep != null) return rep;
    }
    return null;
  }

  const salesByEmp = new Map<number, SalesKpi>();
  const techByEmp = new Map<number, TechnicianKpi>();

  for (const emp of employees) {
    salesByEmp.set(emp.id, emptySales());
    techByEmp.set(emp.id, emptyTechnician());
  }

  for (const q of monthQuotes) {
    const repId = q.salesRepId ?? (q.customerId != null ? customerSalesRep.get(q.customerId) ?? null : null);
    if (repId == null) continue;
    const s = salesByEmp.get(repId);
    if (!s) continue;
    s.quoteCount += 1;
    s.quoteAmount += quoteDisplayTotal(q, itemsByQuoteId);
  }

  for (const r of receivableRows) {
    const repId = resolveSalesRepId(null, r.workOrderId, r.customerId);
    if (repId == null) continue;
    const s = salesByEmp.get(repId);
    if (!s) continue;
    s.wonCount += 1;
    s.wonAmount += toAmount(r.totalAmount);
  }

  for (const p of paymentRows) {
    const repId = resolveSalesRepId(p.quoteId, p.workOrderId, p.customerId);
    if (repId == null) continue;
    const s = salesByEmp.get(repId);
    if (!s) continue;
    s.collectedAmount += toAmount(p.amount);
  }

  for (const wo of completedWorkOrders) {
    for (const emp of employees) {
      if (!isWorkOrderAssignedTo(wo, emp.name)) continue;
      const t = techByEmp.get(emp.id)!;
      t.completedWorkOrderCount += 1;
      if (isInstallType(wo.projectType)) t.installCount += 1;
      if (isMaintenanceType(wo.projectType)) t.maintenanceCount += 1;
    }
  }

  for (const rc of repairRows) {
    if (rc.employeeId == null) continue;
    const t = techByEmp.get(rc.employeeId);
    if (!t) continue;
    t.repairCount += 1;
  }

  return employees.map(emp => {
    const sales = salesByEmp.get(emp.id)!;
    sales.winRate = sales.quoteCount > 0 ? sales.wonCount / sales.quoteCount : 0;
    sales.unpaidAmount = Math.max(0, sales.wonAmount - sales.collectedAmount);
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
      technician: techByEmp.get(emp.id)!,
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
