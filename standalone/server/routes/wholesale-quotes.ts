import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc, SQL } from "drizzle-orm";
import {
  db, wholesaleQuotesTable, wholesaleQuoteItemsTable,
  wholesaleOrdersTable, wholesaleOrderItemsTable, wholesaleReceivablesTable,
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

const QuoteInput = z.object({
  customerId: z.number().int().nullable().optional(),
  customerName: z.string().optional(),
  quoteDate: z.string(),
  expiryDate: z.string().optional().nullable(),
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

function genQuoteNum(id: number): string {
  const d = new Date();
  return `WQ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${String(id).padStart(4, "0")}`;
}

function genOrderNum(id: number): string {
  const d = new Date();
  return `WO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${String(id).padStart(4, "0")}`;
}

function itemRow(item: z.infer<typeof ItemInput> & { amount: number }, quoteId: number, idx: number) {
  return {
    quoteId,
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

async function getQuoteWithItems(id: number) {
  const [quote] = await db.select().from(wholesaleQuotesTable).where(eq(wholesaleQuotesTable.id, id));
  if (!quote) return null;
  const items = await db.select().from(wholesaleQuoteItemsTable)
    .where(eq(wholesaleQuoteItemsTable.quoteId, id))
    .orderBy(wholesaleQuoteItemsTable.sortOrder);
  return { ...quote, items };
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

router.get("/wholesale/quotes", requireRole(...ROLES), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conditions: SQL[] = [];
  if (search) {
    conditions.push(or(
      ilike(wholesaleQuotesTable.quoteNumber, `%${search}%`),
      ilike(wholesaleQuotesTable.customerName, `%${search}%`),
    )!);
  }
  if (status && status !== "全部") conditions.push(eq(wholesaleQuotesTable.status, status));
  const rows = await db.select().from(wholesaleQuotesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wholesaleQuotesTable.createdAt));
  res.json(rows.map((r) => ({ ...r, items: [] })));
});

router.post("/wholesale/quotes", requireRole(...ROLES), async (req, res): Promise<void> => {
  const parsed = QuoteInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, taxRate, shippingFee, ...header } = parsed.data;
  const { computed, subtotal, taxAmount, total } = computeTotals(items, taxRate, shippingFee);
  const [quote] = await db.insert(wholesaleQuotesTable).values({
    ...header,
    taxRate: String(taxRate),
    shippingFee: String(shippingFee),
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    total: String(total),
  }).returning();
  const quoteNumber = genQuoteNum(quote.id);
  await db.update(wholesaleQuotesTable).set({ quoteNumber }).where(eq(wholesaleQuotesTable.id, quote.id));
  if (computed.length) {
    await db.insert(wholesaleQuoteItemsTable).values(computed.map((item, idx) => itemRow(item, quote.id, idx)));
  }
  const result = await getQuoteWithItems(quote.id);
  res.status(201).json(result);
});

router.post("/wholesale/quotes/:id/convert", requireRole(...ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const quote = await getQuoteWithItems(id);
  if (!quote) { res.status(404).json({ error: "找不到批發報價單" }); return; }

  const today = new Date().toISOString().split("T")[0];
  const [order] = await db.insert(wholesaleOrdersTable).values({
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    customerId: quote.customerId,
    customerName: quote.customerName,
    orderDate: today,
    salesperson: quote.salesperson,
    notes: quote.notes,
    subtotal: quote.subtotal,
    taxRate: quote.taxRate,
    taxAmount: quote.taxAmount,
    shippingFee: quote.shippingFee,
    total: quote.total,
    status: "草稿",
  }).returning();

  const orderNumber = genOrderNum(order.id);
  await db.update(wholesaleOrdersTable).set({ orderNumber }).where(eq(wholesaleOrdersTable.id, order.id));

  if (quote.items.length) {
    await db.insert(wholesaleOrderItemsTable).values(quote.items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      productName: item.productName,
      brand: item.brand,
      model: item.model,
      unit: item.unit,
      qty: item.qty,
      unitPrice: item.unitPrice,
      discount: item.discount,
      amount: item.amount,
      sortOrder: item.sortOrder,
    })));
  }

  await db.update(wholesaleQuotesTable).set({ status: "已接受" }).where(eq(wholesaleQuotesTable.id, id));

  const [finalOrder] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, order.id));
  const orderItems = await db.select().from(wholesaleOrderItemsTable)
    .where(eq(wholesaleOrderItemsTable.orderId, order.id))
    .orderBy(wholesaleOrderItemsTable.sortOrder);
  res.status(201).json({ ...finalOrder, items: orderItems });
});

router.get("/wholesale/quotes/:id", requireRole(...ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await getQuoteWithItems(id);
  if (!result) { res.status(404).json({ error: "找不到批發報價單" }); return; }
  res.json(result);
});

router.patch("/wholesale/quotes/:id", requireRole(...ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = QuoteInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, taxRate, shippingFee, ...header } = parsed.data;
  const { computed, subtotal, taxAmount, total } = computeTotals(items, taxRate, shippingFee);
  await db.update(wholesaleQuotesTable).set({
    ...header,
    taxRate: String(taxRate),
    shippingFee: String(shippingFee),
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    total: String(total),
    updatedAt: new Date(),
  }).where(eq(wholesaleQuotesTable.id, id));
  await db.delete(wholesaleQuoteItemsTable).where(eq(wholesaleQuoteItemsTable.quoteId, id));
  if (computed.length) {
    await db.insert(wholesaleQuoteItemsTable).values(computed.map((item, idx) => itemRow(item, id, idx)));
  }
  const result = await getQuoteWithItems(id);
  if (!result) { res.status(404).json({ error: "找不到批發報價單" }); return; }
  res.json(result);
});

router.delete("/wholesale/quotes/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(wholesaleQuotesTable).where(eq(wholesaleQuotesTable.id, id));
  res.status(204).send();
});

export default router;
