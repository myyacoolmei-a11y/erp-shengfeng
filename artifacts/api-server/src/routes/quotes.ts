import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, quotesTable, customersTable, employeesTable } from "@workspace/db";
import { CreateQuoteBody, UpdateQuoteBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "distributor"];
const WRITE_ROLES = ["super_admin", "owner", "admin", "sales", "distributor"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

function serializeQuote(q: {
  id: number;
  customerId: number | null;
  customerName: string | null;
  title: string;
  description: string | null;
  amount: unknown;
  discountAmount: unknown;
  finalAmount: unknown;
  status: string;
  notes: string | null;
  address: string | null;
  customerPhone: string | null;
  taxType: string;
  salesRepId: number | null;
  salesRepName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}) {
  return {
    ...q,
    amount: parseFloat(q.amount as string),
    discountAmount: q.discountAmount != null ? parseFloat(q.discountAmount as string) : null,
    finalAmount: q.finalAmount != null ? parseFloat(q.finalAmount as string) : null,
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
    updatedAt: q.updatedAt instanceof Date ? q.updatedAt.toISOString() : q.updatedAt,
  };
}

const QUOTE_SELECT = {
  id: quotesTable.id,
  customerId: quotesTable.customerId,
  customerName: customersTable.name,
  title: quotesTable.title,
  description: quotesTable.description,
  amount: quotesTable.amount,
  discountAmount: quotesTable.discountAmount,
  finalAmount: quotesTable.finalAmount,
  status: quotesTable.status,
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
  const { customerId, status } = req.query as { customerId?: string; status?: string };
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(quotesTable.customerId, cid));
  }
  if (status) conditions.push(eq(quotesTable.status, status));

  const quotes = await db
    .select(QUOTE_SELECT)
    .from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(quotesTable.salesRepId, employeesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(quotesTable.createdAt);

  res.json(quotes.map(serializeQuote));
});

router.post("/quotes", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = {
    ...parsed.data,
    amount: String(parsed.data.amount ?? 0),
    discountAmount: parsed.data.discountAmount != null ? String(parsed.data.discountAmount) : undefined,
    finalAmount: parsed.data.finalAmount != null ? String(parsed.data.finalAmount) : undefined,
  };
  const [quote] = await db.insert(quotesTable).values(data).returning();
  res.status(201).json(serializeQuote({
    ...quote,
    customerName: null,
    salesRepName: null,
  }));
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
  res.json(serializeQuote(quote));
});

router.patch("/quotes/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount != null) data["amount"] = String(parsed.data.amount);
  if (parsed.data.discountAmount != null) data["discountAmount"] = String(parsed.data.discountAmount);
  if (parsed.data.finalAmount != null) data["finalAmount"] = String(parsed.data.finalAmount);

  const [quote] = await db.update(quotesTable).set(data).where(eq(quotesTable.id, id)).returning();
  if (!quote) { res.status(404).json({ error: "找不到報價單" }); return; }
  res.json(serializeQuote({
    ...quote,
    customerName: null,
    salesRepName: null,
  }));
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
