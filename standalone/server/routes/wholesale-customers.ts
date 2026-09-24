import { Router, type IRouter } from "express";
import { eq, ilike, or, desc } from "drizzle-orm";
import { db, pool, wholesaleCustomersTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireFeature } from "../lib/auth";
import { getCustomerStatement, listCustomerMonthOrders, listCustomerSummaries, listSalesOptions, listUnpaidOrders } from "../lib/wholesale/accountService";
import { shouldApplyOwnDataFilter } from "../../shared/userPermissions.ts";

const router: IRouter = Router();
router.use("/wholesale/customers", requireFeature("wholesale"));

const CustomerInput = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().optional(),
  mobile: z.string().optional(),
  telephone: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  paymentTerms: z.string().optional(),
  creditLimit: z.preprocess(
    (v) => (v == null || v === "") ? null : Number(v),
    z.number().nullable().optional(),
  ),
  billingCompanyName: z.string().optional().nullable(),
  billingTaxId: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  invoiceEmail: z.string().optional().nullable(),
  salesUserId: z.number().int().nullable().optional(),
  deliveryAddresses: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

function toInsert(data: z.infer<typeof CustomerInput>) {
  const { creditLimit, deliveryAddresses, ...rest } = data;
  return {
    ...rest,
    creditLimit: creditLimit != null ? String(creditLimit) : null,
    deliveryAddresses: deliveryAddresses ?? [],
  };
}

router.get("/wholesale/customers/summary", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "需要 month=YYYY-MM" });
    return;
  }
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const salesUser = typeof req.query.salesUser === "string" ? req.query.salesUser : undefined;
  const rows = await listCustomerSummaries({ month, search, salesUser, user: req.user });
  res.json(rows);
});

router.get("/wholesale/customers/sales-options", async (_req, res): Promise<void> => {
  res.json(await listSalesOptions());
});

router.get("/wholesale/customers/:id/orders", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const customerId = raw === "unbound" ? null : parseInt(raw, 10);
  if (raw !== "unbound" && isNaN(customerId as number)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const month = typeof req.query.month === "string" ? req.query.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "需要 month=YYYY-MM" });
    return;
  }
  const result = await listCustomerMonthOrders({ customerId, month, user: req.user });
  if (customerId != null && !result.customer) {
    res.status(404).json({ error: "找不到批發客戶" });
    return;
  }
  res.json(result);
});

router.get("/wholesale/customers/:id/unpaid-orders", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rows } = await pool.query(`SELECT id FROM wholesale_customers WHERE id = $1`, [id]);
  if (!rows[0]) { res.status(404).json({ error: "找不到批發客戶" }); return; }
  if (req.user && shouldApplyOwnDataFilter(req.user)) {
    const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : new Date().toISOString().slice(0, 7);
    const detail = await listCustomerMonthOrders({ customerId: id, month, user: req.user });
    if (!detail.customer) { res.status(404).json({ error: "找不到批發客戶" }); return; }
  }
  res.json(await listUnpaidOrders(id));
});

router.get("/wholesale/customers/:id/statement", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const month = typeof req.query.month === "string" ? req.query.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "需要 month=YYYY-MM" });
    return;
  }
  const stmt = await getCustomerStatement({ customerId: id, month, user: req.user });
  if (!stmt) { res.status(404).json({ error: "找不到批發客戶" }); return; }
  res.json(stmt);
});

router.get("/wholesale/customers", async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  let rows = await db
    .select()
    .from(wholesaleCustomersTable)
    .where(
      search
        ? or(
            ilike(wholesaleCustomersTable.companyName, `%${search}%`),
            ilike(wholesaleCustomersTable.contactPerson, `%${search}%`),
            ilike(wholesaleCustomersTable.mobile, `%${search}%`),
          )
        : undefined,
    )
    .orderBy(desc(wholesaleCustomersTable.createdAt));
  if (req.user && shouldApplyOwnDataFilter(req.user)) {
    const ownId = req.user?.id;
    const ownName = req.user?.displayName ?? "";
    const extra = await pool.query(
      `SELECT DISTINCT customer_id FROM wholesale_orders
       WHERE salesperson = $1 AND customer_id IS NOT NULL`,
      [ownName],
    );
    const extraIds = new Set(extra.rows.map((r: any) => Number(r.customer_id)));
    rows = rows.filter((c) => c.salesUserId === ownId || extraIds.has(c.id));
  }
  res.json(rows);
});

router.post("/wholesale/customers", async (req, res): Promise<void> => {
  const parsed = CustomerInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(wholesaleCustomersTable).values(toInsert(parsed.data)).returning();
  res.status(201).json(row);
});

router.get("/wholesale/customers/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(wholesaleCustomersTable).where(eq(wholesaleCustomersTable.id, id));
  if (!row) { res.status(404).json({ error: "找不到批發客戶" }); return; }
  res.json(row);
});

router.patch("/wholesale/customers/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CustomerInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { creditLimit, deliveryAddresses, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (creditLimit !== undefined) update.creditLimit = creditLimit != null ? String(creditLimit) : null;
  if (deliveryAddresses !== undefined) update.deliveryAddresses = deliveryAddresses;
  const [updated] = await db.update(wholesaleCustomersTable).set(update).where(eq(wholesaleCustomersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "找不到批發客戶" }); return; }
  res.json(updated);
});

router.delete("/wholesale/customers/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(wholesaleCustomersTable).where(eq(wholesaleCustomersTable.id, id));
  res.status(204).send();
});

export default router;
