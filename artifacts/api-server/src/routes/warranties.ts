import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, warrantiesTable, customersTable } from "@workspace/db";
import { CreateWarrantyBody, UpdateWarrantyBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_ROLES = ["owner", "admin", "accountant"];
const WRITE_ROLES = ["owner", "admin"];
const DELETE_ROLES = ["owner"];

router.get("/warranties", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const { customerId } = req.query as { customerId?: string };
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(warrantiesTable.customerId, cid));
  }

  const warranties = await db
    .select({
      id: warrantiesTable.id,
      customerId: warrantiesTable.customerId,
      customerName: customersTable.name,
      acUnitId: warrantiesTable.acUnitId,
      startDate: warrantiesTable.startDate,
      endDate: warrantiesTable.endDate,
      description: warrantiesTable.description,
      notes: warrantiesTable.notes,
      createdAt: warrantiesTable.createdAt,
    })
    .from(warrantiesTable)
    .leftJoin(customersTable, eq(warrantiesTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(warrantiesTable.endDate);

  res.json(warranties.map(w => ({
    ...w,
    createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : w.createdAt,
  })));
});

router.post("/warranties", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateWarrantyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [warranty] = await db.insert(warrantiesTable).values(parsed.data).returning();
  res.status(201).json({
    ...warranty,
    customerName: null,
    createdAt: warranty.createdAt instanceof Date ? warranty.createdAt.toISOString() : warranty.createdAt,
  });
});

router.get("/warranties/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [warranty] = await db
    .select({
      id: warrantiesTable.id,
      customerId: warrantiesTable.customerId,
      customerName: customersTable.name,
      acUnitId: warrantiesTable.acUnitId,
      startDate: warrantiesTable.startDate,
      endDate: warrantiesTable.endDate,
      description: warrantiesTable.description,
      notes: warrantiesTable.notes,
      createdAt: warrantiesTable.createdAt,
    })
    .from(warrantiesTable)
    .leftJoin(customersTable, eq(warrantiesTable.customerId, customersTable.id))
    .where(eq(warrantiesTable.id, id));

  if (!warranty) {
    res.status(404).json({ error: "找不到保固資料" });
    return;
  }
  res.json({
    ...warranty,
    createdAt: warranty.createdAt instanceof Date ? warranty.createdAt.toISOString() : warranty.createdAt,
  });
});

router.patch("/warranties/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateWarrantyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [warranty] = await db.update(warrantiesTable).set(parsed.data).where(eq(warrantiesTable.id, id)).returning();
  if (!warranty) {
    res.status(404).json({ error: "找不到保固資料" });
    return;
  }
  res.json({
    ...warranty,
    customerName: null,
    createdAt: warranty.createdAt instanceof Date ? warranty.createdAt.toISOString() : warranty.createdAt,
  });
});

router.delete("/warranties/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [warranty] = await db.delete(warrantiesTable).where(eq(warrantiesTable.id, id)).returning();
  if (!warranty) {
    res.status(404).json({ error: "找不到保固資料" });
    return;
  }
  res.sendStatus(204);
});

export default router;
