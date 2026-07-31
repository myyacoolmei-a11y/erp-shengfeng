import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderFieldProgressTable,
  fieldProgressSnapshotsTable,
  fieldProgressBackfillRequestsTable,
  customersTable,
} from "@workspace/db";
import { requireRole } from "../lib/auth";
import {
  UNABLE_REASONS,
  PAUSE_REASONS,
  buildUserAssignmentContext,
  canUserAccessWorkOrder,
  isFieldProgressOperator,
  isFieldProgressAdmin,
  diffMinutes,
  serializeFieldProgress,
  serializeFieldProgressSnapshot,
  taipeiDateString,
  computeDurations,
  deriveFieldStatus,
} from "../lib/workOrders/fieldProgressUtils.ts";
import {
  BACKFILL_STEPS,
  emptyCompletionChecklist,
  isChecklistComplete,
  type CompletionChecklist,
  type PauseInterval,
} from "../../shared/fieldProgressConstants.ts";
import { upsertAdminFieldCompleteTodo } from "../lib/workOrders/upsertAdminFieldTodo.ts";
import { notifyFieldProgressEvent } from "../lib/notifications/fieldProgressNotifyService.ts";
import { logger } from "../lib/logger.ts";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "accountant", "engineer", "technician"] as const;
const OPERATE_ROLES = ["engineer", "technician"] as const;
const STATS_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;

type WoRow = {
  id: number;
  workOrderNumber: string | null;
  customerName: string | null;
  assignedTo: string | null;
  assistantTo: string | null;
  technicians: string | null;
  status: string;
};

async function fetchWorkOrder(id: number): Promise<WoRow | null> {
  const [order] = await db
    .select({
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      customerName: workOrdersTable.customerName,
      assignedTo: workOrdersTable.assignedTo,
      assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians,
      status: workOrdersTable.status,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, id));
  return order ?? null;
}

function assertWorkOrderAccess(
  user: NonNullable<Request["user"]>,
  order: WoRow,
  ctx: Awaited<ReturnType<typeof buildUserAssignmentContext>>,
): { ok: true } | { ok: false; status: number; message: string } {
  if (canUserAccessWorkOrder(user, order, ctx)) {
    return { ok: true };
  }
  return { ok: false, status: 403, message: "您沒有權限操作此派工單" };
}

async function getOrCreateProgress(
  workOrderId: number,
  engineerUserId: number,
  engineerName: string,
) {
  const [existing] = await db
    .select()
    .from(workOrderFieldProgressTable)
    .where(
      and(
        eq(workOrderFieldProgressTable.workOrderId, workOrderId),
        eq(workOrderFieldProgressTable.engineerUserId, engineerUserId),
      ),
    );

  if (existing) return existing;

  const [created] = await db
    .insert(workOrderFieldProgressTable)
    .values({
      workOrderId,
      engineerUserId,
      engineerName,
      fieldStatus: "pending",
      pauseIntervals: [],
      pauseTotalMinutes: 0,
    })
    .returning();
  return created;
}

function parseWorkOrderId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const id = parseInt(s ?? "", 10);
  return Number.isNaN(id) ? null : id;
}

function emitFieldProgressNotify(
  req: Request,
  workOrderId: number,
  action: "depart" | "arrive" | "complete" | "unable",
  actedAt: Date,
  extra?: { unableReason?: string; unableNote?: string | null },
): void {
  void notifyFieldProgressEvent({
    workOrderId,
    engineerUserId: req.user!.id,
    engineerName: req.user!.displayName,
    action,
    actedAt,
    unableReason: extra?.unableReason,
    unableNote: extra?.unableNote,
  }).catch((err) => {
    logger.error({ err, workOrderId, action }, "field progress notify failed");
  });
}

async function loadAccessibleProgress(req: Request, res: Response, workOrderId: number) {
  if (!isFieldProgressOperator(req.user!)) {
    res.status(403).json({ error: "只有工程師可以記錄施工進度" });
    return null;
  }
  const order = await fetchWorkOrder(workOrderId);
  if (!order) {
    res.status(404).json({ error: "找不到派工單" });
    return null;
  }
  const ctx = await buildUserAssignmentContext(req.user!);
  const access = assertWorkOrderAccess(req.user!, order, ctx);
  if (!access.ok) {
    res.status(access.status).json({ error: access.message });
    return null;
  }
  const progress = await getOrCreateProgress(workOrderId, req.user!.id, req.user!.displayName);
  return { order, progress };
}

/** GET field progress for one work order */
router.get(
  "/work-orders/:workOrderId/field-progress",
  requireRole(...READ_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }

    const order = await fetchWorkOrder(workOrderId);
    if (!order) {
      res.status(404).json({ error: "找不到派工單" });
      return;
    }

    const ctx = await buildUserAssignmentContext(req.user!);
    const access = assertWorkOrderAccess(req.user!, order, ctx);
    if (!access.ok) {
      res.status(access.status).json({ error: access.message });
      return;
    }

    const rows = await db
      .select()
      .from(workOrderFieldProgressTable)
      .where(eq(workOrderFieldProgressTable.workOrderId, workOrderId));

    const filtered =
      isFieldProgressOperator(req.user!) && !isFieldProgressAdmin(req.user!)
        ? rows.filter((r) => r.engineerUserId === req.user!.id)
        : rows;

    res.json(filtered.map(serializeFieldProgress));
  },
);

router.get(
  "/work-orders/:workOrderId/field-progress/snapshots",
  requireRole(...READ_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }

    if (!isFieldProgressAdmin(req.user!)) {
      res.status(403).json({ error: "您沒有權限查看歷史施工紀錄" });
      return;
    }

    const order = await fetchWorkOrder(workOrderId);
    if (!order) {
      res.status(404).json({ error: "找不到派工單" });
      return;
    }

    const rows = await db
      .select()
      .from(fieldProgressSnapshotsTable)
      .where(eq(fieldProgressSnapshotsTable.workOrderId, workOrderId))
      .orderBy(desc(fieldProgressSnapshotsTable.archivedAt));

    res.json(rows.map(serializeFieldProgressSnapshot));
  },
);

router.get(
  "/field-progress/mine",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(workOrderFieldProgressTable)
      .where(eq(workOrderFieldProgressTable.engineerUserId, req.user!.id));

    res.json(rows.map(serializeFieldProgress));
  },
);

router.post(
  "/work-orders/:workOrderId/field-progress/depart",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }
    const loaded = await loadAccessibleProgress(req, res, workOrderId);
    if (!loaded) return;
    const { progress } = loaded;

    if (progress.completedAt) {
      res.status(409).json({ error: "此案件已完工，無法再次操作" });
      return;
    }
    if (progress.departedAt) {
      res.status(409).json({ error: "已記錄出發時間" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({
        departedAt: now,
        fieldStatus: "en_route",
        lastActionBy: req.user!.id,
        updatedAt: now,
      })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();

    emitFieldProgressNotify(req, workOrderId, "depart", now);
    res.json(serializeFieldProgress(updated));
  },
);

router.post(
  "/work-orders/:workOrderId/field-progress/arrive",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }
    const loaded = await loadAccessibleProgress(req, res, workOrderId);
    if (!loaded) return;
    const { progress } = loaded;

    if (progress.completedAt) {
      res.status(409).json({ error: "此案件已完工，無法再次操作" });
      return;
    }
    if (!progress.departedAt) {
      res.status(400).json({ error: "請先按「出發中」" });
      return;
    }
    if (progress.arrivedAt) {
      res.status(409).json({ error: "已記錄到場時間" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({
        arrivedAt: now,
        fieldStatus: "in_progress",
        lastActionBy: req.user!.id,
        updatedAt: now,
      })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();

    emitFieldProgressNotify(req, workOrderId, "arrive", now);
    res.json(serializeFieldProgress(updated));
  },
);

router.post(
  "/work-orders/:workOrderId/field-progress/pause",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }
    const { reason, note } = req.body as { reason?: string; note?: string };
    if (!reason || !(PAUSE_REASONS as readonly string[]).includes(reason)) {
      res.status(400).json({ error: "請選擇有效的暫停原因" });
      return;
    }
    if (reason === "其他" && (!note || !note.trim())) {
      res.status(400).json({ error: "選擇「其他」時必須填寫備註" });
      return;
    }

    const loaded = await loadAccessibleProgress(req, res, workOrderId);
    if (!loaded) return;
    const { progress } = loaded;
    const status = deriveFieldStatus(progress);

    if (progress.completedAt || status === "completed") {
      res.status(409).json({ error: "此案件已完工" });
      return;
    }
    if (status !== "in_progress") {
      res.status(400).json({ error: "僅施工中可暫停" });
      return;
    }

    const now = new Date();
    const intervals: PauseInterval[] = Array.isArray(progress.pauseIntervals)
      ? [...progress.pauseIntervals]
      : [];
    intervals.push({
      pausedAt: now.toISOString(),
      resumedAt: null,
      reason,
      note: reason === "其他" ? note!.trim() : note?.trim() || null,
    });

    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({
        fieldStatus: "paused",
        pausedAt: now,
        pauseReason: reason,
        pauseNote: reason === "其他" ? note!.trim() : note?.trim() || null,
        pauseIntervals: intervals,
        lastActionBy: req.user!.id,
        updatedAt: now,
      })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();

    res.json(serializeFieldProgress(updated));
  },
);

router.post(
  "/work-orders/:workOrderId/field-progress/resume",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }
    const loaded = await loadAccessibleProgress(req, res, workOrderId);
    if (!loaded) return;
    const { progress } = loaded;
    const status = deriveFieldStatus(progress);

    if (status !== "paused" || !progress.pausedAt) {
      res.status(400).json({ error: "目前不是暫停狀態" });
      return;
    }

    const now = new Date();
    const pauseDelta = diffMinutes(progress.pausedAt, now);
    const pauseTotalMinutes = (progress.pauseTotalMinutes ?? 0) + pauseDelta;
    const intervals: PauseInterval[] = Array.isArray(progress.pauseIntervals)
      ? [...progress.pauseIntervals]
      : [];
    if (intervals.length > 0 && intervals[intervals.length - 1]!.resumedAt == null) {
      intervals[intervals.length - 1] = {
        ...intervals[intervals.length - 1]!,
        resumedAt: now.toISOString(),
      };
    }

    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({
        fieldStatus: "in_progress",
        resumedAt: now,
        pauseTotalMinutes,
        pauseIntervals: intervals,
        lastActionBy: req.user!.id,
        updatedAt: now,
      })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();

    res.json(serializeFieldProgress(updated));
  },
);

router.post(
  "/work-orders/:workOrderId/field-progress/complete",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }

    const body = req.body as { checklist?: CompletionChecklist };
    const checklist = { ...emptyCompletionChecklist(), ...(body.checklist ?? {}) };
    if (!isChecklistComplete(checklist)) {
      res.status(400).json({ error: "請勾選全部施工完成確認項目" });
      return;
    }

    const loaded = await loadAccessibleProgress(req, res, workOrderId);
    if (!loaded) return;
    const { order, progress } = loaded;
    const status = deriveFieldStatus(progress);

    if (progress.completedAt) {
      res.status(409).json({ error: "此案件已完工" });
      return;
    }
    if (!progress.departedAt || !progress.arrivedAt) {
      res.status(400).json({ error: "請先完成出發與到場" });
      return;
    }
    if (status === "paused") {
      res.status(400).json({ error: "請先恢復施工後再完成" });
      return;
    }
    if (status !== "in_progress") {
      res.status(400).json({ error: "僅施工中可完成" });
      return;
    }

    const now = new Date();
    const openPause =
      progress.pausedAt &&
      (!progress.resumedAt || progress.pausedAt.getTime() > progress.resumedAt.getTime())
        ? progress.pausedAt
        : null;

    const durations = computeDurations({
      departedAt: progress.departedAt,
      arrivedAt: progress.arrivedAt,
      completedAt: now,
      pauseTotalMinutes: progress.pauseTotalMinutes ?? 0,
      openPauseStartedAt: openPause,
    });

    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({
        completedAt: now,
        fieldStatus: "completed",
        completedBy: req.user!.id,
        completionChecklist: checklist,
        workflowStatus: "pending_admin",
        travelDurationMinutes: durations.travelDurationMinutes,
        workDurationMinutes: durations.workDurationMinutes,
        totalDurationMinutes: durations.totalDurationMinutes,
        pauseTotalMinutes: durations.pauseTotalMinutes,
        lastActionBy: req.user!.id,
        updatedAt: now,
      })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();

    await db
      .update(workOrdersTable)
      .set({
        status: "已完成",
        completedDate: taipeiDateString(now),
        updatedAt: now,
      })
      .where(eq(workOrdersTable.id, workOrderId));

    await upsertAdminFieldCompleteTodo({
      workOrderId,
      workOrderNumber: order.workOrderNumber,
      customerName: order.customerName,
      createdBy: req.user!.id,
    });

    emitFieldProgressNotify(req, workOrderId, "complete", now);
    res.json(serializeFieldProgress(updated));
  },
);

router.post(
  "/work-orders/:workOrderId/field-progress/unable",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }

    const { reason, note } = req.body as { reason?: string; note?: string };
    if (!reason || !UNABLE_REASONS.includes(reason as (typeof UNABLE_REASONS)[number])) {
      res.status(400).json({ error: "請選擇有效的無法完成原因" });
      return;
    }
    if (reason === "其他" && (!note || !note.trim())) {
      res.status(400).json({ error: "選擇「其他」時必須填寫備註" });
      return;
    }

    const loaded = await loadAccessibleProgress(req, res, workOrderId);
    if (!loaded) return;
    const { progress } = loaded;

    if (progress.completedAt) {
      res.status(409).json({ error: "此案件已完工，無法回報異常" });
      return;
    }
    if (!progress.departedAt && !progress.arrivedAt) {
      res.status(400).json({ error: "請先記錄「出發中」後才能回報無法完成" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({
        unableToCompleteAt: now,
        unableReason: reason,
        unableNote: reason === "其他" ? note!.trim() : note?.trim() || null,
        lastActionBy: req.user!.id,
        updatedAt: now,
      })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();

    emitFieldProgressNotify(req, workOrderId, "unable", now, {
      unableReason: reason,
      unableNote: reason === "其他" ? note!.trim() : note?.trim() || null,
    });
    res.json(serializeFieldProgress(updated));
  },
);

/** 申請補登 — 不覆蓋原始時間，僅建立 pending 申請 */
router.post(
  "/work-orders/:workOrderId/field-progress/backfill-request",
  requireRole(...OPERATE_ROLES),
  async (req, res): Promise<void> => {
    const workOrderId = parseWorkOrderId(req.params.workOrderId);
    if (!workOrderId) {
      res.status(400).json({ error: "Invalid workOrderId" });
      return;
    }

    const { missedStep, requestedTime, reason, note } = req.body as {
      missedStep?: string;
      requestedTime?: string;
      reason?: string;
      note?: string;
    };

    if (!missedStep || !(BACKFILL_STEPS as readonly string[]).includes(missedStep)) {
      res.status(400).json({ error: "請選擇漏按步驟" });
      return;
    }
    if (!requestedTime || Number.isNaN(Date.parse(requestedTime))) {
      res.status(400).json({ error: "請填寫實際時間" });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: "請填寫原因" });
      return;
    }

    const loaded = await loadAccessibleProgress(req, res, workOrderId);
    if (!loaded) return;

    const [created] = await db
      .insert(fieldProgressBackfillRequestsTable)
      .values({
        workOrderId,
        progressId: loaded.progress.id,
        requestedBy: req.user!.id,
        missedStep,
        requestedTime: new Date(requestedTime),
        reason: reason.trim(),
        note: note?.trim() || null,
        approvalStatus: "pending",
      })
      .returning();

    res.status(201).json({
      id: created.id,
      workOrderId: created.workOrderId,
      missedStep: created.missedStep,
      requestedTime: created.requestedTime.toISOString(),
      reason: created.reason,
      note: created.note,
      approvalStatus: created.approvalStatus,
      requestedAt: created.requestedAt.toISOString(),
      requestedBy: created.requestedBy,
    });
  },
);

function resolveDateRange(preset?: string, from?: string, to?: string): { from: string; to: string } | null {
  const today = taipeiDateString();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      from: monday.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }),
      to: sunday.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }),
    };
  }
  if (preset === "month") {
    const d = new Date();
    const y = d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).slice(0, 4);
    const m = d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).slice(5, 7);
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, "0")}` };
  }
  if (from && to) return { from, to };
  return null;
}

router.get(
  "/work-hours/stats",
  requireRole(...STATS_ROLES),
  async (req, res): Promise<void> => {
    const { preset, from, to, engineerUserId } = req.query as {
      preset?: string;
      from?: string;
      to?: string;
      engineerUserId?: string;
    };

    const range = resolveDateRange(preset, from, to);
    if (!range) {
      res.status(400).json({ error: "請提供日期篩選條件" });
      return;
    }

    const conditions = [
      gte(
        sql`COALESCE(${workOrderFieldProgressTable.departedAt}::date, ${workOrdersTable.scheduledDate})`,
        range.from,
      ),
      lte(
        sql`COALESCE(${workOrderFieldProgressTable.departedAt}::date, ${workOrdersTable.scheduledDate})`,
        range.to,
      ),
    ];

    if (engineerUserId) {
      const uid = parseInt(engineerUserId, 10);
      if (!Number.isNaN(uid)) {
        conditions.push(eq(workOrderFieldProgressTable.engineerUserId, uid));
      }
    }

    const rows = await db
      .select({
        progress: workOrderFieldProgressTable,
        workOrderNumber: workOrdersTable.workOrderNumber,
        customerName: sql<string>`COALESCE(${customersTable.name}, ${workOrdersTable.customerName})`.as("customer_name"),
        scheduledDate: workOrdersTable.scheduledDate,
        workOrderId: workOrdersTable.id,
      })
      .from(workOrderFieldProgressTable)
      .innerJoin(workOrdersTable, eq(workOrderFieldProgressTable.workOrderId, workOrdersTable.id))
      .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
      .where(and(...conditions))
      .orderBy(workOrderFieldProgressTable.departedAt);

    res.json(
      rows.map(({ progress, workOrderNumber, customerName, scheduledDate, workOrderId }) => {
        const serialized = serializeFieldProgress(progress);
        const activityDate =
          progress.departedAt?.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) ??
          scheduledDate ??
          "—";
        return {
          ...serialized,
          date: activityDate,
          workOrderNumber: workOrderNumber ?? `#${workOrderId}`,
          customerName: customerName ?? "—",
        };
      }),
    );
  },
);

export default router;
