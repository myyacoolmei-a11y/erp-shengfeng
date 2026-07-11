import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderFieldProgressTable,
  customersTable,
} from "@workspace/db";
import { requireRole } from "../lib/auth";
import {
  UNABLE_REASONS,
  buildUserAssignmentContext,
  canUserAccessWorkOrder,
  isFieldProgressOperator,
  isFieldProgressAdmin,
  diffMinutes,
  serializeFieldProgress,
  taipeiDateString,
} from "../lib/workOrders/fieldProgressUtils.ts";
import { notifyFieldProgressEvent } from "../lib/notifications/fieldProgressNotifyService.ts";
import { logger } from "../lib/logger.ts";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "accountant", "engineer", "technician"] as const;
const OPERATE_ROLES = ["engineer", "technician"] as const;
const STATS_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;

type WoRow = {
  id: number;
  assignedTo: string | null;
  assistantTo: string | null;
  technicians: string | null;
  status: string;
};

async function fetchWorkOrder(id: number): Promise<WoRow | null> {
  const [order] = await db
    .select({
      id: workOrdersTable.id,
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
    .values({ workOrderId, engineerUserId, engineerName })
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
): void {
  void notifyFieldProgressEvent({
    workOrderId,
    engineerUserId: req.user!.id,
    engineerName: req.user!.displayName,
    action,
    actedAt,
  }).catch(err => logger.error({ err }, "field progress notify failed"));
}

/** GET field progress for one work order (all engineers for admin; own only for engineer) */
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

/** GET current user's field progress records (for engineer dashboard) */
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

async function handleFieldAction(
  req: Request,
  res: Response,
  action: "depart" | "arrive" | "complete",
): Promise<void> {
  const workOrderId = parseWorkOrderId(req.params.workOrderId);
  if (!workOrderId) {
    res.status(400).json({ error: "Invalid workOrderId" });
    return;
  }

  if (!isFieldProgressOperator(req.user!)) {
    res.status(403).json({ error: "只有工程師可以記錄施工進度" });
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

  const progress = await getOrCreateProgress(
    workOrderId,
    req.user!.id,
    req.user!.displayName,
  );

  if (progress.completedAt) {
    res.status(409).json({ error: "此案件已完工，無法再次操作" });
    return;
  }

  const now = new Date();

  if (action === "depart") {
    if (progress.departedAt) {
      res.status(409).json({ error: "已記錄前往案場時間" });
      return;
    }
    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({ departedAt: now, updatedAt: now })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();
    emitFieldProgressNotify(req, workOrderId, "depart", now);
    res.json(serializeFieldProgress(updated));
    return;
  }

  if (action === "arrive") {
    if (!progress.departedAt) {
      res.status(400).json({ error: "請先記錄「前往案場」" });
      return;
    }
    if (progress.arrivedAt) {
      res.status(409).json({ error: "已記錄到達施工時間" });
      return;
    }
    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({ arrivedAt: now, updatedAt: now })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();
    emitFieldProgressNotify(req, workOrderId, "arrive", now);
    res.json(serializeFieldProgress(updated));
    return;
  }

  // complete
  if (!progress.departedAt) {
    res.status(400).json({ error: "請先記錄「前往案場」" });
    return;
  }
  if (!progress.arrivedAt) {
    res.status(400).json({ error: "請先記錄「到達施工」" });
    return;
  }

  const travelDurationMinutes = diffMinutes(progress.departedAt, progress.arrivedAt);
  const workDurationMinutes = diffMinutes(progress.arrivedAt, now);
  const totalDurationMinutes = diffMinutes(progress.departedAt, now);

  const [updated] = await db
    .update(workOrderFieldProgressTable)
    .set({
      completedAt: now,
      travelDurationMinutes,
      workDurationMinutes,
      totalDurationMinutes,
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

  emitFieldProgressNotify(req, workOrderId, "complete", now);
  res.json(serializeFieldProgress(updated));
}

router.post(
  "/work-orders/:workOrderId/field-progress/depart",
  requireRole(...OPERATE_ROLES),
  (req, res) => handleFieldAction(req, res, "depart"),
);

router.post(
  "/work-orders/:workOrderId/field-progress/arrive",
  requireRole(...OPERATE_ROLES),
  (req, res) => handleFieldAction(req, res, "arrive"),
);

router.post(
  "/work-orders/:workOrderId/field-progress/complete",
  requireRole(...OPERATE_ROLES),
  (req, res) => handleFieldAction(req, res, "complete"),
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

    const progress = await getOrCreateProgress(
      workOrderId,
      req.user!.id,
      req.user!.displayName,
    );

    if (progress.completedAt) {
      res.status(409).json({ error: "此案件已完工，無法回報異常" });
      return;
    }

    if (!progress.departedAt && !progress.arrivedAt) {
      res.status(400).json({ error: "請先記錄「前往案場」後才能回報無法完成" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(workOrderFieldProgressTable)
      .set({
        unableToCompleteAt: now,
        unableReason: reason,
        unableNote: reason === "其他" ? note!.trim() : note?.trim() || null,
        updatedAt: now,
      })
      .where(eq(workOrderFieldProgressTable.id, progress.id))
      .returning();

    emitFieldProgressNotify(req, workOrderId, "unable", now);
    res.json(serializeFieldProgress(updated));
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

/** Work hours statistics for admin/accountant */
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
