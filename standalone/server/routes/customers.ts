import { Router, type IRouter } from "express";
import { eq, ilike, or, and, gte, desc } from "drizzle-orm";
import { db, customersTable, employeesTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
} from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant"];
const WRITE_ROLES = ["super_admin", "owner", "admin", "sales"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

function mapCustomer(row: typeof customersTable.$inferSelect & { primarySalesRepName?: string | null }) {
  return {
    ...row,
    primarySalesRepId: row.primarySalesRepId ?? null,
    primarySalesRepName: row.primarySalesRepName ?? null,
  };
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
    .select(customerSelect)
    .from(customersTable)
    .leftJoin(employeesTable, eq(customersTable.primarySalesRepId, employeesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(customersTable.createdAt));

  res.json(customers.map(mapCustomer));
});

router.post("/customers", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
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

router.get("/customers/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
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
