import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { db, usersTable, employeesTable } from "@workspace/db";
import { sendNotification, fireAndForgetNotification } from "./notificationService.ts";
import { NOTIFICATION_TYPES } from "../../../shared/notifications/types.ts";
import { logger } from "../logger.ts";

const DISPATCH_NOTIFY_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;

function userEffectiveRoles(user: { role: string; roles: string[] | null }): string[] {
  return user.roles?.length ? user.roles : [user.role];
}

function isDispatchManagerRole(roles: string[]): boolean {
  return roles.some(r => DISPATCH_NOTIFY_ROLES.includes(r as (typeof DISPATCH_NOTIFY_ROLES)[number]));
}

/** Users who should receive dispatch / field-progress notifications (managers). */
export async function resolveDispatchNotificationRecipientIds(
  excludeUserId?: number,
): Promise<number[]> {
  const rows = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      roles: usersTable.roles,
      receiveDispatchNotifications: usersTable.receiveDispatchNotifications,
    })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  const managerRecipients = rows
    .filter(u => {
      if (excludeUserId != null && u.id === excludeUserId) return false;
      if (!u.receiveDispatchNotifications) return false;
      return isDispatchManagerRole(userEffectiveRoles(u));
    })
    .map(u => u.id);

  if (managerRecipients.length > 0) {
    return managerRecipients;
  }

  const fallback = rows
    .filter(u => {
      if (excludeUserId != null && u.id === excludeUserId) return false;
      return u.receiveDispatchNotifications;
    })
    .map(u => u.id);

  if (fallback.length > 0) {
    logger.warn(
      { excludeUserId, fallbackCount: fallback.length },
      "dispatch notify: no manager-role recipients, using receiveDispatchNotifications fallback",
    );
  }

  return fallback;
}

async function isDispatchManagerUser(userId: number): Promise<boolean> {
  const [user] = await db
    .select({
      role: usersTable.role,
      roles: usersTable.roles,
      receiveDispatchNotifications: usersTable.receiveDispatchNotifications,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user?.isActive || !user.receiveDispatchNotifications) return false;
  return isDispatchManagerRole(userEffectiveRoles(user));
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

export async function notifyManagersFieldProgress(opts: {
  workOrderId: number;
  engineerUserId: number;
  title: string;
  message: string;
  dedupeKey: string;
  lineMessage?: string;
}): Promise<void> {
  let recipientUserIds = await resolveDispatchNotificationRecipientIds(opts.engineerUserId);

  if (recipientUserIds.length === 0 && (await isDispatchManagerUser(opts.engineerUserId))) {
    recipientUserIds = [opts.engineerUserId];
    logger.info(
      { engineerUserId: opts.engineerUserId, workOrderId: opts.workOrderId },
      "field progress notify: solo manager — notifying acting user",
    );
  }

  logger.info({
    event: "field_progress_notify_recipients",
    workOrderId: opts.workOrderId,
    engineerUserId: opts.engineerUserId,
    recipientCount: recipientUserIds.length,
    recipientUserIds,
  }, "Field progress notification recipients resolved");

  if (recipientUserIds.length === 0) {
    logger.warn({
      event: "field_progress_notify_no_recipients",
      workOrderId: opts.workOrderId,
      engineerUserId: opts.engineerUserId,
    }, "Field progress notification skipped: no recipients");
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
}
