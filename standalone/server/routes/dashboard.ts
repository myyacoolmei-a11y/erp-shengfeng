import { Router, type IRouter } from "express";
import { eq, count, sum, lte, gte, and, desc, ne, inArray } from "drizzle-orm";
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
} from "@workspace/db";
import { requireRole } from "../lib/auth";
import { computeQuoteDisplayTotal } from "../lib/quoteTotals";

const router: IRouter = Router();

/** Parse numeric / numeric-string DB values; null/undefined => 0 */
function toAmount(val: unknown): number {
  if (val == null) return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  return Number.isFinite(n) ? n : 0;
}

/** Fully settled — compatible with Chinese and English status labels */
function isFullyPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === "paid" || s === "已收款" || s === "已收";
}

/** Outstanding balance: totalAmount - receivedAmount */
function remainingAmount(total: unknown, received: unknown): number {
  return Math.max(0, toAmount(total) - toAmount(received));
}

const QUOTE_SUMMARY_SELECT = {
  id: quotesTable.id,
  amount: quotesTable.amount,
  finalAmount: quotesTable.finalAmount,
  discountAmount: quotesTable.discountAmount,
  taxType: quotesTable.taxType,
  createdAt: quotesTable.createdAt,
};

router.get("/dashboard/summary", requireRole("super_admin", "owner", "admin", "accountant"), async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const inThirtyDays = new Date();
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const thirtyDaysStr = inThirtyDays.toISOString().split("T")[0];

  const now = new Date();
  const firstOfMonthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const firstOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [
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
    [totalReceivablesResult],
    [invoiceNotIssuedResult],
    allReceivables,
    [todayWorkOrderCountResult],
    [todayPaymentsResult],
    [todayMaintenanceResult],
    [monthlyWonAmountResult],
    [monthlyPaidFromPaymentsResult],
    [todayDueResult],
    todayWorkOrderRows,
    monthlyQuoteRows,
  ] = await Promise.all([
    db.select({ count: count() }).from(customersTable),
    db.select({ count: count() }).from(quotesTable),
    db.select({ count: count() }).from(workOrdersTable),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.status, "待施工")),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.status, "進行中")),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.status, "已完成")),
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable),
    db.select({ count: count() }).from(maintenanceRemindersTable).where(
      and(
        eq(maintenanceRemindersTable.status, "待處理"),
        lte(maintenanceRemindersTable.reminderDate, thirtyDaysStr),
      )
    ),
    db.select({ count: count() }).from(warrantiesTable).where(
      and(
        gte(warrantiesTable.endDate, today),
        lte(warrantiesTable.endDate, thirtyDaysStr),
      )
    ),
    db.select().from(customersTable).orderBy(desc(customersTable.createdAt)).limit(5),
    db.select({ total: sum(receivablesTable.totalAmount) }).from(receivablesTable),
    db.select({ count: count() }).from(receivablesTable).where(
      and(
        eq(receivablesTable.invoiceStatus, "未開立"),
        ne(receivablesTable.paymentStatus, "已收款"),
      )
    ),
    db.select({
      totalAmount: receivablesTable.totalAmount,
      receivedAmount: receivablesTable.receivedAmount,
      paymentStatus: receivablesTable.paymentStatus,
      expectedPaymentDate: receivablesTable.expectedPaymentDate,
    }).from(receivablesTable),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.scheduledDate, today)),
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.paymentDate, today)),
    db.select({ count: count() }).from(maintenanceRemindersTable).where(
      and(
        eq(maintenanceRemindersTable.reminderDate, today),
        eq(maintenanceRemindersTable.status, "待處理"),
      )
    ),
    // Monthly won = receivables created this month (unpaid / partial / paid all count)
    db.select({ total: sum(receivablesTable.totalAmount) }).from(receivablesTable).where(
      and(
        gte(receivablesTable.createdAt, firstOfMonthDate),
        lte(receivablesTable.createdAt, lastOfMonthDate),
      )
    ),
    // Monthly paid — payments table only (same source as 收款紀錄 page)
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(
      and(
        gte(paymentsTable.paymentDate, firstOfMonthStr),
        lte(paymentsTable.paymentDate, today),
      )
    ),
    db.select({ count: count() }).from(receivablesTable).where(
      and(
        eq(receivablesTable.expectedPaymentDate, today),
        ne(receivablesTable.paymentStatus, "已收款"),
      )
    ),
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
    // Quotes created this month — amount computed same as quotes list
    db.select(QUOTE_SUMMARY_SELECT).from(quotesTable).where(
      and(
        gte(quotesTable.createdAt, firstOfMonthDate),
        lte(quotesTable.createdAt, lastOfMonthDate),
      )
    ),
  ]);

  const monthlyQuoteIds = monthlyQuoteRows.map(q => q.id);
  const monthlyQuoteItems = monthlyQuoteIds.length > 0
    ? await db.select({
        quoteId: quoteItemsTable.quoteId,
        subtotal: quoteItemsTable.subtotal,
      }).from(quoteItemsTable).where(inArray(quoteItemsTable.quoteId, monthlyQuoteIds))
    : [];

  const itemsByQuoteId = new Map<number, Array<{ subtotal?: unknown }>>();
  for (const item of monthlyQuoteItems) {
    const list = itemsByQuoteId.get(item.quoteId) ?? [];
    list.push({ subtotal: item.subtotal });
    itemsByQuoteId.set(item.quoteId, list);
  }

  let monthlyQuoteAmount = 0;
  for (const quote of monthlyQuoteRows) {
    monthlyQuoteAmount += computeQuoteDisplayTotal(quote, itemsByQuoteId.get(quote.id) ?? []);
  }

  let totalUnpaid = 0;
  let overdueAmount = 0;
  for (const r of allReceivables) {
    const remaining = remainingAmount(r.totalAmount, r.receivedAmount);
    if (remaining > 0) {
      totalUnpaid += remaining;
    }
    if (remaining <= 0) continue;
    const isOverdueStatus = r.paymentStatus === "逾期" || r.paymentStatus?.toLowerCase() === "overdue";
    if (isOverdueStatus || (r.expectedPaymentDate && r.expectedPaymentDate < today && !isFullyPaidStatus(r.paymentStatus))) {
      overdueAmount += remaining;
    }
  }

  const monthlyPaidAmount = toAmount(monthlyPaidFromPaymentsResult.total);
  const todayPaymentsAmount = toAmount(todayPaymentsResult.total);

  res.json({
    totalCustomers: totalCustomersResult.count,
    totalQuotes: totalQuotesResult.count,
    totalWorkOrders: totalWorkOrdersResult.count,
    pendingWorkOrders: pendingWorkOrdersResult.count,
    inProgressWorkOrders: inProgressWorkOrdersResult.count,
    completedWorkOrders: completedWorkOrdersResult.count,
    totalPaymentsAmount: toAmount(totalPaymentsResult.total),
    upcomingMaintenanceCount: upcomingMaintenanceResult.count,
    expiringWarrantiesCount: expiringWarrantiesResult.count,
    totalReceivables: toAmount(totalReceivablesResult.total),
    totalUnpaid,
    overdueAmount,
    paidThisMonthAR: monthlyPaidAmount,
    invoiceNotIssuedCount: invoiceNotIssuedResult.count,
    recentCustomers: recentCustomers.map(c => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    })),
    todayWorkOrderCount: todayWorkOrderCountResult.count,
    todayPaymentsAmount,
    todayMaintenanceCount: todayMaintenanceResult.count,
    monthlyQuoteAmount,
    monthlyWonAmount: toAmount(monthlyWonAmountResult.total),
    monthlyPaidAmount,
    todayDueCount: todayDueResult.count,
    todayWorkOrders: todayWorkOrderRows.map(o => ({
      id: o.id,
      workOrderNumber: o.workOrderNumber,
      customerName: o.customerName,
      scheduledTime: o.scheduledTime,
      technicians: o.technicians,
      installAddress: o.installAddress,
    })),
  });
});

export default router;
