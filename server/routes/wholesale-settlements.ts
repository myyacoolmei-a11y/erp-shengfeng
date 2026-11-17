import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import {
  db,
  wholesaleOrdersTable,
  wholesaleOrderItemsTable,
  wholesaleCustomersTable,
  wholesaleReceivablesTable,
  wholesalePaymentRecordsTable,
  productsTable,
} from "@workspace/db";
import { requireFeature } from "../lib/auth";
import { z } from "zod/v4";
import {
  deriveWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
} from "../../shared/wholesalePaymentMath.ts";
import {
  aggregateWholesaleSettlementSummary,
  doesOrderMatchSettlementCustomer,
  explainOrderSettlementEligibility,
  normalizeWholesaleCompanyName,
  WHOLESALE_SETTLEMENT_ACTIVE_STATUS,
} from "../../shared/wholesaleSettlementLogic.ts";
import {
  deleteWholesalePayment,
  listPaymentsForCustomer,
  listPaymentsForOrderIds,
  recordWholesalePayment,
  sumPaymentsForOrderIds,
  updateWholesalePayment,
  WholesalePaymentError,
} from "../lib/wholesale/wholesalePaymentService.ts";

const router: IRouter = Router();
router.use("/wholesale/settlements", requireFeature("wholesale"));

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function handlePaymentError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof WholesalePaymentError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

const RecordPaymentInput = z.object({
  customerId: z.number().int(),
  orderId: z.number().int().optional(),
  amount: z.number().positive(),
  paymentDate: z.string().min(1),
  paymentMethod: z.string().optional(),
  note: z.string().optional().nullable(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const UpdatePaymentInput = z.object({
  amount: z.number().positive().optional(),
  paymentDate: z.string().min(1).optional(),
  paymentMethod: z.string().optional(),
  note: z.string().optional().nullable(),
});

function serializePayment(
  row: {
    id: number;
    wholesaleCustomerId: number | null;
    wholesaleOrderId: number | null;
    amount: string;
    paymentDate: string;
    paymentMethod: string | null;
    note: string | null;
    createdBy: number | null;
    createdByName?: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  createdByNameFallback?: string | null,
) {
  return {
    id: row.id,
    wholesaleCustomerId: row.wholesaleCustomerId,
    wholesaleOrderId: row.wholesaleOrderId,
    amount: parseMoney(row.amount),
    paymentDate: row.paymentDate,
    paymentMethod: row.paymentMethod,
    note: row.note,
    createdBy: row.createdBy,
    createdByName: row.createdByName ?? createdByNameFallback ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Non-destructively ensure wholesale_orders with a customerName have a valid customerId
 * linked to wholesale_customers, and orders with customerId have customerName filled.
 */
export async function syncMissingOrderCustomerLinks(): Promise<void> {
  const customers = await db
    .select({
      id: wholesaleCustomersTable.id,
      companyName: wholesaleCustomersTable.companyName,
    })
    .from(wholesaleCustomersTable);

  const byNormName = new Map<string, { id: number; companyName: string }>();
  const byId = new Map<number, string>();
  for (const c of customers) {
    const clean = (c.companyName ?? "").trim();
    if (!clean) continue;
    byId.set(c.id, clean);
    const norm = normalizeWholesaleCompanyName(clean);
    if (norm && !byNormName.has(norm)) {
      byNormName.set(norm, { id: c.id, companyName: clean });
    }
  }

  const orders = await db
    .select({
      id: wholesaleOrdersTable.id,
      customerId: wholesaleOrdersTable.customerId,
      customerName: wholesaleOrdersTable.customerName,
    })
    .from(wholesaleOrdersTable);

  for (const order of orders) {
    const rawName = (order.customerName ?? "").trim();
    const normName = normalizeWholesaleCompanyName(rawName);

    if (order.customerId != null && order.customerId > 0) {
      const linkedName = byId.get(order.customerId);
      if (!rawName && linkedName) {
        await db
          .update(wholesaleOrdersTable)
          .set({ customerName: linkedName })
          .where(eq(wholesaleOrdersTable.id, order.id));
      }
      continue;
    }

    if (!rawName || rawName === "未知客戶" || !normName) continue;

    let targetCustomer = byNormName.get(normName);
    if (!targetCustomer) {
      const [created] = await db
        .insert(wholesaleCustomersTable)
        .values({ companyName: rawName, paymentTerms: "月結" })
        .returning({
          id: wholesaleCustomersTable.id,
          companyName: wholesaleCustomersTable.companyName,
        });
      if (created) {
        targetCustomer = { id: created.id, companyName: created.companyName };
        byNormName.set(normName, targetCustomer);
        byId.set(created.id, created.companyName);
      }
    }

    if (targetCustomer) {
      await db
        .update(wholesaleOrdersTable)
        .set({ customerId: targetCustomer.id })
        .where(eq(wholesaleOrdersTable.id, order.id));
      await db
        .update(wholesaleReceivablesTable)
        .set({ customerId: targetCustomer.id })
        .where(
          and(
            eq(wholesaleReceivablesTable.orderId, order.id),
            sql`${wholesaleReceivablesTable.customerId} IS NULL`,
          ),
        );
      await db
        .update(wholesalePaymentRecordsTable)
        .set({ wholesaleCustomerId: targetCustomer.id })
        .where(
          and(
            eq(wholesalePaymentRecordsTable.wholesaleOrderId, order.id),
            sql`${wholesalePaymentRecordsTable.wholesaleCustomerId} IS NULL`,
          ),
        );
    }
  }
}

// GET /wholesale/settlements/payments?orderId=
router.get("/wholesale/settlements/payments", async (req, res): Promise<void> => {
  const orderId = typeof req.query.orderId === "string" ? parseInt(req.query.orderId, 10) : NaN;
  if (isNaN(orderId)) { res.status(400).json({ error: "需要 orderId" }); return; }
  const rows = await listPaymentsForOrderIds([orderId]);
  res.json(rows.map((r) => serializePayment(r)));
});

// POST /wholesale/settlements/payments
router.post("/wholesale/settlements/payments", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "未登入" }); return; }
  const parsed = RecordPaymentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    await syncMissingOrderCustomerLinks();
    const rows = await recordWholesalePayment({
      ...parsed.data,
      note: parsed.data.note ?? undefined,
      user: req.user,
    });
    const createdByName = req.user.displayName || req.user.username;
    res.status(201).json(rows.map((row) => serializePayment(row, createdByName)));
  } catch (err) {
    if (handlePaymentError(res, err)) return;
    throw err;
  }
});

// PATCH /wholesale/settlements/payments/:id
router.patch("/wholesale/settlements/payments/:id", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "未登入" }); return; }
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdatePaymentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const updated = await updateWholesalePayment({
      id,
      ...parsed.data,
      user: req.user,
    });
    res.json(serializePayment(updated));
  } catch (err) {
    if (handlePaymentError(res, err)) return;
    throw err;
  }
});

// DELETE /wholesale/settlements/payments/:id
router.delete("/wholesale/settlements/payments/:id", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "未登入" }); return; }
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const deleted = await deleteWholesalePayment({ id, user: req.user });
    res.json(serializePayment(deleted));
  } catch (err) {
    if (handlePaymentError(res, err)) return;
    throw err;
  }
});

// GET /wholesale/settlements/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/wholesale/settlements/summary", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
  const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

  await syncMissingOrderCustomerLinks();

  const conditions = [
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    sql`btrim(${wholesaleOrdersTable.status}) = ${WHOLESALE_SETTLEMENT_ACTIVE_STATUS}`,
  ];

  const [orders, customers] = await Promise.all([
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
      .where(and(...conditions))
      .orderBy(asc(wholesaleOrdersTable.orderDate), asc(wholesaleOrdersTable.id)),
    db
      .select({
        id: wholesaleCustomersTable.id,
        companyName: wholesaleCustomersTable.companyName,
      })
      .from(wholesaleCustomersTable),
  ]);

  const receivedMap = await sumPaymentsForOrderIds(orders.map((order) => order.id));
  const result = aggregateWholesaleSettlementSummary(orders, receivedMap, customers, { from, to });

  res.json(result);
});

// GET /wholesale/settlements/diagnostics?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/wholesale/settlements/diagnostics", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
  const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

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

  const evaluated = allOrders.map((order) => {
    const check = explainOrderSettlementEligibility(order, from, to);
    const totalAmount = parseMoney(order.total);
    const receivedAmount = receivedMap.get(order.id) ?? 0;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      orderDate: order.orderDate,
      expectedDelivery: order.expectedDelivery,
      status: order.status,
      totalAmount,
      receivedAmount,
      outstandingAmount: remainingAmount(totalAmount, receivedAmount),
      included: check.included,
      reason: check.reason,
    };
  });

  res.json({
    from,
    to,
    summary,
    includedOrders: evaluated.filter((o) => o.included),
    excludedOrders: evaluated.filter((o) => !o.included),
  });
});

async function ordersWithPaymentDetail(
  customerId: number,
  from: string,
  to: string,
  customerName?: string,
) {
  await syncMissingOrderCustomerLinks();

  const conditions = [
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    sql`btrim(${wholesaleOrdersTable.status}) = ${WHOLESALE_SETTLEMENT_ACTIVE_STATUS}`,
  ];

  const [candidateRows, customers] = await Promise.all([
    db
      .select()
      .from(wholesaleOrdersTable)
      .where(and(...conditions))
      .orderBy(asc(wholesaleOrdersTable.orderDate), asc(wholesaleOrdersTable.id)),
    db
      .select({
        id: wholesaleCustomersTable.id,
        companyName: wholesaleCustomersTable.companyName,
      })
      .from(wholesaleCustomersTable),
  ]);

  const rows = candidateRows.filter((order) =>
    doesOrderMatchSettlementCustomer(order, customerId, customerName, customers),
  );

  const orderIds = rows.map((order) => order.id);
  const receivedMap = await sumPaymentsForOrderIds(orderIds);
  const paymentRows = await listPaymentsForOrderIds(orderIds);
  const paymentsByOrder = new Map<number, ReturnType<typeof serializePayment>[]>();
  for (const payment of paymentRows) {
    if (payment.wholesaleOrderId == null) continue;
    const list = paymentsByOrder.get(payment.wholesaleOrderId) ?? [];
    list.push(serializePayment(payment));
    paymentsByOrder.set(payment.wholesaleOrderId, list);
  }

  return Promise.all(
    rows.map(async (order) => {
      const items = await db
        .select({
          id: wholesaleOrderItemsTable.id,
          orderId: wholesaleOrderItemsTable.orderId,
          productId: wholesaleOrderItemsTable.productId,
          productName: wholesaleOrderItemsTable.productName,
          brand: wholesaleOrderItemsTable.brand,
          model: wholesaleOrderItemsTable.model,
          unit: wholesaleOrderItemsTable.unit,
          qty: wholesaleOrderItemsTable.qty,
          unitPrice: wholesaleOrderItemsTable.unitPrice,
          discount: wholesaleOrderItemsTable.discount,
          amount: wholesaleOrderItemsTable.amount,
          sortOrder: wholesaleOrderItemsTable.sortOrder,
          spec: productsTable.spec,
        })
        .from(wholesaleOrderItemsTable)
        .leftJoin(productsTable, eq(wholesaleOrderItemsTable.productId, productsTable.id))
        .where(eq(wholesaleOrderItemsTable.orderId, order.id))
        .orderBy(wholesaleOrderItemsTable.sortOrder);

      const totalAmount = parseMoney(order.total);
      const subtotalAmount = parseMoney(order.subtotal);
      const taxAmountNum = parseMoney(order.taxAmount);
      const shippingFeeNum = parseMoney(order.shippingFee);
      const receivedAmount = receivedMap.get(order.id) ?? 0;
      return {
        ...order,
        items,
        subtotalAmount,
        taxAmountNum,
        shippingFeeNum,
        orderAmount: totalAmount,
        receivedAmount,
        outstandingAmount: remainingAmount(totalAmount, receivedAmount),
        paymentStatus: deriveWholesalePaymentStatus(receivedAmount, totalAmount),
        payments: paymentsByOrder.get(order.id) ?? [],
      };
    }),
  );
}

// GET /wholesale/settlements/:customerId/payments
router.get("/wholesale/settlements/:customerId/payments", async (req, res): Promise<void> => {
  const customerId = parseId(req.params.customerId);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customerId" }); return; }
  const rows = await listPaymentsForCustomer(customerId);
  res.json(rows.map((r) => serializePayment(r)));
});

// GET /wholesale/settlements/:customerId?from=&to=&customerName=
router.get("/wholesale/settlements/:customerId", async (req, res): Promise<void> => {
  const customerId = parseId(req.params.customerId);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customerId" }); return; }

  const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
  const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;
  const customerName = typeof req.query.customerName === "string" ? req.query.customerName.trim() : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

  const ordersWithItems = await ordersWithPaymentDetail(customerId, from, to, customerName);
  res.json(ordersWithItems);
});

export default router;
