import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderEquipmentItemsTable,
  progressTable,
  customersTable,
  quotesTable,
} from "@workspace/db";
import { CreateWorkOrderBody, UpdateWorkOrderBody, CreateProgressBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import { syncQuoteDispatchStatus } from "../lib/quoteWorkflow";
import { formatQuoteNumber } from "../lib/quoteStatus";

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
  storedCustomerName: workOrdersTable.customerName,
  linkedCustomerName: customersTable.name,
  quoteId: workOrdersTable.quoteId,
  linkedQuoteCreatedAt: quotesTable.createdAt,
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

function serializeEquipmentItem(item: typeof workOrderEquipmentItemsTable.$inferSelect) {
  return {
    id: item.id,
    workOrderId: item.workOrderId,
    productId: item.productId ?? null,
    quoteItemId: item.quoteItemId ?? null,
    category: item.category ?? null,
    itemName: item.itemName ?? null,
    brand: item.brand ?? null,
    model: item.model ?? null,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    unitPrice: item.unitPrice != null ? parseFloat(item.unitPrice as string) : null,
    notes: item.notes ?? null,
    indoorUnits: item.indoorUnits ?? null,
    outdoorUnits: item.outdoorUnits ?? null,
    floor: item.floor ?? null,
    sortOrder: item.sortOrder,
  };
}

function hasLegacyEquipment(order: Record<string, unknown>): boolean {
  return !!(
    order.acBrand ||
    order.modelNumber ||
    order.quantity != null ||
    order.indoorUnits != null ||
    order.outdoorUnits != null ||
    order.floorLevel
  );
}

function legacyEquipmentFallback(order: Record<string, unknown>) {
  if (!hasLegacyEquipment(order)) return [];
  return [{
    id: 0,
    workOrderId: order.id as number,
    brand: (order.acBrand as string | null) ?? null,
    model: (order.modelNumber as string | null) ?? null,
    quantity: (order.quantity as number | null) ?? null,
    indoorUnits: (order.indoorUnits as number | null) ?? null,
    outdoorUnits: (order.outdoorUnits as number | null) ?? null,
    floor: (order.floorLevel as string | null) ?? null,
    sortOrder: 0,
  }];
}

function resolveEquipmentItems(order: Record<string, unknown>, dbItems: ReturnType<typeof serializeEquipmentItem>[]) {
  if (dbItems.length > 0) return dbItems;
  return legacyEquipmentFallback(order);
}

function formatOrder(o: Record<string, unknown>, equipmentItems: ReturnType<typeof serializeEquipmentItem>[] = []) {
  const { storedCustomerName, linkedCustomerName, linkedQuoteCreatedAt, ...rest } = o as any;
  const quoteId = rest.quoteId as number | null | undefined;
  return {
    ...rest,
    customerName: (linkedCustomerName as string | null) ?? (storedCustomerName as string | null) ?? null,
    quoteNumber: quoteId != null
      ? formatQuoteNumber(quoteId, linkedQuoteCreatedAt ?? rest.createdAt)
      : null,
    equipmentItems: resolveEquipmentItems(o, equipmentItems),
    createdAt: isoStr(o.createdAt),
    updatedAt: isoStr(o.updatedAt),
  };
}

async function buildEquipmentInsert(itemInputs: any[], workOrderId: number) {
  return itemInputs.map((item: any, idx: number) => ({
    workOrderId,
    productId: item.productId ?? null,
    quoteItemId: item.quoteItemId ?? null,
    category: item.category || null,
    itemName: item.itemName || null,
    brand: item.brand || null,
    model: item.model || null,
    quantity: item.quantity ?? null,
    unit: item.unit || null,
    unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
    notes: item.notes || null,
    indoorUnits: item.indoorUnits ?? null,
    outdoorUnits: item.outdoorUnits ?? null,
    floor: item.floor || null,
    sortOrder: item.sortOrder ?? idx,
  }));
}

async function fetchEquipmentByWorkOrderIds(workOrderIds: number[]) {
  if (workOrderIds.length === 0) return {} as Record<number, ReturnType<typeof serializeEquipmentItem>[]>;

  const rows = await db
    .select()
    .from(workOrderEquipmentItemsTable)
    .where(inArray(workOrderEquipmentItemsTable.workOrderId, workOrderIds))
    .orderBy(workOrderEquipmentItemsTable.workOrderId, workOrderEquipmentItemsTable.sortOrder);

  const byWorkOrder: Record<number, ReturnType<typeof serializeEquipmentItem>[]> = {};
  for (const row of rows) {
    const arr = byWorkOrder[row.workOrderId] ?? [];
    arr.push(serializeEquipmentItem(row));
    byWorkOrder[row.workOrderId] = arr;
  }
  return byWorkOrder;
}

/** Strip equipmentItems and optionally clear legacy flat equipment columns */
function sanitizeWOData<T extends Record<string, unknown>>(
  data: T,
  options?: { clearLegacyEquipment?: boolean },
): Record<string, unknown> {
  const DATE_FIELDS = ["scheduledDate", "completedDate"];
  const { equipmentItems: _items, ...rest } = data;
  const result = { ...rest } as Record<string, unknown>;

  for (const f of DATE_FIELDS) {
    if (result[f] === "") result[f] = undefined;
  }

  if (options?.clearLegacyEquipment) {
    result.acBrand = null;
    result.modelNumber = null;
    result.quantity = null;
    result.indoorUnits = null;
    result.outdoorUnits = null;
    result.floorLevel = null;
  }

  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
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
    .leftJoin(quotesTable, eq(workOrdersTable.quoteId, quotesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(workOrdersTable.createdAt);

  const orderIds = orders.map(o => o.id);
  const equipmentByOrder = await fetchEquipmentByWorkOrderIds(orderIds);

  res.json(orders.map(o => formatOrder(o, equipmentByOrder[o.id] ?? [])));
});

router.post("/work-orders", requireRole(...WO_WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { equipmentItems: itemInputs = [], ...orderFields } = parsed.data as any;
  const hasEquipment = Array.isArray(itemInputs) && itemInputs.length > 0;

  const [order] = await db
    .insert(workOrdersTable)
    .values(sanitizeWOData(orderFields, { clearLegacyEquipment: hasEquipment }) as any)
    .returning();

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

  let insertedItems: ReturnType<typeof serializeEquipmentItem>[] = [];
  if (hasEquipment) {
    const rows = await buildEquipmentInsert(itemInputs, order.id);
    const inserted = await db.insert(workOrderEquipmentItemsTable).values(rows).returning();
    insertedItems = inserted.map(serializeEquipmentItem);
  }

  if (updated.quoteId) {
    await syncQuoteDispatchStatus(updated.quoteId);
  }

  res.status(201).json(formatOrder({ ...updated, linkedCustomerName: null }, insertedItems));
});

router.get("/work-orders/:id", requireRole(...WO_READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db
    .select(WO_SELECT)
    .from(workOrdersTable)
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .leftJoin(quotesTable, eq(workOrdersTable.quoteId, quotesTable.id))
    .where(eq(workOrdersTable.id, id));

  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  if (req.user?.role === "technician" && order.assignedTo !== req.user.displayName) {
    res.status(403).json({ error: "您沒有權限查看此派工單" });
    return;
  }

  const equipmentByOrder = await fetchEquipmentByWorkOrderIds([id]);
  res.json(formatOrder(order, equipmentByOrder[id] ?? []));
});

router.patch("/work-orders/:id", requireRole(...WO_WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { equipmentItems: itemInputs, ...orderFields } = parsed.data as any;
  const clearLegacy = itemInputs !== undefined;

  const [order] = await db
    .update(workOrdersTable)
    .set(sanitizeWOData(orderFields, { clearLegacyEquipment: clearLegacy }) as any)
    .where(eq(workOrdersTable.id, id))
    .returning();

  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  let equipmentItems: ReturnType<typeof serializeEquipmentItem>[] = [];
  if (itemInputs !== undefined) {
    await db.delete(workOrderEquipmentItemsTable).where(eq(workOrderEquipmentItemsTable.workOrderId, id));
    if (itemInputs.length > 0) {
      const rows = await buildEquipmentInsert(itemInputs, id);
      const inserted = await db.insert(workOrderEquipmentItemsTable).values(rows).returning();
      equipmentItems = inserted.map(serializeEquipmentItem);
    }
  } else {
    const equipmentByOrder = await fetchEquipmentByWorkOrderIds([id]);
    equipmentItems = equipmentByOrder[id] ?? [];
  }

  if (order.quoteId) {
    await syncQuoteDispatchStatus(order.quoteId);
  }

  res.json(formatOrder({ ...order, linkedCustomerName: null }, equipmentItems));
});

router.delete("/work-orders/:id", requireRole(...WO_DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db.delete(workOrdersTable).where(eq(workOrdersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }
  if (order.quoteId) {
    await syncQuoteDispatchStatus(order.quoteId);
  }
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
