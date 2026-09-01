import { Router, type IRouter } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { db, quotesTable, customersTable, employeesTable, quoteItemsTable } from "@workspace/db";
import { CreateQuoteBody, UpdateQuoteBody } from "@workspace/api-zod";
import { requireFeature } from "../lib/auth";
import { syncQuoteDispatchBatch, syncQuoteDispatchStatus } from "../lib/quoteWorkflow";
import { QUOTE_STATUS_PENDING } from "../lib/quoteStatus";
import { resolveQuoteItemsForSave } from "../lib/productCatalog";
import { normalizeQuoteItemCategoryBrand } from "../../shared/quoteItemDisplay";
import { signQuoteShareToken } from "../lib/quoteShareToken";
import { winQuoteAndCreateWorkOrder, markQuoteLost } from "../lib/quoteWinDispatch";
import {
  QUOTE_DOCUMENT_SELECT,
  serializeQuoteItem,
  serializeQuoteDocument,
  loadQuoteDocument,
} from "../lib/quoteDocument";

const router: IRouter = Router();
router.use("/quotes", requireFeature("quotations"));


const DISPATCH_FILTER_VALUES = new Set(["待派工", "已派工", "施工中", "已完工"]);

const serializeItem = serializeQuoteItem;
const serializeQuote = serializeQuoteDocument;
const QUOTE_SELECT = QUOTE_DOCUMENT_SELECT;

async function buildItemsInsert(itemInputs: any[], quoteId: number) {
  return itemInputs.map((item: any, idx: number) => {
    const { category, brand } = normalizeQuoteItemCategoryBrand(item);
    return {
      quoteId,
      productId: item.productId ?? null,
      category,
      itemName: item.itemName ?? "",
      brand: brand || null,
      model: item.model || null,
      quantity: String(item.quantity ?? 1),
      unit: item.unit ?? "台",
      unitPrice: String(item.unitPrice ?? 0),
      subtotal: String((item.quantity ?? 1) * (item.unitPrice ?? 0)),
      notes: item.notes || null,
      sortOrder: item.sortOrder ?? idx,
    };
  });
}

router.get("/quotes", async (req, res): Promise<void> => {
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
    .orderBy(desc(quotesTable.createdAt), desc(quotesTable.id));

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

router.post("/quotes", async (req, res): Promise<void> => {
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
    lostReason: null,
    status: QUOTE_STATUS_PENDING,
  };

  const [quote] = await db.insert(quotesTable).values(data).returning();

  let insertedItems: any[] = [];
  if (itemInputs.length > 0) {
    const resolvedItems = await resolveQuoteItemsForSave(itemInputs);
    const rows = await buildItemsInsert(resolvedItems, quote.id);
    insertedItems = await db.insert(quoteItemsTable).values(rows).returning();
  }

  const workflow = await syncQuoteDispatchStatus(quote.id);

  res.status(201).json(serializeQuote(
    { ...quote, joinedCustomerName: null, salesRepName: null },
    insertedItems.map(serializeItem),
    workflow ?? undefined,
  ));
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const quote = await loadQuoteDocument(id);
  if (!quote) { res.status(404).json({ error: "找不到報價單" }); return; }

  res.json(quote);
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items: itemInputs, dispatchStatus: _ignoredDispatch, status: _ignoredStatus, ...quoteFields } = parsed.data as any;

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
      const resolvedItems = await resolveQuoteItemsForSave(itemArr);
      const rows = await buildItemsInsert(resolvedItems, id);
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

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [quote] = await db.delete(quotesTable).where(eq(quotesTable.id, id)).returning();
  if (!quote) { res.status(404).json({ error: "找不到報價單" }); return; }
  res.sendStatus(204);
});

/**
 * Create a public share URL for LINE / customers (no login required to view).
 * POST /api/quotes/:id/share-link
 */
router.post("/quotes/:id/share-link", async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const [quote] = await db
      .select({ id: quotesTable.id, title: quotesTable.title })
      .from(quotesTable)
      .where(eq(quotesTable.id, id))
      .limit(1);

    if (!quote) {
      res.status(404).json({ success: false, message: "找不到報價單" });
      return;
    }

    const token = signQuoteShareToken(id);
    const envBase = (process.env["PUBLIC_APP_URL"] || process.env["APP_URL"] || "").replace(/\/$/, "");
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    const origin = envBase || `${proto}://${host}`;
    const url = `${origin}/api/public/quotes/${token}`;

    res.json({
      success: true,
      url,
      token,
      quoteId: id,
      title: quote.title,
      expiresInDays: 30,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message || "建立分享連結失敗",
    });
  }
});

/**
 * One-shot: mark quote won AND create the linked work order.
 * POST /api/quotes/:id/win-and-dispatch
 */
router.post("/quotes/:id/win-and-dispatch", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const result = await winQuoteAndCreateWorkOrder(id);
  if (!result.ok) {
    res.status(result.status).json({
      error: result.error,
      workOrderId: result.workOrderId ?? null,
      workOrderNumber: result.workOrderNumber ?? null,
    });
    return;
  }

  res.status(result.created ? 201 : 200).json(result);
});

/**
 * Mark quote as 未成交 (lost deal) without creating a work order.
 * POST /api/quotes/:id/mark-lost
 */
router.post("/quotes/:id/mark-lost", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = (req.body ?? {}) as { reason?: string; detail?: string };
  const result = await markQuoteLost(id, body.reason, body.detail);
  if (!result.ok) {
    res.status(result.status).json({
      error: result.error,
      workOrderId: result.workOrderId ?? null,
      workOrderNumber: result.workOrderNumber ?? null,
    });
    return;
  }

  const quote = await loadQuoteDocument(id);
  res.json({ ok: true, quote });
});

export default router;
