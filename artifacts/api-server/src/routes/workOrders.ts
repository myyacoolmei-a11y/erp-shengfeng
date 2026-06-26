import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, workOrdersTable, progressTable, customersTable } from "@workspace/db";
import { CreateWorkOrderBody, UpdateWorkOrderBody, CreateProgressBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const WO_READ_ROLES = ["owner", "admin", "technician"];
const WO_WRITE_ROLES = ["owner", "admin"];
const WO_DELETE_ROLES = ["owner"];
const PROGRESS_ROLES = ["owner", "admin", "technician"];

function isoStr(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

router.get("/work-orders", requireRole(...WO_READ_ROLES), async (req, res): Promise<void> => {
  const { customerId, status } = req.query as { customerId?: string; status?: string };
  const conditions = [];

  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(workOrdersTable.customerId, cid));
  }
  if (status) {
    conditions.push(eq(workOrdersTable.status, status));
  }

  // Technicians only see work orders assigned to them
  if (req.user?.role === "technician") {
    conditions.push(eq(workOrdersTable.assignedTo, req.user.displayName));
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
    createdAt: isoStr(o.createdAt),
    updatedAt: isoStr(o.updatedAt),
  })));
});

router.post("/work-orders", requireRole(...WO_WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [order] = await db.insert(workOrdersTable).values(parsed.data).returning();
  res.status(201).json({
    ...order,
    customerName: null,
    createdAt: isoStr(order.createdAt),
    updatedAt: isoStr(order.updatedAt),
  });
});

router.get("/work-orders/:id", requireRole(...WO_READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

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

  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  // Technicians can only view work orders assigned to them
  if (req.user?.role === "technician" && order.assignedTo !== req.user.displayName) {
    res.status(403).json({ error: "您沒有權限查看此派工單" });
    return;
  }

  res.json({ ...order, createdAt: isoStr(order.createdAt), updatedAt: isoStr(order.updatedAt) });
});

router.patch("/work-orders/:id", requireRole(...WO_WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.update(workOrdersTable).set(parsed.data).where(eq(workOrdersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  res.json({ ...order, customerName: null, createdAt: isoStr(order.createdAt), updatedAt: isoStr(order.updatedAt) });
});

router.delete("/work-orders/:id", requireRole(...WO_DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db.delete(workOrdersTable).where(eq(workOrdersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }
  res.sendStatus(204);
});

router.get("/work-orders/:workOrderId/progress", requireRole(...PROGRESS_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workOrderId) ? req.params.workOrderId[0] : req.params.workOrderId;
  const workOrderId = parseInt(raw, 10);
  if (isNaN(workOrderId)) { res.status(400).json({ error: "Invalid workOrderId" }); return; }

  // Technicians can only view progress for their own work orders
  if (req.user?.role === "technician") {
    const [order] = await db.select({ assignedTo: workOrdersTable.assignedTo })
      .from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId));
    if (!order || order.assignedTo !== req.user.displayName) {
      res.status(403).json({ error: "您沒有權限查看此工程進度" });
      return;
    }
  }

  const entries = await db
    .select().from(progressTable)
    .where(eq(progressTable.workOrderId, workOrderId))
    .orderBy(progressTable.createdAt);

  res.json(entries.map(e => ({ ...e, createdAt: isoStr(e.createdAt) })));
});

router.post("/work-orders/:workOrderId/progress", requireRole(...PROGRESS_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workOrderId) ? req.params.workOrderId[0] : req.params.workOrderId;
  const workOrderId = parseInt(raw, 10);
  if (isNaN(workOrderId)) { res.status(400).json({ error: "Invalid workOrderId" }); return; }

  // Technicians can only add progress to their own work orders
  if (req.user?.role === "technician") {
    const [order] = await db.select({ assignedTo: workOrdersTable.assignedTo })
      .from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId));
    if (!order || order.assignedTo !== req.user.displayName) {
      res.status(403).json({ error: "您沒有權限新增此工程進度" });
      return;
    }
  }

  const parsed = CreateProgressBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [entry] = await db.insert(progressTable).values({ ...parsed.data, workOrderId }).returning();
  res.status(201).json({ ...entry, createdAt: isoStr(entry.createdAt) });
});

export default router;
