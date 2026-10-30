import { Router, type IRouter } from "express";
import { asc } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, wholesaleOrdersTable, wholesaleCustomersTable } from "@workspace/db";
import { parseMoney, remainingAmount } from "../../shared/wholesalePaymentMath.ts";
import {
  aggregateWholesaleSettlementSummary,
  explainOrderSettlementEligibility,
} from "../../shared/wholesaleSettlementLogic.ts";
import { sumPaymentsForOrderIds } from "../lib/wholesale/wholesalePaymentService.ts";
import { syncMissingOrderCustomerLinks } from "./wholesale-settlements.ts";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/wholesale-settlement-check", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" && req.query.from.trim() ? req.query.from.trim() : "2026-10-01";
  const to = typeof req.query.to === "string" && req.query.to.trim() ? req.query.to.trim() : "2026-10-30";

  await syncMissingOrderCustomerLinks();

  const [allOrders, customers] = await Promise.all([
    db
      .select({
        id: wholesaleOrdersTable.id,
        orderNumber: wholesaleOrdersTable.orderNumber,
        customerId: wholesaleOrdersTable.customerId,
        customerName: wholesaleOrdersTable.customerName,
        orderDate: wholesaleOrdersTable.orderDate,
        expectedDelivery: wholesaleOrdersTable.expectedDelivery,
        status: wholesaleOrdersTable.status,
        subtotal: wholesaleOrdersTable.subtotal,
        taxRate: wholesaleOrdersTable.taxRate,
        taxAmount: wholesaleOrdersTable.taxAmount,
        shippingFee: wholesaleOrdersTable.shippingFee,
        total: wholesaleOrdersTable.total,
      })
      .from(wholesaleOrdersTable)
      .orderBy(asc(wholesaleOrdersTable.orderDate), asc(wholesaleOrdersTable.id)),
    db
      .select({
        id: wholesaleCustomersTable.id,
        companyName: wholesaleCustomersTable.companyName,
      })
      .from(wholesaleCustomersTable),
  ]);

  const receivedMap = await sumPaymentsForOrderIds(allOrders.map((o) => o.id));
  const summary = aggregateWholesaleSettlementSummary(allOrders, receivedMap, customers, { from, to });

  const orders = allOrders.map((o) => {
    const check = explainOrderSettlementEligibility(o, from, to);
    const totalAmount = parseMoney(o.total);
    const receivedAmount = receivedMap.get(o.id) ?? 0;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerId: o.customerId,
      customerName: o.customerName,
      orderDate: o.orderDate,
      expectedDelivery: o.expectedDelivery,
      status: o.status,
      totalAmount,
      receivedAmount,
      outstandingAmount: remainingAmount(totalAmount, receivedAmount),
      included: check.included,
      reason: check.reason,
    };
  });

  res.json({
    status: "ok",
    from,
    to,
    summary,
    orders,
  });
});

export default router;
