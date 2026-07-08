import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, quotesTable, customersTable, employeesTable, quoteItemsTable } from "@workspace/db";
import { CreateQuoteBody, UpdateQuoteBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import { syncQuoteDispatchBatch, syncQuoteDispatchStatus } from "../lib/quoteWorkflow";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "distributor"];
const WRITE_ROLES = ["super_admin", "owner", "admin", "sales", "distributor"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

const DISPATCH_FILTER_VALUES = new Set(["待派工", "已派工", "施工中", "已完工"]);

function serializeItem(item: typeof quoteItemsTable.$inferSelect) {
  return {
    id: item.id,
    quoteId: item.quoteId,
    category: item.category,
    itemName: item.itemName,
    brand: item.brand ?? null,
    quantity: parseFloat(item.quantity as string),
    unit: item.unit,
    unitPrice: parseFloat(item.unitPrice as string),
    subtotal: parseFloat(item.subtotal as string),
    notes: item.notes ?? null,
    sortOrder: item.sortOrder,
  };
}

function serializeQuote(
  q: any,
  items: any[] = [],
  workflow?: { dispatchStatus: string; workOrderId: number | null; workOrderNumber: string | null },
) {
  return {
    id: q.id,
    customerId: q.customerId ?? null,
    customerName: q.customerName ?? q.joinedCustomerName ?? null,
    contactPerson: q.contactPerson ?? null,
    title: q.title,
    description: q.description ?? null,
    amount: parseFloat(q.amount as string),
    discountAmount: q.discountAmount != null ? parseFloat(q.discountAmount as string) : null,
    finalAmount: q.finalAmount != null ? parseFloat(q.finalAmount as string) : null,
    status: q.status,
    dispatchStatus: workflow?.dispatchStatus ?? q.dispatchStatus ?? "未派工",
    workOrderId: workflow?.workOrderId ?? null,
    workOrderNumber: workflow?.workOrderNumber ?? null,
    notes: q.notes ?? null,
    address: q.address ?? null,
    customerPhone: q.customerPhone ?? null,
    taxType: q.taxType ?? "未稅",
    salesRepId: q.salesRepId ?? null,
    salesRepName: q.salesRepName ?? null,
    items,
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
    updatedAt: q.updatedAt instanceof Date ? q.updatedAt.toISOString() : q.updatedAt,
  };
}

async function buildItemsInsert(itemInputs: any[], quoteId: number) {
  return itemInputs.map((item: any, idx: number) => ({
    quoteId,
    category: item.category ?? "其他",
    itemName: item.itemName ?? "",
    brand: item.brand || null,
    quantity: String(item.quantity ?? 1),
    unit: item.unit ?? "台",
    unitPrice: String(item.unitPrice ?? 0),
    subtotal: String((item.quantity ?? 1) * (item.unitPrice ?? 0)),
    notes: item.notes || null,
    sortOrder: item.sortOrder ?? idx,
  }));
}

const QUOTE_SELECT = {
  id: quotesTable.id,
  customerId: quotesTable.customerId,
  customerName: quotesTable.customerName,
  joinedCustomerName: customersTable.name,
  contactPerson: quotesTable.contactPerson,
  title: quotesTable.title,
  description: quotesTable.description,
  amount: quotesTable.amount,
  discountAmount: quotesTable.discountAmount,
  finalAmount: quotesTable.finalAmount,
  status: quotesTable.status,
  dispatchStatus: quotesTable.dispatchStatus,
  notes: quotesTable.notes,
  address: quotesTable.address,
  customerPhone: quotesTable.customerPhone,
  taxType: quotesTable.taxType,
  salesRepId: quotesTable.salesRepId,
  salesRepName: employeesTable.name,
  createdAt: quotesTable.createdAt,
  updatedAt: quotesTable.updatedAt,
};

router.get("/quotes", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const { customerId, status, dispatchStatus } = req.query as {
    customerId?: string;
    status?: string;
    dispatchStatus?: string;
  };
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(quotesTable.customerId, cid));
  }
  if (status && !DISPATCH_FILTER_VALUES.has(status)) {
    conditions.push(eq(quotesTable.status, status));
  }
  if (dispatchStatus || (status && DISPATCH_FILTER_VALUES.has(status))) {
    conditions.push(eq(quotesTable.dispatchStatus, dispatchStatus ?? status!));
  }

  const quoteRows = await db
    .select(QUOTE_SELECT)
    .from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(quotesTable.salesRepId, employeesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(quotesTable.createdAt);

  if (quoteRows.length === 0) { res.json([]); return; }

  const workflowMap = await syncQuoteDispatchBatch(quoteRows);

  const quoteIds = quoteRows.map(q => q.id);
  const allItems = await db.select().from(quoteItemsTable)
    .where(inArray(quoteItemsTable.quoteId, quoteIds))
    .orderBy(quoteItemsTable.quoteId, quoteItemsTable.sortOrder);

  const itemsByQuote: Record<number, any[]> = {};
  for (const item of allItems) {
    const arr = itemsByQuote[item.quoteId] ?? [];
    arr.push(serializeItem(item));
    itemsByQuote[item.quoteId] = arr;
  }

  res.json(quoteRows.map(q => serializeQuote(q, itemsByQuote[q.id] ?? [], workflowMap.get(q.id))));
});

router.post("/quotes", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items: itemInputs = [], ...quoteFields } = parsed.data as any;

  let amount = Number(quoteFields.amount ?? 0);
  if (itemInputs.length > 0) {
    amount = itemInputs.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  }
  const discountAmount = Number(quoteFields.discountAmount ?? 0);
  const finalAmount = Math.max(0, amount - discountAmount);

  const data: any = {
    ...quoteFields,
    amount: String(amount),
    discountAmount: discountAmount >= 0 ? String(discountAmount) : "0",
    finalAmount: String(finalAmount),
    dispatchStatus: "未派工",
  };

  const [quote] = await db.insert(quotesTable).values(data).returning();

  let insertedItems: any[] = [];
  if (itemInputs.length > 0) {
    const rows = await buildItemsInsert(itemInputs, quote.id);
    insertedItems = await db.insert(quoteItemsTable).values(rows).returning();
  }

  const workflow = await syncQuoteDispatchStatus(quote.id);

  res.status(201).json(serializeQuote(
    { ...quote, joinedCustomerName: null, salesRepName: null },
    insertedItems.map(serializeItem),
    workflow ?? undefined,
  ));
});

router.get("/quotes/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [quote] = await db
    .select(QUOTE_SELECT)
    .from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(quotesTable.salesRepId, employeesTable.id))
    .where(eq(quotesTable.id, id));

  if (!quote) { res.status(404).json({ error: "找不到報價單" }); return; }

  const workflow = await syncQuoteDispatchStatus(id);

  const items = await db.select().from(quoteItemsTable)
    .where(eq(quoteItemsTable.quoteId, id))
    .orderBy(quoteItemsTable.sortOrder);

  res.json(serializeQuote(quote, items.map(serializeItem), workflow ?? undefined));
});

router.patch("/quotes/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items: itemInputs, dispatchStatus: _ignoredDispatch, ...quoteFields } = parsed.data as any;

  const data: Record<string, unknown> = { ...quoteFields };
  if (quoteFields.amount != null) data["amount"] = String(quoteFields.amount);
  if (quoteFields.discountAmount != null) {
    const d = Math.max(0, Number(quoteFields.discountAmount));
    data["discountAmount"] = String(d);
  }
  if (quoteFields.finalAmount != null) data["finalAmount"] = String(quoteFields.finalAmount);

  if (itemInputs !== undefined) {
    const itemArr: any[] = Array.isArray(itemInputs) ? itemInputs : [];
    const amount = itemArr.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    const discountAmount = Number(data["discountAmount"] ?? 0);
    const finalAmount = Math.max(0, amount - discountAmount);
    data["amount"] = String(amount);
    data["finalAmount"] = String(finalAmount);

    await db.delete(quoteItemsTable).where(eq(quoteItemsTable.quoteId, id));

    if (itemArr.length > 0) {
      const rows = await buildItemsInsert(itemArr, id);
      await db.insert(quoteItemsTable).values(rows);
    }
  }

  const [quote] = await db.update(quotesTable).set(data).where(eq(quotesTable.id, id)).returning();
  if (!quote) { res.status(404).json({ error: "找不到報價單" }); return; }

  const workflow = await syncQuoteDispatchStatus(id);

  const items = await db.select().from(quoteItemsTable)
    .where(eq(quoteItemsTable.quoteId, id))
    .orderBy(quoteItemsTable.sortOrder);

  res.json(serializeQuote(
    { ...quote, joinedCustomerName: null, salesRepName: null },
    items.map(serializeItem),
    workflow ?? undefined,
  ));
});

router.delete("/quotes/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [quote] = await db.delete(quotesTable).where(eq(quotesTable.id, id)).returning();
  if (!quote) { res.status(404).json({ error: "找不到報價單" }); return; }
  res.sendStatus(204);
});

export default router;
