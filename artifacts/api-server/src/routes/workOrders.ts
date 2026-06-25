import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, workOrdersTable, progressTable, customersTable } from "@workspace/db";
import { CreateWorkOrderBody, UpdateWorkOrderBody, CreateProgressBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/work-orders", async (req, res): Promise<void> => {
  const { customerId, status } = req.query as { customerId?: string; status?: string };
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(workOrdersTable.customerId, cid));
  }
  if (status) {
    conditions.push(eq(workOrdersTable.status, status));
  }

  const orders = await db
    .select({
      id: workOrdersTable.id,
      customerId: workOrdersTable.customerId,
      customerName: customersTable.name,
      quoteId: workOrdersTable.quoteId,
      title: workOrdersTable.title,
      description: workOrdersTable.description,
      assignedTo: workOrdersTable.assignedTo,
      scheduledDate: workOrdersTable.scheduledDate,
      completedDate: workOrdersTable.completedDate,
      status: workOrdersTable.status,
      notes: workOrdersTable.notes,
      createdAt: workOrdersTable.createdAt,
      updatedAt: workOrdersTable.updatedAt,
    })
    .from(workOrdersTable)
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(workOrdersTable.createdAt);

  res.json(orders.map(o => ({
    ...o,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
  })));
});

router.post("/work-orders", async (req, res): Promise<void> => {
  const parsed = CreateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [order] = await db.insert(workOrdersTable).values(parsed.data).returning();
  res.status(201).json({
    ...order,
    customerName: null,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
  });
});

router.get("/work-orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [order] = await db
    .select({
      id: workOrdersTable.id,
      customerId: workOrdersTable.customerId,
      customerName: customersTable.name,
      quoteId: workOrdersTable.quoteId,
      title: workOrdersTable.title,
      description: workOrdersTable.description,
      assignedTo: workOrdersTable.assignedTo,
      scheduledDate: workOrdersTable.scheduledDate,
      completedDate: workOrdersTable.completedDate,
      status: workOrdersTable.status,
      notes: workOrdersTable.notes,
      createdAt: workOrdersTable.createdAt,
      updatedAt: workOrdersTable.updatedAt,
    })
    .from(workOrdersTable)
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .where(eq(workOrdersTable.id, id));

  if (!order) {
    res.status(404).json({ error: "找不到派工單" });
    return;
  }
  res.json({
    ...order,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
  });
});

router.patch("/work-orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [order] = await db.update(workOrdersTable).set(parsed.data).where(eq(workOrdersTable.id, id)).returning();
  if (!order) {
    res.status(404).json({ error: "找不到派工單" });
    return;
  }
  res.json({
    ...order,
    customerName: null,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
  });
});

router.delete("/work-orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [order] = await db.delete(workOrdersTable).where(eq(workOrdersTable.id, id)).returning();
  if (!order) {
    res.status(404).json({ error: "找不到派工單" });
    return;
  }
  res.sendStatus(204);
});

router.get("/work-orders/:workOrderId/progress", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workOrderId) ? req.params.workOrderId[0] : req.params.workOrderId;
  const workOrderId = parseInt(raw, 10);
  if (isNaN(workOrderId)) {
    res.status(400).json({ error: "Invalid workOrderId" });
    return;
  }
  const entries = await db.select().from(progressTable).where(eq(progressTable.workOrderId, workOrderId)).orderBy(progressTable.createdAt);
  res.json(entries.map(e => ({
    ...e,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  })));
});

router.post("/work-orders/:workOrderId/progress", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workOrderId) ? req.params.workOrderId[0] : req.params.workOrderId;
  const workOrderId = parseInt(raw, 10);
  if (isNaN(workOrderId)) {
    res.status(400).json({ error: "Invalid workOrderId" });
    return;
  }
  const parsed = CreateProgressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db.insert(progressTable).values({ ...parsed.data, workOrderId }).returning();
  res.status(201).json({
    ...entry,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
  });
});

export default router;
