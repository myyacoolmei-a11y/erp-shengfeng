import { Router, type IRouter } from "express";
import { eq, ilike, or, and, lt } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  DeleteCustomerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/customers", async (req, res): Promise<void> => {
  const { search, includeOld } = req.query as { search?: string; includeOld?: string };

  let query = db.select().from(customersTable).$dynamic();

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(customersTable.name, `%${search}%`),
        ilike(customersTable.phone, `%${search}%`),
        ilike(customersTable.address, `%${search}%`),
      )
    );
  }

  if (includeOld !== "true") {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    conditions.push(
      or(
        eq(customersTable.id, customersTable.id),
      )
    );
  }

  if (conditions.length > 0) {
    const results = await db
      .select()
      .from(customersTable)
      .where(and(...conditions))
      .orderBy(customersTable.createdAt);
    res.json(results);
    return;
  }

  const customers = await db.select().from(customersTable).orderBy(customersTable.createdAt);
  res.json(customers);
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.insert(customersTable).values(parsed.data).returning();
  res.status(201).json(customer);
});

router.get("/customers/:id", async (req, res): Promise<void> => {
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
