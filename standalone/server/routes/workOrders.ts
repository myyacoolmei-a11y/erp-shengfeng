import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, workOrdersTable, progressTable, customersTable } from "@workspace/db";
import { CreateWorkOrderBody, UpdateWorkOrderBody, CreateProgressBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const WO_READ_ROLES = ["super_admin", "owner", "admin", "engineer", "technician"];
const WO_WRITE_ROLES = ["super_admin", "owner", "admin", "engineer"];
const WO_DELETE_ROLES = ["super_admin", "owner", "admin"];
const PROGRESS_ROLES = ["super_admin", "owner", "admin", "engineer", "technician"];

function isoStr(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

const WO_SELECT = {
  id: workOrdersTable.id,
  customerId: workOrdersTable.customerId,
  customerName: customersTable.name,
  quoteId: workOrdersTable.quoteId,
  workOrderNumber: workOrdersTable.workOrderNumber,
  title: workOrdersTable.title,
  status: workOrdersTable.status,
  contactPerson: workOrdersTable.contactPerson,
  mobilePhone: workOrdersTable.mobilePhone,
  telephone: workOrdersTable.telephone,
  installAddress: workOrdersTable.installAddress,
  scheduledDate: workOrdersTable.scheduledDate,
  scheduledTime: workOrdersTable.scheduledTime,
  completedDate: workOrdersTable.completedDate,
  assignedTo: workOrdersTable.assignedTo,
  assistantTo: workOrdersTable.assistantTo,
  projectType: workOrdersTable.projectType,
  acBrand: workOrdersTable.acBrand,
  modelNumber: workOrdersTable.modelNumber,
  quantity: workOrdersTable.quantity,
  indoorUnits: workOrdersTable.indoorUnits,
  outdoorUnits: workOrdersTable.outdoorUnits,
  floorLevel: workOrdersTable.floorLevel,
  hasElevator: workOrdersTable.hasElevator,
  description: workOrdersTable.description,
  notes: workOrdersTable.notes,
  technicians: workOrdersTable.technicians,
  createdAt: workOrdersTable.createdAt,
  updatedAt: workOrdersTable.updatedAt,
};

function formatOrder(o: Record<string, unknown>) {
  return { ...o, createdAt: isoStr(o.createdAt), updatedAt: isoStr(o.updatedAt) };
}

/** Convert empty strings to undefined for date/string columns that can't be empty */
function sanitizeWOData<T extends Record<string, unknown>>(data: T): T {
  const DATE_FIELDS = ["scheduledDate", "completedDate"];
  const result = { ...data } as Record<string, unknown>;
  for (const f of DATE_FIELDS) {
    if (result[f] === "") result[f] = undefined;
  }
  // Also remove undefined keys so Drizzle skips them entirely
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result as T;
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
  if (req.user?.role === "technician") {
    conditions.push(eq(workOrdersTable.assignedTo, req.user.displayName));
  }

  const orders = await db
    .select(WO_SELECT)
    .from(workOrdersTable)
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(workOrdersTable.createdAt);

  res.json(orders.map(formatOrder));
});

router.post("/work-orders", requireRole(...WO_WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [order] = await db.insert(workOrdersTable).values(sanitizeWOData(parsed.data)).returning();

  // Auto-generate work order number
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const workOrderNumber = `WO-${year}${month}${day}-${String(order.id).padStart(4, "0")}`;
  const [updated] = await db
    .update(workOrdersTable)
    .set({ workOrderNumber })
    .where(eq(workOrdersTable.id, order.id))
    .returning();

  res.status(201).json(formatOrder({ ...updated, customerName: null }));
});

router.get("/work-orders/:id", requireRole(...WO_READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db
    .select(WO_SELECT)
    .from(workOrdersTable)
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .where(eq(workOrdersTable.id, id));

  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  if (req.user?.role === "technician" && order.assignedTo !== req.user.displayName) {
    res.status(403).json({ error: "您沒有權限查看此派工單" });
    return;
  }

  res.json(formatOrder(order));
});

router.patch("/work-orders/:id", requireRole(...WO_WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.update(workOrdersTable).set(sanitizeWOData(parsed.data)).where(eq(workOrdersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  res.json(formatOrder({ ...order, customerName: null }));
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
