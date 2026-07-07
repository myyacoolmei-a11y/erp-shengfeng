import { Router, type IRouter } from "express";
import { eq, count, sum, lte, gte, and, desc, ne, or, gt, sql } from "drizzle-orm";
import { db, customersTable, quotesTable, workOrdersTable, paymentsTable, maintenanceRemindersTable, warrantiesTable, receivablesTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

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

/** Has outstanding balance */
function remainingAmount(total: unknown, received: unknown): number {
  return Math.max(0, toAmount(total) - toAmount(received));
}

router.get("/dashboard/summary", requireRole("super_admin", "owner", "admin", "accountant"), async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const inThirtyDays = new Date();
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const thirtyDaysStr = inThirtyDays.toISOString().split("T")[0];

  const now = new Date();
  const firstOfMonthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const firstOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

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
    [monthlyQuoteAmountResult],
    [monthlyWonAmountResult],
    [monthlyPaidFromPaymentsResult],
    [todayDueResult],
    todayWorkOrderRows,
    receivablesPaidThisMonthRows,
    receivablesPaidTodayRows,
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
    // Monthly quote amount — prefer finalAmount, fallback to amount
    db.select({
      total: sum(sql`COALESCE(${quotesTable.finalAmount}::numeric, ${quotesTable.amount}::numeric, 0)`),
    }).from(quotesTable).where(gte(quotesTable.createdAt, firstOfMonthDate)),
    // Monthly won = receivables created this month (all statuses: unpaid / partial / paid)
    db.select({ total: sum(receivablesTable.totalAmount) }).from(receivablesTable).where(
      gte(receivablesTable.createdAt, firstOfMonthDate)
    ),
    // Monthly paid from independent payment records
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(
      gte(paymentsTable.paymentDate, firstOfMonthStr)
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
    // Receivable payments this month (actualPaymentDate or created this month with received > 0)
    db.select({
      id: receivablesTable.id,
      receivedAmount: receivablesTable.receivedAmount,
    }).from(receivablesTable).where(
      or(
        gte(receivablesTable.actualPaymentDate, firstOfMonthStr),
        and(
          gte(receivablesTable.createdAt, firstOfMonthDate),
          gt(receivablesTable.receivedAmount, "0"),
        ),
      )
    ),
    // Receivable payments today (actualPaymentDate = today)
    db.select({
      receivedAmount: receivablesTable.receivedAmount,
    }).from(receivablesTable).where(eq(receivablesTable.actualPaymentDate, today)),
  ]);

  let totalUnpaid = 0;
  let overdueAmount = 0;
  for (const r of allReceivables) {
    const remaining = remainingAmount(r.totalAmount, r.receivedAmount);
    if (remaining <= 0) continue;
    totalUnpaid += remaining;
    const isOverdueStatus = r.paymentStatus === "逾期" || r.paymentStatus?.toLowerCase() === "overdue";
    if (isOverdueStatus || (r.expectedPaymentDate && r.expectedPaymentDate < today && !isFullyPaidStatus(r.paymentStatus))) {
      overdueAmount += remaining;
    }
  }

  const monthlyPaidFromPayments = toAmount(monthlyPaidFromPaymentsResult.total);
  const monthlyPaidFromReceivables = receivablesPaidThisMonthRows.reduce(
    (s, r) => s + toAmount(r.receivedAmount),
    0,
  );
  // Payment records take priority; add receivable received amounts (most collections go through AR)
  const monthlyPaidAmount = monthlyPaidFromPayments + monthlyPaidFromReceivables;

  const todayPaymentsFromTable = toAmount(todayPaymentsResult.total);
  const todayPaymentsFromReceivables = receivablesPaidTodayRows.reduce(
    (s, r) => s + toAmount(r.receivedAmount),
    0,
  );
  const todayPaymentsAmount = todayPaymentsFromTable + todayPaymentsFromReceivables;

  const paidThisMonthAR = monthlyPaidFromReceivables;

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
    paidThisMonthAR,
    invoiceNotIssuedCount: invoiceNotIssuedResult.count,
    recentCustomers: recentCustomers.map(c => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    })),
    todayWorkOrderCount: todayWorkOrderCountResult.count,
    todayPaymentsAmount,
    todayMaintenanceCount: todayMaintenanceResult.count,
    monthlyQuoteAmount: toAmount(monthlyQuoteAmountResult.total),
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
