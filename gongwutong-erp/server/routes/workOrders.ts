import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderEquipmentItemsTable,
  progressTable,
  customersTable,
  quotesTable,
  receivablesTable,
} from "@workspace/db";
import { CreateWorkOrderBody, UpdateWorkOrderBody, CreateProgressBody } from "@workspace/api-zod";
import { requireRoleOrFeature, effectiveRoles } from "../lib/auth";
import { syncQuoteDispatchStatus, loadLatestWorkOrdersByQuoteIds } from "../lib/quoteWorkflow";
import { formatQuoteNumber, QUOTE_STATUS_WON } from "../lib/quoteStatus";
import { loadQuoteDocument } from "../lib/quoteDocument";
import { stripQuotePricingFromNotes } from "../../shared/workOrderNotes.ts";
import {
  buildUserAssignmentContext,
  shouldFilterWorkOrdersByAssignment,
  canUserAccessWorkOrder,
  describeWorkOrderListQuery,
  explainEmptyWorkOrderList,
  logWorkOrderAccess,
  deriveAssignedFromTechnicians,
} from "../lib/workOrders/workOrderAssignment.ts";
import { assertWorkOrderDataAccess } from "../lib/dataPermissionAccess.ts";
import { resetWorkOrderFieldProgressOnReopen } from "../lib/workOrders/resetWorkOrderFieldProgressOnReopen.ts";
import { handoffToAdminWorkbench, syncWorkOrderCategoryWorkflow } from "../lib/workOrders/adminWorkbenchService.ts";
import { logger } from "../lib/logger.ts";
import {
  emitWorkOrderCreatedNotifications,
  emitWorkOrderUpdatedNotifications,
} from "../lib/notifications/workOrdersNotificationHook.ts";
import { WORK_ORDER_RETURN_REASONS } from "@workspace/db";
import {
  parseAiReminderScenarioIds,
  parseWorkOrderAiReminderCustomConfig,
} from "../../shared/aiWorkReminder.ts";

const WO_COMPLETED_STATUSES = ["已完成", "已結案"];
const WO_ADMIN_ROLES = ["super_admin", "owner", "admin"];

const router: IRouter = Router();
/** Feature OR field role — engineers can read own jobs even if feature_permissions incomplete */
router.use(
  "/work-orders",
  requireRoleOrFeature(
    ["super_admin", "owner", "admin", "engineer", "technician"],
    ["dispatch_orders"],
  ),
);


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
  estimatedWorkMinutes: workOrdersTable.estimatedWorkMinutes,
  aiReminderEnabled: workOrdersTable.aiReminderEnabled,
  aiReminderScenarioIds: workOrdersTable.aiReminderScenarioIds,
  aiNotifySupervisorOnDelay: workOrdersTable.aiNotifySupervisorOnDelay,
  aiReminderRuleSource: workOrdersTable.aiReminderRuleSource,
  aiReminderCustomConfig: workOrdersTable.aiReminderCustomConfig,
  adminWorkflowStatus: workOrdersTable.adminWorkflowStatus,
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

function serializeAiReminderFieldsForDb(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  if (Array.isArray(result.aiReminderScenarioIds)) {
    result.aiReminderScenarioIds = JSON.stringify(result.aiReminderScenarioIds);
  }
  if (result.aiReminderCustomConfig && typeof result.aiReminderCustomConfig === "object") {
    result.aiReminderCustomConfig = JSON.stringify(result.aiReminderCustomConfig);
  }
  return result;
}

function deserializeAiReminderFields(order: Record<string, unknown>) {
  let aiReminderScenarioIds = parseAiReminderScenarioIds(null);
  let aiReminderCustomConfig = null;

  try {
    const rawIds = order.aiReminderScenarioIds;
    if (typeof rawIds === "string" && rawIds) {
      aiReminderScenarioIds = parseAiReminderScenarioIds(JSON.parse(rawIds));
    } else if (Array.isArray(rawIds)) {
      aiReminderScenarioIds = parseAiReminderScenarioIds(rawIds);
    }
  } catch {
    aiReminderScenarioIds = parseAiReminderScenarioIds(null);
  }

  try {
    const rawConfig = order.aiReminderCustomConfig;
    if (typeof rawConfig === "string" && rawConfig) {
      aiReminderCustomConfig = parseWorkOrderAiReminderCustomConfig(JSON.parse(rawConfig));
    } else if (rawConfig && typeof rawConfig === "object") {
      aiReminderCustomConfig = parseWorkOrderAiReminderCustomConfig(rawConfig);
    }
  } catch {
    aiReminderCustomConfig = null;
  }

  return {
    estimatedWorkMinutes: (order.estimatedWorkMinutes as number | null | undefined) ?? null,
    aiReminderEnabled: Boolean(order.aiReminderEnabled),
    aiReminderScenarioIds,
    aiNotifySupervisorOnDelay: Boolean(order.aiNotifySupervisorOnDelay),
    aiReminderRuleSource: (order.aiReminderRuleSource as string | null) ?? "company_default",
    aiReminderCustomConfig,
  };
}

function formatOrder(
  o: Record<string, unknown>,
  equipmentItems: ReturnType<typeof serializeEquipmentItem>[] = [],
  receivableId: number | null = null,
) {
  const { storedCustomerName, linkedCustomerName, linkedQuoteCreatedAt, ...rest } = o as any;
  const quoteId = rest.quoteId as number | null | undefined;
  return {
    ...rest,
    ...deserializeAiReminderFields(rest),
    customerName: (linkedCustomerName as string | null) ?? (storedCustomerName as string | null) ?? null,
    quoteNumber: quoteId != null
      ? formatQuoteNumber(quoteId, linkedQuoteCreatedAt ?? rest.createdAt)
      : null,
    receivableId: receivableId ?? (rest.receivableId as number | null | undefined) ?? null,
    equipmentItems: resolveEquipmentItems(o, equipmentItems),
    notes: stripQuotePricingFromNotes(rest.notes as string | null | undefined) || null,
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
    notes: item.notes || null,
    indoorUnits: item.indoorUnits ?? null,
    outdoorUnits: item.outdoorUnits ?? null,
    floor: item.floor || null,
    sortOrder: item.sortOrder ?? idx,
    // Client POST/PATCH: pricing belongs on quotes. Quote-win API writes unitPrice itself.
    unitPrice: null,
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
  return deriveAssignedFromTechnicians(serializeAiReminderFieldsForDb(result));
}

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

  const applyAssignmentFilter = !!(req.user && shouldFilterWorkOrdersByAssignment(req.user));
  const filterMode = applyAssignmentFilter ? "linked_employee" as const : "all" as const;

  const queryDescription = describeWorkOrderListQuery({
    customerId,
    status,
    filterMode,
    linkedEmployeeId: req.user?.linkedEmployeeId ?? null,
  });

  let orders = await db
    .select(WO_SELECT)
    .from(workOrdersTable)
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .leftJoin(quotesTable, eq(workOrdersTable.quoteId, quotesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    // 施工日新→舊；無施工日排後面；同日再依建立時間新→舊
    .orderBy(
      sql`${workOrdersTable.scheduledDate} DESC NULLS LAST`,
      desc(workOrdersTable.createdAt),
      desc(workOrdersTable.id),
    );

  const totalBeforeFilter = orders.length;
  let assignmentContext = null;

  if (applyAssignmentFilter && req.user) {
    assignmentContext = await buildUserAssignmentContext(req.user);
    orders = orders.filter((o) =>
      canUserAccessWorkOrder(
        req.user!,
        { id: o.id, assignedTo: o.assignedTo, assistantTo: o.assistantTo, technicians: o.technicians },
        assignmentContext!,
      ),
    );
  }

  const totalAfterFilter = orders.length;
  const zeroReason = explainEmptyWorkOrderList({
    totalBeforeFilter,
    totalAfterFilter,
    filterMode,
    assignmentContext: assignmentContext ?? undefined,
  });

  logWorkOrderAccess("GET /work-orders", req.user, {
    queryWhere: queryDescription,
    queryParams: { customerId: customerId ?? null, status: status ?? null },
    filterMode,
    employeeNames: assignmentContext?.employeeNames ?? null,
    totalBeforeFilter,
    resultCount: totalAfterFilter,
    zeroReason: totalAfterFilter === 0 ? zeroReason : undefined,
  });

  const orderIds = orders.map(o => o.id);
  const equipmentByOrder = await fetchEquipmentByWorkOrderIds(orderIds);

  const receivableByWo = new Map<number, number>();
  if (orderIds.length > 0) {
    const recRows = await db
      .select({ id: receivablesTable.id, workOrderId: receivablesTable.workOrderId })
      .from(receivablesTable)
      .where(inArray(receivablesTable.workOrderId, orderIds));
    for (const r of recRows) {
      if (r.workOrderId != null && !receivableByWo.has(r.workOrderId)) {
        receivableByWo.set(r.workOrderId, r.id);
      }
    }
  }

  res.json(orders.map(o => formatOrder(o, equipmentByOrder[o.id] ?? [], receivableByWo.get(o.id) ?? null)));
});

router.post("/work-orders", async (req, res): Promise<void> => {
  const parsed = CreateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!parsed.data.customerId && !parsed.data.customerName?.trim()) {
    res.status(400).json({ error: "請選擇正式客戶或輸入臨時客戶名稱" });
    return;
  }

  if (!parsed.data.customerId && !parsed.data.mobilePhone?.trim()) {
    res.status(400).json({ error: "臨時客戶請填寫手機號碼" });
    return;
  }

  const { equipmentItems: itemInputs = [], ...orderFields } = parsed.data as any;
  if (orderFields.customerId === 0) orderFields.customerId = null;

  if (orderFields.quoteId) {
    const existingMap = await loadLatestWorkOrdersByQuoteIds([orderFields.quoteId]);
    const existing = existingMap.get(orderFields.quoteId);
    if (existing) {
      res.status(409).json({
        error: "此報價單已有派工單，不可重複建立",
        workOrderId: existing.id,
        workOrderNumber: existing.workOrderNumber,
      });
      return;
    }
  }

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
    await db.update(quotesTable).set({
      status: QUOTE_STATUS_WON,
      lostReason: null,
    }).where(eq(quotesTable.id, updated.quoteId));
    await syncQuoteDispatchStatus(updated.quoteId);
  }

  void emitWorkOrderCreatedNotifications(updated).catch(err => {
    logger.error({ err, workOrderId: updated.id }, "work order create notification failed");
  });

  res.status(201).json(formatOrder({ ...updated, linkedCustomerName: null }, insertedItems));
});

/**
 * 派工單 → 來源報價單：依 work_orders.quote_id 回查原始 quotes + quote_items。
 * 禁止用施工內容／材料設備重組報價單。
 */
router.get("/work-orders/:id/source-quote", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db
    .select({
      id: workOrdersTable.id,
      quoteId: workOrdersTable.quoteId,
      assignedTo: workOrdersTable.assignedTo,
      assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, id));

  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  if (req.user && shouldFilterWorkOrdersByAssignment(req.user)) {
    const ctx = await buildUserAssignmentContext(req.user);
    if (!canUserAccessWorkOrder(req.user, order, ctx)) {
      res.status(403).json({ error: "您沒有權限查看此派工單" });
      return;
    }
  }

  if (order.quoteId == null) {
    res.status(404).json({ error: "此派工單沒有來源報價單" });
    return;
  }

  const quote = await loadQuoteDocument(order.quoteId);
  if (!quote) {
    res.status(404).json({ error: "找不到來源報價單" });
    return;
  }

  res.json(quote);
});

router.get("/work-orders/:id", async (req, res): Promise<void> => {
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

  if (req.user && shouldFilterWorkOrdersByAssignment(req.user)) {
    const ctx = await buildUserAssignmentContext(req.user);
    if (!canUserAccessWorkOrder(req.user, order, ctx)) {
      logWorkOrderAccess("GET /work-orders/:id", req.user, {
        workOrderId: id,
        allowed: false,
        reason: "linkedEmployeeId 指派不符",
      });
      res.status(403).json({ error: "您沒有權限查看此派工單" });
      return;
    }
  }

  logWorkOrderAccess("GET /work-orders/:id", req.user, {
    workOrderId: id,
    allowed: true,
    resultCount: 1,
  });

  const equipmentByOrder = await fetchEquipmentByWorkOrderIds([id]);
  res.json(formatOrder(order, equipmentByOrder[id] ?? []));
});

router.patch("/work-orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到派工單" }); return; }

  if (req.user) {
    const access = await assertWorkOrderDataAccess(req.user, existing);
    if (!access.ok) { res.status(403).json({ error: access.message }); return; }
  }

  const parsed = UpdateWorkOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { equipmentItems: itemInputs, ...orderFields } = parsed.data as any;
  const clearLegacy = itemInputs !== undefined;
  const reopenReason = typeof orderFields.reopenReason === "string" ? orderFields.reopenReason.trim() : "";
  const reopenNote = typeof orderFields.reopenNote === "string" ? orderFields.reopenNote.trim() : "";
  const adminNotificationNote = typeof orderFields.adminNotificationNote === "string"
    ? orderFields.adminNotificationNote.trim()
    : "";
  delete orderFields.reopenReason;
  delete orderFields.reopenNote;
  delete orderFields.adminNotificationNote;

  const newStatus = typeof orderFields.status === "string" ? orderFields.status : undefined;
  const isAdminReopen =
    !!req.user &&
    newStatus === "待施工" &&
    existing.status !== "待施工" &&
    WO_COMPLETED_STATUSES.includes(existing.status) &&
    effectiveRoles(req.user).some(r => WO_ADMIN_ROLES.includes(r));

  if (isAdminReopen) {
    if (!reopenReason || !WORK_ORDER_RETURN_REASONS.includes(reopenReason as typeof WORK_ORDER_RETURN_REASONS[number])) {
      res.status(400).json({ error: "改回待施工時請選擇退回原因" });
      return;
    }
    if (reopenReason === "其他" && !reopenNote) {
      res.status(400).json({ error: "請填寫退回說明" });
      return;
    }
  }

  const sanitizedOrderFields = sanitizeWOData(orderFields, { clearLegacyEquipment: clearLegacy }) as Record<string, unknown>;
  if (isAdminReopen) {
    sanitizedOrderFields.completedDate = null;
  }

  const [order] = await db
    .update(workOrdersTable)
    .set(sanitizedOrderFields as any)
    .where(eq(workOrdersTable.id, id))
    .returning();

  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }

  if (isAdminReopen) {
    try {
      await resetWorkOrderFieldProgressOnReopen(id);
    } catch (err) {
      logger.error({ err, workOrderId: id }, "field progress reset failed after work order reopen");
    }
  }

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

  const nextProjectType = order.projectType;
  if (
    req.user &&
    (existing.projectType ?? "") !== (nextProjectType ?? "")
  ) {
    try {
      await syncWorkOrderCategoryWorkflow(id, req.user, existing.projectType);
    } catch (err) {
      logger.error({ err, workOrderId: id }, "work order category workflow sync failed");
    }
  }

  // 由派工單頁直接改成「已完成」的案件，同樣要交由行政處理
  if (
    req.user &&
    order.status === "已完成" &&
    existing.status !== "已完成" &&
    !order.adminWorkflowStatus
  ) {
    try {
      await handoffToAdminWorkbench(id, req.user, "派工單狀態改為已完成");
    } catch (err) {
      logger.error({ err, workOrderId: id }, "admin handoff failed after work order status change");
    }
  }

  void emitWorkOrderUpdatedNotifications(existing, order, {
    reopenReason: isAdminReopen ? reopenReason : undefined,
    reopenNote: isAdminReopen ? reopenNote : undefined,
    reopenedByUserId: isAdminReopen ? req.user!.id : undefined,
    adminNote: adminNotificationNote || undefined,
  }).catch(err => {
    logger.error({ err, workOrderId: id }, "work order update notification failed");
  });

  res.json(formatOrder({ ...order, linkedCustomerName: null }, equipmentItems));
});

router.delete("/work-orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select({
      id: workOrdersTable.id,
      assignedTo: workOrdersTable.assignedTo,
      assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到派工單" }); return; }

  if (req.user) {
    const access = await assertWorkOrderDataAccess(req.user, existing);
    if (!access.ok) { res.status(403).json({ error: access.message }); return; }
  }

  const [order] = await db.delete(workOrdersTable).where(eq(workOrdersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "找不到派工單" }); return; }
  if (order.quoteId) {
    await syncQuoteDispatchStatus(order.quoteId);
  }
  res.sendStatus(204);
});

router.get("/work-orders/:workOrderId/progress", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workOrderId) ? req.params.workOrderId[0] : req.params.workOrderId;
  const workOrderId = parseInt(raw, 10);
  if (isNaN(workOrderId)) { res.status(400).json({ error: "Invalid workOrderId" }); return; }

  if (req.user && shouldFilterWorkOrdersByAssignment(req.user)) {
    const [order] = await db
      .select({
        assignedTo: workOrdersTable.assignedTo,
        assistantTo: workOrdersTable.assistantTo,
        technicians: workOrdersTable.technicians,
      })
      .from(workOrdersTable)
      .where(eq(workOrdersTable.id, workOrderId));
    const ctx = await buildUserAssignmentContext(req.user);
    if (!order || !canUserAccessWorkOrder(req.user, { id: workOrderId, ...order }, ctx)) {
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

router.post("/work-orders/:workOrderId/progress", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workOrderId) ? req.params.workOrderId[0] : req.params.workOrderId;
  const workOrderId = parseInt(raw, 10);
  if (isNaN(workOrderId)) { res.status(400).json({ error: "Invalid workOrderId" }); return; }

  if (req.user && shouldFilterWorkOrdersByAssignment(req.user)) {
    const [order] = await db
      .select({
        assignedTo: workOrdersTable.assignedTo,
        assistantTo: workOrdersTable.assistantTo,
        technicians: workOrdersTable.technicians,
      })
      .from(workOrdersTable)
      .where(eq(workOrdersTable.id, workOrderId));
    const ctx = await buildUserAssignmentContext(req.user);
    if (!order || !canUserAccessWorkOrder(req.user, { id: workOrderId, ...order }, ctx)) {
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
