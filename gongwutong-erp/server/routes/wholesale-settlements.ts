import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { db, wholesaleOrdersTable, wholesaleOrderItemsTable, productsTable } from "@workspace/db";
import { requireFeature } from "../lib/auth";
import { z } from "zod/v4";
import {
  deriveWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
} from "../../shared/wholesalePaymentMath.ts";
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

const ACTIVE_STATUSES = ["已出貨"];

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

function serializePayment(row: {
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
}, createdByNameFallback?: string | null) {
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

// GET /wholesale/settlements/payments?orderId=
router.get("/wholesale/settlements/payments", async (req, res): Promise<void> => {
  const orderId = typeof req.query.orderId === "string" ? parseInt(req.query.orderId, 10) : NaN;
  if (isNaN(orderId)) { res.status(400).json({ error: "需要 orderId" }); return; }
  const rows = await listPaymentsForOrderIds([orderId]);
  res.json(rows.map(serializePayment));
});

// POST /wholesale/settlements/payments
router.post("/wholesale/settlements/payments", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "未登入" }); return; }
  const parsed = RecordPaymentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
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
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

  const conditions = [
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    inArray(wholesaleOrdersTable.status, ACTIVE_STATUSES),
  ];

  const orders = await db
    .select({
      id: wholesaleOrdersTable.id,
      customerId: wholesaleOrdersTable.customerId,
      customerName: wholesaleOrdersTable.customerName,
      total: wholesaleOrdersTable.total,
    })
    .from(wholesaleOrdersTable)
    .where(and(...conditions));

  const receivedMap = await sumPaymentsForOrderIds(orders.map(order => order.id));

  type Agg = {
    customerId: number;
    customerName: string;
    orderCount: number;
    totalAmount: number;
    receivedAmount: number;
  };
  const byCustomer = new Map<number, Agg>();

  for (const order of orders) {
    const cid = order.customerId ?? 0;
    const existing = byCustomer.get(cid) ?? {
      customerId: cid,
      customerName: order.customerName ?? "未知客戶",
      orderCount: 0,
      totalAmount: 0,
      receivedAmount: 0,
    };
    existing.orderCount += 1;
    existing.totalAmount = parseMoney(existing.totalAmount + parseMoney(order.total));
    existing.receivedAmount = parseMoney(existing.receivedAmount + (receivedMap.get(order.id) ?? 0));
    if (!existing.customerName || existing.customerName === "未知客戶") {
      existing.customerName = order.customerName ?? existing.customerName;
    }
    byCustomer.set(cid, existing);
  }

  const result = [...byCustomer.values()]
    .map((row) => {
      const outstanding = remainingAmount(row.totalAmount, row.receivedAmount);
      return {
        customerId: row.customerId,
        customerName: row.customerName,
        orderCount: row.orderCount,
        totalAmount: row.totalAmount,
        receivableAmount: outstanding,
        receivedAmount: row.receivedAmount,
        paymentStatus: deriveWholesalePaymentStatus(row.receivedAmount, row.totalAmount),
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  res.json(result);
});

async function ordersWithPaymentDetail(customerId: number, from: string, to: string) {
  const conditions = [
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    inArray(wholesaleOrdersTable.status, ACTIVE_STATUSES),
  ];

  if (customerId === 0) {
    conditions.push(sql`${wholesaleOrdersTable.customerId} IS NULL`);
  } else {
    conditions.push(eq(wholesaleOrdersTable.customerId, customerId));
  }

  const rows = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(and(...conditions))
    .orderBy(desc(wholesaleOrdersTable.orderDate), desc(wholesaleOrdersTable.id));

  const orderIds = rows.map(order => order.id);
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
      const receivedAmount = receivedMap.get(order.id) ?? 0;
      return {
        ...order,
        items,
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
  res.json(rows.map(serializePayment));
});

// GET /wholesale/settlements/:customerId?from=&to=
router.get("/wholesale/settlements/:customerId", async (req, res): Promise<void> => {
  const customerId = parseId(req.params.customerId);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customerId" }); return; }

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

  const ordersWithItems = await ordersWithPaymentDetail(customerId, from, to);
  res.json(ordersWithItems);
});

export default router;
