import { eq } from "drizzle-orm";
import { db, workOrdersTable, customersTable, workOrderReopenEventsTable } from "@workspace/db";
import { NOTIFICATION_TYPES } from "../../../shared/notifications/types.ts";
import {
  notifyWorkOrderAssigned,
  notifyWorkOrderUpdated,
  notifyWorkOrderReopened,
  resolveEngineerUserIdsForWorkOrder,
} from "./workOrderNotificationHelpers.ts";

type WorkOrderRow = typeof workOrdersTable.$inferSelect;

function parseTechnicianNames(technicians: string | null): string[] {
  if (!technicians) return [];
  try {
    const parsed = JSON.parse(technicians);
    return Array.isArray(parsed) ? parsed.map(String).map(s => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function loadNotifyContext(order: WorkOrderRow) {
  let customerName = order.customerName;
  if (order.customerId && !customerName) {
    const [c] = await db
      .select({ name: customersTable.name })
      .from(customersTable)
      .where(eq(customersTable.id, order.customerId));
    customerName = c?.name ?? null;
  }
  return {
    id: order.id,
    workOrderNumber: order.workOrderNumber,
    customerName,
    installAddress: order.installAddress,
    scheduledDate: order.scheduledDate,
    scheduledTime: order.scheduledTime,
    assignedTo: order.assignedTo,
    assistantTo: order.assistantTo,
    technicians: order.technicians,
    status: order.status,
  };
}

export async function emitWorkOrderCreatedNotifications(order: WorkOrderRow): Promise<void> {
  const ctx = await loadNotifyContext(order);
  await notifyWorkOrderAssigned(ctx, String(Date.now()));
}

export async function emitWorkOrderUpdatedNotifications(
  before: WorkOrderRow,
  after: WorkOrderRow,
  opts?: {
    reopenReason?: string;
    reopenNote?: string | null;
    reopenedByUserId?: number;
    adminNote?: string;
  },
): Promise<void> {
  const beforeCtx = await loadNotifyContext(before);
  const afterCtx = await loadNotifyContext(after);
  const ts = Date.now();

  if (opts?.reopenReason && opts.reopenedByUserId) {
    await db.insert(workOrderReopenEventsTable).values({
      workOrderId: after.id,
      reopenedByUserId: opts.reopenedByUserId,
      returnReason: opts.reopenReason,
      returnNote: opts.reopenNote ?? null,
    });

    await notifyWorkOrderReopened({
      order: afterCtx,
      returnReason: opts.reopenReason,
      returnNote: opts.reopenNote,
      reopenedByUserId: opts.reopenedByUserId,
      dedupeKey: `wo-reopen-${after.id}-${ts}`,
    });
    return;
  }

  if (after.status === "已取消" && before.status !== "已取消") {
    await notifyWorkOrderUpdated(afterCtx, {
      type: NOTIFICATION_TYPES.WORK_ORDER_CANCELLED,
      title: "派工取消",
      message: `案件 ${afterCtx.workOrderNumber ?? `#${after.id}`} 已取消`,
      dedupeKey: `wo-cancel-${after.id}-${ts}`,
      lineMessage: `❌ 派工取消\n\n案件：${afterCtx.workOrderNumber ?? `#${after.id}`}\n客戶：${afterCtx.customerName ?? "—"}`,
    });
    return;
  }

  const beforeTechs = new Set(parseTechnicianNames(before.technicians));
  const afterTechs = parseTechnicianNames(after.technicians);
  const addedTechs = afterTechs.filter(t => !beforeTechs.has(t));
  if (addedTechs.length > 0) {
    await notifyWorkOrderUpdated(afterCtx, {
      type: NOTIFICATION_TYPES.WORK_ORDER_ENGINEER_ADDED,
      title: "新增派工工程師",
      message: `案件 ${afterCtx.workOrderNumber ?? `#${after.id}`} 新增工程師：${addedTechs.join("、")}`,
      dedupeKey: `wo-engineer-added-${after.id}-${ts}`,
    });
  }

  if (
    (before.scheduledDate !== after.scheduledDate || before.scheduledTime !== after.scheduledTime)
    && (after.scheduledDate || after.scheduledTime)
  ) {
    await notifyWorkOrderUpdated(afterCtx, {
      type: NOTIFICATION_TYPES.WORK_ORDER_SCHEDULE_CHANGED,
      title: "派工時間變更",
      message: `案件 ${afterCtx.workOrderNumber ?? `#${after.id}`}\n新時間：${after.scheduledDate ?? "—"}${after.scheduledTime ? ` ${after.scheduledTime}` : ""}`,
      dedupeKey: `wo-schedule-${after.id}-${before.scheduledDate}-${after.scheduledDate}-${ts}`,
      lineMessage: `📅 派工時間變更\n\n案件：${afterCtx.workOrderNumber ?? `#${after.id}`}\n新時間：${after.scheduledDate ?? "—"}${after.scheduledTime ? ` ${after.scheduledTime}` : ""}`,
    });
  }

  if (before.installAddress !== after.installAddress && after.installAddress) {
    await notifyWorkOrderUpdated(afterCtx, {
      type: NOTIFICATION_TYPES.WORK_ORDER_ADDRESS_CHANGED,
      title: "施工地址變更",
      message: `案件 ${afterCtx.workOrderNumber ?? `#${after.id}`}\n新地址：${after.installAddress}`,
      dedupeKey: `wo-address-${after.id}-${ts}`,
    });
  }

  if (opts?.adminNote?.trim()) {
    await notifyWorkOrderUpdated(afterCtx, {
      type: NOTIFICATION_TYPES.WORK_ORDER_ADMIN_NOTE,
      title: "管理員留言",
      message: `案件 ${afterCtx.workOrderNumber ?? `#${after.id}`}\n${opts.adminNote.trim()}`,
      dedupeKey: `wo-note-${after.id}-${ts}`,
    });
  }

  const beforeEngineers = await resolveEngineerUserIdsForWorkOrder(before);
  const afterEngineers = await resolveEngineerUserIdsForWorkOrder(after);
  if (afterEngineers.length > beforeEngineers.length && beforeEngineers.length === 0) {
    await notifyWorkOrderAssigned(afterCtx, String(ts));
  }
}

export async function emitWorkOrderReminder(
  order: WorkOrderRow,
  kind: "day_before" | "two_hours",
): Promise<void> {
  const ctx = await loadNotifyContext(order);
  const isDayBefore = kind === "day_before";
  const type = isDayBefore
    ? NOTIFICATION_TYPES.WORK_ORDER_REMINDER_DAY_BEFORE
    : NOTIFICATION_TYPES.WORK_ORDER_REMINDER_TWO_HOURS;
  const title = isDayBefore ? "明日施工提醒" : "施工前 2 小時提醒";
  const when = `${ctx.scheduledDate ?? "—"}${ctx.scheduledTime ? ` ${ctx.scheduledTime}` : ""}`;

  await notifyWorkOrderUpdated(ctx, {
    type,
    title,
    message: `客戶：${ctx.customerName ?? "—"}\n案件：${ctx.workOrderNumber ?? `#${order.id}`}\n時間：${when}`,
    dedupeKey: `wo-reminder-${kind}-${order.id}-${ctx.scheduledDate}-${ctx.scheduledTime ?? ""}`,
    lineMessage: `⏰ ${title}\n\n客戶：${ctx.customerName ?? "—"}\n案件：${ctx.workOrderNumber ?? `#${order.id}`}\n時間：${when}\n地址：${ctx.installAddress ?? "—"}`,
  });
}
