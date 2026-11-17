import { Router, type IRouter } from "express";
import { eq, ilike, or, and, gte, desc, inArray } from "drizzle-orm";
import { db, customersTable, employeesTable, quotesTable, workOrdersTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
} from "@workspace/api-zod";
import { requireFeature } from "../lib/auth";

const router: IRouter = Router();
router.use("/customers", requireFeature("customers"));

function customerCode(id: number): string {
  return `C-${String(id).padStart(5, "0")}`;
}

function mapCustomer(row: typeof customersTable.$inferSelect & { primarySalesRepName?: string | null }) {
  return {
    ...row,
    primarySalesRepId: row.primarySalesRepId ?? null,
    primarySalesRepName: row.primarySalesRepName ?? null,
    customerCode: customerCode(row.id),
    companyName: row.name,
  };
}

function mapSearchHit(row: {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  taxId: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    companyName: row.name,
    contactPerson: row.contactPerson,
    phone: row.phone,
    mobile: row.mobile,
    address: row.address,
    taxId: row.taxId,
    customerCode: customerCode(row.id),
  };
}

/** Search threshold: ≥2 CJK or ≥3 digits */
function meetsSearchThreshold(q: string): boolean {
  const s = q.trim();
  if (!s) return false;
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  return cjk >= 2 || digits >= 3;
}

const customerSelect = {
  id: customersTable.id,
  name: customersTable.name,
  contactPerson: customersTable.contactPerson,
  phone: customersTable.phone,
  mobile: customersTable.mobile,
  address: customersTable.address,
  email: customersTable.email,
  taxId: customersTable.taxId,
  primarySalesRepId: customersTable.primarySalesRepId,
  primarySalesRepName: employeesTable.name,
  source: customersTable.source,
  status: customersTable.status,
  discountScheme: customersTable.discountScheme,
  notes: customersTable.notes,
  createdAt: customersTable.createdAt,
  updatedAt: customersTable.updatedAt,
};

const SEARCH_LIMIT = 20;

/** GET /customers/search?q= — max 20; truncated=true when more match */
router.get("/customers/search", async (req, res): Promise<void> => {
  const q = String((req.query as { q?: string }).q ?? "").trim();
  if (!meetsSearchThreshold(q)) {
    res.json({ items: [], truncated: false, limit: SEARCH_LIMIT, reason: "threshold" });
    return;
  }

  const pattern = `%${q}%`;
  const idFromCode = (() => {
    const m = q.match(/^c-?0*(\d+)$/i);
    return m ? parseInt(m[1], 10) : NaN;
  })();

  const conditions = [
    ilike(customersTable.name, pattern),
    ilike(customersTable.contactPerson, pattern),
    ilike(customersTable.phone, pattern),
    ilike(customersTable.mobile, pattern),
    ilike(customersTable.address, pattern),
    ilike(customersTable.taxId, pattern),
    ilike(customersTable.email, pattern),
  ];
  if (Number.isFinite(idFromCode)) {
    conditions.push(eq(customersTable.id, idFromCode));
  }

  const rows = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      contactPerson: customersTable.contactPerson,
      phone: customersTable.phone,
      mobile: customersTable.mobile,
      address: customersTable.address,
      taxId: customersTable.taxId,
    })
    .from(customersTable)
    .where(or(...conditions))
    .orderBy(desc(customersTable.updatedAt))
    .limit(SEARCH_LIMIT + 1);

  const truncated = rows.length > SEARCH_LIMIT;
  const items = rows.slice(0, SEARCH_LIMIT).map(mapSearchHit);
  res.json({ items, truncated, limit: SEARCH_LIMIT });
});

/** Recent customers from quotes / work orders / updates — max 5 */
router.get("/customers/recent", async (_req, res): Promise<void> => {
  const recentQuotes = await db
    .select({ customerId: quotesTable.customerId })
    .from(quotesTable)
    .orderBy(desc(quotesTable.createdAt))
    .limit(15);

  const recentWos = await db
    .select({ customerId: workOrdersTable.customerId })
    .from(workOrdersTable)
    .orderBy(desc(workOrdersTable.createdAt))
    .limit(15);

  const recentUpdated = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .orderBy(desc(customersTable.updatedAt))
    .limit(10);

  const orderedIds: number[] = [];
  const push = (id: number | null | undefined) => {
    if (id == null || !Number.isFinite(id) || orderedIds.includes(id)) return;
    orderedIds.push(id);
  };
  for (const r of recentQuotes) push(r.customerId);
  for (const r of recentWos) push(r.customerId);
  for (const r of recentUpdated) push(r.id);

  const ids = orderedIds.slice(0, 5);
  if (ids.length === 0) {
    res.json({ items: [] });
    return;
  }

  const rows = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      contactPerson: customersTable.contactPerson,
      phone: customersTable.phone,
      mobile: customersTable.mobile,
      address: customersTable.address,
      taxId: customersTable.taxId,
    })
    .from(customersTable)
    .where(inArray(customersTable.id, ids));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = ids.map((id) => byId.get(id)).filter(Boolean).map((r) => mapSearchHit(r!));
  res.json({ items });
});

// NOTE: check-duplicate must come before /:id so Express doesn't capture "check-duplicate" as an id
router.post("/customers/check-duplicate", async (req, res): Promise<void> => {
  const { phone, mobile, taxId } = req.body as { phone?: string; mobile?: string; taxId?: string };
  const conditions = [];

  if (phone?.trim()) conditions.push(ilike(customersTable.phone, `%${phone.trim()}%`));
  if (mobile?.trim()) conditions.push(ilike(customersTable.mobile, `%${mobile.trim()}%`));
  if (taxId?.trim()) conditions.push(ilike(customersTable.taxId, `%${taxId.trim()}%`));

  if (conditions.length === 0) {
    res.json([]);
    return;
  }

  const matches = await db
    .select()
    .from(customersTable)
    .where(or(...conditions))
    .orderBy(desc(customersTable.createdAt));

  res.json(matches);
});

router.get("/customers", async (req, res): Promise<void> => {
  const { search, includeOld } = req.query as { search?: string; includeOld?: string };
  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(customersTable.name, `%${search}%`),
        ilike(customersTable.contactPerson, `%${search}%`),
        ilike(customersTable.phone, `%${search}%`),
        ilike(customersTable.mobile, `%${search}%`),
        ilike(customersTable.address, `%${search}%`),
        ilike(customersTable.email, `%${search}%`),
        ilike(customersTable.taxId, `%${search}%`),
      )
    );
  }

  if (includeOld !== "true") {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    conditions.push(gte(customersTable.createdAt, twoYearsAgo));
  }

  const customers = await db
    .select(customerSelect)
    .from(customersTable)
    .leftJoin(employeesTable, eq(customersTable.primarySalesRepId, employeesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(customersTable.createdAt));

  res.json(customers.map(mapCustomer));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.insert(customersTable).values(parsed.data).returning();
  if (customer.primarySalesRepId) {
    const [enriched] = await db
      .select(customerSelect)
      .from(customersTable)
      .leftJoin(employeesTable, eq(customersTable.primarySalesRepId, employeesTable.id))
      .where(eq(customersTable.id, customer.id));
    res.status(201).json(mapCustomer(enriched ?? { ...customer, primarySalesRepName: null }));
    return;
  }
  res.status(201).json(mapCustomer({ ...customer, primarySalesRepName: null }));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [customer] = await db
    .select(customerSelect)
    .from(customersTable)
    .leftJoin(employeesTable, eq(customersTable.primarySalesRepId, employeesTable.id))
    .where(eq(customersTable.id, id));
  if (!customer) {
    res.status(404).json({ error: "找不到客戶" });
    return;
  }
  res.json(mapCustomer(customer));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(customersTable)
    .set(parsed.data)
    .where(eq(customersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "找不到客戶" });
    return;
  }
  const [customer] = await db
    .select(customerSelect)
    .from(customersTable)
    .leftJoin(employeesTable, eq(customersTable.primarySalesRepId, employeesTable.id))
    .where(eq(customersTable.id, id));
  res.json(mapCustomer(customer ?? { ...updated, primarySalesRepName: null }));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [customer] = await db.delete(customersTable).where(eq(customersTable.id, id)).returning();
  if (!customer) {
    res.status(404).json({ error: "找不到客戶" });
    return;
  }
  res.sendStatus(204);
});

export default router;
