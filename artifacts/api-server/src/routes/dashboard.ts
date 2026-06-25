import { Router, type IRouter } from "express";
import { eq, count, sum, lte, gte, and } from "drizzle-orm";
import { db, customersTable, quotesTable, workOrdersTable, paymentsTable, maintenanceRemindersTable, warrantiesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const inThirtyDays = new Date();
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const thirtyDaysStr = inThirtyDays.toISOString().split("T")[0];

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
    db.select().from(customersTable).orderBy(customersTable.createdAt).limit(5),
  ]);

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
    recentCustomers: recentCustomers.map(c => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    })),
  });
});

export default router;
