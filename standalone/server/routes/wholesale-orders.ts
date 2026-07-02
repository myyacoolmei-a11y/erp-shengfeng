import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc, SQL } from "drizzle-orm";
import {
  db, wholesaleOrdersTable, wholesaleOrderItemsTable, wholesaleReceivablesTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const ROLES = ["super_admin", "owner", "admin", "sales"] as const;
const DELETE_ROLES = ["super_admin", "owner", "admin"] as const;

const ItemInput = z.object({
  productId: z.number().int().nullable().optional(),
  productName: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  unit: z.string().optional(),
  qty: z.number().int().min(1),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).default(0),
  sortOrder: z.number().int().optional(),
});

const OrderInput = z.object({
  quoteId: z.number().int().nullable().optional(),
  quoteNumber: z.string().optional().nullable(),
  customerId: z.number().int().nullable().optional(),
  customerName: z.string().optional(),
  orderDate: z.string(),
  expectedDelivery: z.string().optional().nullable(),
  salesperson: z.string().optional(),
  notes: z.string().optional(),
  taxRate: z.number().min(0).default(0),
  shippingFee: z.number().min(0).default(0),
  status: z.string().optional(),
  items: z.array(ItemInput).default([]),
});

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeTotals(items: z.infer<typeof ItemInput>[], taxRate: number, shippingFee: number) {
  let subtotal = 0;
  const computed = items.map((item, idx) => {
    const discPct = item.discount ?? 0;
    const amount = round2(item.qty * item.unitPrice * (1 - discPct / 100));
    subtotal += amount;
    return { ...item, amount, sortOrder: item.sortOrder ?? idx };
  });
  subtotal = round2(subtotal);
  const taxAmount = round2(subtotal * taxRate / 100);
  const total = round2(subtotal + taxAmount + shippingFee);
  return { computed, subtotal, taxAmount, total };
}

function orderItemRow(item: z.infer<typeof ItemInput> & { amount: number }, orderId: number, idx: number) {
  return {
    orderId,
    productId: item.productId ?? null,
    productName: item.productName,
    brand: item.brand ?? null,
    model: item.model ?? null,
    unit: item.unit ?? null,
    qty: item.qty,
    unitPrice: String(item.unitPrice),
    discount: String(item.discount ?? 0),
    amount: String(item.amount),
    sortOrder: item.sortOrder ?? idx,
  };
}

async function getOrderWithItems(id: number) {
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, id));
  if (!order) return null;
  const items = await db.select().from(wholesaleOrderItemsTable)
    .where(eq(wholesaleOrderItemsTable.orderId, id))
    .orderBy(wholesaleOrderItemsTable.sortOrder);
  return { ...order, items };
}

async function maybeCreateReceivable(order: typeof wholesaleOrdersTable.$inferSelect) {
  const existing = await db.select({ id: wholesaleReceivablesTable.id })
    .from(wholesaleReceivablesTable)
    .where(eq(wholesaleReceivablesTable.orderId, order.id));
  if (existing.length === 0) {
    await db.insert(wholesaleReceivablesTable).values({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      totalAmount: order.total,
      receivedAmount: "0",
      paymentStatus: "未收款",
    });
  }
}

router.get("/wholesale/orders", requireRole(...ROLES), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conditions: SQL[] = [];
  if (search) {
    conditions.push(or(
      ilike(wholesaleOrdersTable.orderNumber, `%${search}%`),
      ilike(wholesaleOrdersTable.customerName, `%${search}%`),
    )!);
  }
  if (status && status !== "全部") conditions.push(eq(wholesaleOrdersTable.status, status));
  const rows = await db.select().from(wholesaleOrdersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wholesaleOrdersTable.createdAt));
  res.json(rows.map((r) => ({ ...r, items: [] })));
});

router.post("/wholesale/orders", requireRole(...ROLES), async (req, res): Promise<void> => {
  const parsed = OrderInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, taxRate, shippingFee, ...header } = parsed.data;
  const { computed, subtotal, taxAmount, total } = computeTotals(items, taxRate, shippingFee);
  const [order] = await db.insert(wholesaleOrdersTable).values({
    ...header,
    taxRate: String(taxRate),
    shippingFee: String(shippingFee),
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    total: String(total),
  }).returning();
  const orderNumber = `WO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(order.id).padStart(4, "0")}`;
  await db.update(wholesaleOrdersTable).set({ orderNumber }).where(eq(wholesaleOrdersTable.id, order.id));
  if (computed.length) {
    await db.insert(wholesaleOrderItemsTable).values(computed.map((item, idx) => orderItemRow(item, order.id, idx)));
  }
  const [final] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, order.id));
  if (final && (parsed.data.status === "已出貨")) {
    await maybeCreateReceivable(final);
  }
  const result = await getOrderWithItems(order.id);
  res.status(201).json(result);
});

router.get("/wholesale/orders/:id", requireRole(...ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await getOrderWithItems(id);
  if (!result) { res.status(404).json({ error: "找不到批發訂單" }); return; }
  res.json(result);
});

router.patch("/wholesale/orders/:id", requireRole(...ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = OrderInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, taxRate, shippingFee, ...header } = parsed.data;
  const { computed, subtotal, taxAmount, total } = computeTotals(items, taxRate, shippingFee);
  await db.update(wholesaleOrdersTable).set({
    ...header,
    taxRate: String(taxRate),
    shippingFee: String(shippingFee),
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    total: String(total),
    updatedAt: new Date(),
  }).where(eq(wholesaleOrdersTable.id, id));
  await db.delete(wholesaleOrderItemsTable).where(eq(wholesaleOrderItemsTable.orderId, id));
  if (computed.length) {
    await db.insert(wholesaleOrderItemsTable).values(computed.map((item, idx) => orderItemRow(item, id, idx)));
  }
  if (parsed.data.status === "已出貨") {
    const [updatedOrder] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, id));
    if (updatedOrder) await maybeCreateReceivable(updatedOrder);
  }
  const result = await getOrderWithItems(id);
  if (!result) { res.status(404).json({ error: "找不到批發訂單" }); return; }
  res.json(result);
});

router.delete("/wholesale/orders/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, id));
  res.status(204).send();
});

export default router;
