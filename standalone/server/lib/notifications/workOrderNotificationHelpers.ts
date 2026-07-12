import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { db, usersTable, employeesTable } from "@workspace/db";
import { sendNotification, fireAndForgetNotification } from "./notificationService.ts";
import { NOTIFICATION_TYPES } from "../../../shared/notifications/types.ts";
import { logger } from "../logger.ts";

export async function notifyManagersFieldProgress(opts: {
  workOrderId: number;
  engineerUserId: number;
  title: string;
  message: string;
  dedupeKey: string;
  lineMessage?: string;
}): Promise<void> {
  try {
    const managers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.isActive, true), eq(usersTable.receiveDispatchNotifications, true)));

    let recipientUserIds = managers.map(m => m.id).filter(id => id !== opts.engineerUserId);

    if (recipientUserIds.length === 0 && managers.some(m => m.id === opts.engineerUserId)) {
      recipientUserIds = [opts.engineerUserId];
      logger.info({ engineerUserId: opts.engineerUserId }, "field progress: solo recipient fallback");
    }

    logger.info({
      workOrderId: opts.workOrderId,
      engineerUserId: opts.engineerUserId,
      recipientCount: recipientUserIds.length,
    }, "Field progress notify recipients");

    if (recipientUserIds.length === 0) {
      logger.warn({ workOrderId: opts.workOrderId }, "Field progress notify: no recipients");
      return;
    }

    await sendNotification({
      recipientUserIds,
      type: NOTIFICATION_TYPES.FIELD_PROGRESS,
      title: opts.title,
      message: opts.message,
      workOrderId: opts.workOrderId,
      dedupeKey: opts.dedupeKey,
      lineMessage: opts.lineMessage ?? `📍 ${opts.title}\n\n${opts.message}`,
      channels: ["in_app", "web_push", "line"],
    });
  } catch (err) {
    logger.error({ err, workOrderId: opts.workOrderId }, "notifyManagersFieldProgress failed");
  }
}

function parseTechnicianNames(technicians: string | null): string[] {
  if (!technicians) return [];
  try {
    const parsed = JSON.parse(technicians);
    return Array.isArray(parsed) ? parsed.map(String).map(s => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function collectAssignmentNames(order: {
  assignedTo?: string | null;
  assistantTo?: string | null;
  technicians?: string | null;
}): string[] {
  const names = new Set<string>();
  if (order.assignedTo?.trim()) names.add(order.assignedTo.trim());
  if (order.assistantTo?.trim()) names.add(order.assistantTo.trim());
  for (const t of parseTechnicianNames(order.technicians ?? null)) names.add(t);
  return [...names];
}

/** Resolve ERP user IDs for engineers assigned to a work order. */
export async function resolveEngineerUserIdsForWorkOrder(order: {
  assignedTo?: string | null;
  assistantTo?: string | null;
  technicians?: string | null;
}): Promise<number[]> {
  const names = collectAssignmentNames(order);
  if (names.length === 0) return [];

  const activeUsers = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      linkedEmployeeId: usersTable.linkedEmployeeId,
    })
    .from(usersTable)
    .where(and(eq(usersTable.isActive, true), isNotNull(usersTable.linkedEmployeeId)));

  const employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(inArray(employeesTable.name, names));

  const employeeNameToId = new Map(employees.map(e => [e.name.trim(), e.id]));
  const nameSet = new Set(names);
  const ids = new Set<number>();

  for (const user of activeUsers) {
    if (nameSet.has(user.displayName.trim()) || nameSet.has(user.username.trim())) {
      ids.add(user.id);
      continue;
    }
    if (user.linkedEmployeeId != null) {
      const emp = employees.find(e => e.id === user.linkedEmployeeId);
      if (emp && nameSet.has(emp.name.trim())) ids.add(user.id);
    }
  }

  return [...ids];
}

export interface WorkOrderNotifyContext {
  id: number;
  workOrderNumber?: string | null;
  customerName?: string | null;
  installAddress?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  assignedTo?: string | null;
  assistantTo?: string | null;
  technicians?: string | null;
}

function woLabel(order: WorkOrderNotifyContext): string {
  return order.workOrderNumber ?? `#${order.id}`;
}

export async function notifyWorkOrderAssigned(order: WorkOrderNotifyContext, dedupeSuffix: string): Promise<void> {
  const recipients = await resolveEngineerUserIdsForWorkOrder(order);
  if (recipients.length === 0) return;

  const label = woLabel(order);
  const customer = order.customerName ?? "（未知客戶）";
  const title = "新派工通知";
  const message = `客戶：${customer}\n案件：${label}\n施工：${order.scheduledDate ?? "—"}${order.scheduledTime ? ` ${order.scheduledTime}` : ""}`;

  fireAndForgetNotification({
    recipientUserIds: recipients,
    type: NOTIFICATION_TYPES.WORK_ORDER_ASSIGNED,
    title,
    message,
    workOrderId: order.id,
    dedupeKey: `wo-assigned-${order.id}-${dedupeSuffix}`,
    lineMessage: `📋 新派工通知\n\n客戶：${customer}\n案件編號：${label}\n施工日期：${order.scheduledDate ?? "—"}${order.scheduledTime ? ` ${order.scheduledTime}` : ""}\n地址：${order.installAddress ?? "—"}\n\n請工程師確認並安排施工。`,
  });
}

export async function notifyWorkOrderUpdated(
  order: WorkOrderNotifyContext,
  event: {
    type: string;
    title: string;
    message: string;
    lineMessage?: string;
    dedupeKey: string;
  },
): Promise<void> {
  const recipients = await resolveEngineerUserIdsForWorkOrder(order);
  if (recipients.length === 0) return;

  fireAndForgetNotification({
    recipientUserIds: recipients,
    type: event.type,
    title: event.title,
    message: event.message,
    workOrderId: order.id,
    dedupeKey: event.dedupeKey,
    lineMessage: event.lineMessage,
  });
}

export async function notifyWorkOrderReopened(opts: {
  order: WorkOrderNotifyContext;
  returnReason: string;
  returnNote?: string | null;
  reopenedByUserId: number;
  dedupeKey: string;
}): Promise<void> {
  const recipients = await resolveEngineerUserIdsForWorkOrder(opts.order);
  if (recipients.length === 0) return;

  const customer = opts.order.customerName ?? "（未知客戶）";
  const label = woLabel(opts.order);
  const note = opts.returnNote?.trim() || "—";

  fireAndForgetNotification({
    recipientUserIds: recipients,
    type: NOTIFICATION_TYPES.WORK_ORDER_REOPENED,
    title: "派工單退回重拍",
    message: `客戶：${customer}\n案件：${label}\n原因：${opts.returnReason}`,
    pushTitle: "派工單退回重拍",
    pushBody: `客戶：${customer}\n案件：${label}\n原因：${opts.returnReason}`,
    workOrderId: opts.order.id,
    dedupeKey: opts.dedupeKey,
    payload: {
      returnReason: opts.returnReason,
      returnNote: opts.returnNote ?? null,
    },
    lineMessage: [
      "📸 派工單退回重拍",
      "",
      `客戶：${customer}`,
      `案件編號：${label}`,
      `施工地址：${opts.order.installAddress ?? "—"}`,
      `原因：${opts.returnReason}`,
      `說明：${note}`,
      "",
      "請工程師重新進入案件處理。",
    ].join("\n"),
  });
}
