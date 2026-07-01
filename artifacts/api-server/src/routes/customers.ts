import { Router, type IRouter } from "express";
import { eq, ilike, or, and, gte, desc } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
} from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant"];
const WRITE_ROLES = ["super_admin", "owner", "admin", "sales"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

// NOTE: check-duplicate must come before /:id so Express doesn't capture "check-duplicate" as an id
router.post("/customers/check-duplicate", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
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

router.get("/customers", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
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
    .select()
    .from(customersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(customersTable.createdAt));

  res.json(customers);
});

router.post("/customers", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.insert(customersTable).values(parsed.data).returning();
  res.status(201).json(customer);
});

router.get("/customers/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) {
    res.status(404).json({ error: "找不到客戶" });
    return;
  }
  res.json(customer);
});

router.patch("/customers/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
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
  const [customer] = await db
    .update(customersTable)
    .set(parsed.data)
    .where(eq(customersTable.id, id))
    .returning();
  if (!customer) {
    res.status(404).json({ error: "找不到客戶" });
    return;
  }
  res.json(customer);
});

router.delete("/customers/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
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
