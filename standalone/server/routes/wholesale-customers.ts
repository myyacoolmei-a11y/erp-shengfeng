import { Router, type IRouter } from "express";
import { eq, ilike, or, desc } from "drizzle-orm";
import { db, wholesaleCustomersTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const ROLES = ["super_admin", "owner", "admin", "sales"] as const;
const DELETE_ROLES = ["super_admin", "owner", "admin"] as const;

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
    z.number().nullable().optional()
  ),
  notes: z.string().optional(),
});

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

router.get("/wholesale/customers", requireRole(...ROLES), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const rows = await db
    .select()
    .from(wholesaleCustomersTable)
    .where(
      search
        ? or(
            ilike(wholesaleCustomersTable.companyName, `%${search}%`),
            ilike(wholesaleCustomersTable.contactPerson, `%${search}%`),
            ilike(wholesaleCustomersTable.mobile, `%${search}%`),
          )
        : undefined
    )
    .orderBy(desc(wholesaleCustomersTable.createdAt));
  res.json(rows);
});

router.post("/wholesale/customers", requireRole(...ROLES), async (req, res): Promise<void> => {
  const parsed = CustomerInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { creditLimit, ...rest } = parsed.data;
  const [row] = await db.insert(wholesaleCustomersTable).values({
    ...rest,
    creditLimit: creditLimit != null ? String(creditLimit) : null,
  }).returning();
  res.status(201).json(row);
});

router.get("/wholesale/customers/:id", requireRole(...ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(wholesaleCustomersTable).where(eq(wholesaleCustomersTable.id, id));
  if (!row) { res.status(404).json({ error: "找不到批發客戶" }); return; }
  res.json(row);
});

router.patch("/wholesale/customers/:id", requireRole(...ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CustomerInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { creditLimit, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (creditLimit !== undefined) update.creditLimit = creditLimit != null ? String(creditLimit) : null;
  const [updated] = await db.update(wholesaleCustomersTable).set(update).where(eq(wholesaleCustomersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "找不到批發客戶" }); return; }
  res.json(updated);
});

router.delete("/wholesale/customers/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(wholesaleCustomersTable).where(eq(wholesaleCustomersTable.id, id));
  res.status(204).send();
});

export default router;
