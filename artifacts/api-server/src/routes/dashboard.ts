import { Router, type IRouter } from "express";
import { eq, count, sum, lte, gte, and, desc, lt, ne } from "drizzle-orm";
import { db, customersTable, quotesTable, workOrdersTable, paymentsTable, maintenanceRemindersTable, warrantiesTable, receivablesTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireRole("owner", "admin", "accountant"), async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const inThirtyDays = new Date();
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const thirtyDaysStr = inThirtyDays.toISOString().split("T")[0];

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

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
  ] = await Promise.all([
    db.select({ count: count() }).from(customersTable),
    db.select({ count: count() }).from(quotesTable),
    db.select({ count: count() }).from(workOrdersTable),
    db.select({ count: count() }).from(workOrdersTable).where(eq(workOrdersTable.status, "待處理")),
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
          gte(receivablesTable.actualPaymentDate, firstOfMonth),
        )
      ),
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

  const paidThisMonthAR = paidThisMonthRows.reduce((sum, r) => sum + parseFloat(String(r.receivedAmount ?? "0")), 0);

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
  });
});

export default router;
