import { Router, type IRouter } from "express";
import { eq, count, sum, lte, gte, and, desc, ne } from "drizzle-orm";
import { db, customersTable, quotesTable, workOrdersTable, paymentsTable, maintenanceRemindersTable, warrantiesTable, receivablesTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

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
    paidThisMonthRows,
    [todayWorkOrderCountResult],
    [todayPaymentsResult],
    [todayMaintenanceResult],
    [monthlyQuoteAmountResult],
    [monthlyWonAmountResult],
    [monthlyPaidResult],
    [todayDueResult],
    todayWorkOrderRows,
  ] = await Promise.all([
    db.select({ count: count() }).from(customersTable),
    db.select({ count: count() }).from(quotesTable),
    db.select({ count: count() }).from(workOrdersTable),
    // 待施工 count (replaces old 待處理)
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
    }).from(receivablesTable).where(ne(receivablesTable.paymentStatus, "已收款")),
    db.select({ receivedAmount: receivablesTable.receivedAmount })
      .from(receivablesTable)
      .where(
        and(
          eq(receivablesTable.paymentStatus, "已收款"),
          gte(receivablesTable.actualPaymentDate, firstOfMonthStr),
        )
      ),
    // Today's work orders count
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.scheduledDate, today)),
    // Today's payments amount
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.paymentDate, today)),
    // Today's maintenance reminders
    db.select({ count: count() }).from(maintenanceRemindersTable).where(
      and(
        eq(maintenanceRemindersTable.reminderDate, today),
        eq(maintenanceRemindersTable.status, "待處理"),
      )
    ),
    // Monthly quote amount (quotes created this month)
    db.select({ total: sum(quotesTable.amount) }).from(quotesTable).where(
      gte(quotesTable.createdAt, firstOfMonthDate)
    ),
    // Monthly won quote amount
    db.select({ total: sum(quotesTable.amount) }).from(quotesTable).where(
      and(
        eq(quotesTable.status, "已成交"),
        gte(quotesTable.createdAt, firstOfMonthDate),
      )
    ),
    // Monthly paid (payments this month)
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(
      gte(paymentsTable.paymentDate, firstOfMonthStr)
    ),
    // Today due receivables (unpaid)
    db.select({ count: count() }).from(receivablesTable).where(
      and(
        eq(receivablesTable.expectedPaymentDate, today),
        ne(receivablesTable.paymentStatus, "已收款"),
      )
    ),
    // Today's work orders list
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
  ]);

  let totalUnpaid = 0;
  let overdueAmount = 0;
  for (const r of allReceivables) {
    const remaining = parseFloat(String(r.totalAmount ?? "0")) - parseFloat(String(r.receivedAmount ?? "0"));
    totalUnpaid += remaining;
    if (r.expectedPaymentDate && r.expectedPaymentDate < today) {
      overdueAmount += remaining;
    }
  }

  const paidThisMonthAR = paidThisMonthRows.reduce((s, r) => s + parseFloat(String(r.receivedAmount ?? "0")), 0);

  res.json({
    totalCustomers: totalCustomersResult.count,
    totalQuotes: totalQuotesResult.count,
    totalWorkOrders: totalWorkOrdersResult.count,
    pendingWorkOrders: pendingWorkOrdersResult.count,
    inProgressWorkOrders: inProgressWorkOrdersResult.count,
    completedWorkOrders: completedWorkOrdersResult.count,
    totalPaymentsAmount: parseFloat(totalPaymentsResult.total as string || "0"),
    upcomingMaintenanceCount: upcomingMaintenanceResult.count,
    expiringWarrantiesCount: expiringWarrantiesResult.count,
    totalReceivables: parseFloat(totalReceivablesResult.total as string || "0"),
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
    todayPaymentsAmount: parseFloat(todayPaymentsResult.total as string || "0"),
    todayMaintenanceCount: todayMaintenanceResult.count,
    monthlyQuoteAmount: parseFloat(monthlyQuoteAmountResult.total as string || "0"),
    monthlyWonAmount: parseFloat(monthlyWonAmountResult.total as string || "0"),
    monthlyPaidAmount: parseFloat(monthlyPaidResult.total as string || "0"),
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
