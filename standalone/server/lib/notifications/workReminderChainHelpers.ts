import { and, eq } from "drizzle-orm";
import { db, workOrdersTable, workOrderFieldProgressTable, customersTable } from "@workspace/db";
import { taipeiToday } from "../reminders/dateUtils.ts";
import { fireAndForgetNotification } from "./notificationService.ts";
import { resolveEngineerUserIdsForWorkOrder } from "./workOrderNotificationHelpers.ts";
import { NOTIFICATION_TYPES } from "../../../shared/notifications/types.ts";
import { tryToAbsoluteAppUrl } from "../appUrl.ts";
import { getWorkReminderPrefForUser } from "../line/lineSubscriptionService.ts";
import { logger } from "../logger.ts";

function appointmentMs(scheduledDate: string, scheduledTime: string): number | null {
  const m = scheduledTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const [y, mo, d] = scheduledDate.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hour - 8, minute)).getTime();
}

type TodayOrder = {
  id: number;
  workOrderNumber: string | null;
  customerName: string | null;
  linkedCustomerName: string | null;
  installAddress: string | null;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  assignedTo: string | null;
  assistantTo: string | null;
  technicians: string | null;
  apptMs: number;
};

async function loadTodayOrders(): Promise<TodayOrder[]> {
  const today = taipeiToday();
  const rows = await db
    .select({
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      customerName: workOrdersTable.customerName,
      linkedCustomerName: customersTable.name,
      installAddress: workOrdersTable.installAddress,
      scheduledDate: workOrdersTable.scheduledDate,
      scheduledTime: workOrdersTable.scheduledTime,
      status: workOrdersTable.status,
      assignedTo: workOrdersTable.assignedTo,
      assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians,
    })
    .from(workOrdersTable)
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .where(eq(workOrdersTable.scheduledDate, today));

  const orders: TodayOrder[] = [];
  for (const row of rows) {
    if (!row.scheduledDate || !row.scheduledTime) continue;
    const apptMs = appointmentMs(row.scheduledDate, row.scheduledTime);
    if (apptMs == null) continue;
    orders.push({
      ...row,
      scheduledDate: row.scheduledDate,
      scheduledTime: row.scheduledTime,
      apptMs,
    });
  }
  return orders.sort((a, b) => a.apptMs - b.apptMs);
}

async function isOrderIncompleteForEngineer(workOrderId: number, engineerUserId: number): Promise<boolean> {
  const [progress] = await db
    .select({ completedAt: workOrderFieldProgressTable.completedAt })
    .from(workOrderFieldProgressTable)
    .where(
      and(
        eq(workOrderFieldProgressTable.workOrderId, workOrderId),
        eq(workOrderFieldProgressTable.engineerUserId, engineerUserId),
      ),
    );
  return !progress?.completedAt;
}

export async function notifyPreviousJobIncompleteIfNeeded(opts: {
  nextOrder: TodayOrder;
  engineerUserIds: number[];
}): Promise<void> {
  try {
    const todayOrders = await loadTodayOrders();
    const customerName = opts.nextOrder.linkedCustomerName ?? opts.nextOrder.customerName ?? "—";

    for (const engineerUserId of opts.engineerUserIds) {
      const engineerOrders: TodayOrder[] = [];
      for (const order of todayOrders) {
        const ids = await resolveEngineerUserIdsForWorkOrder(order);
        if (ids.includes(engineerUserId)) engineerOrders.push(order);
      }
      engineerOrders.sort((a, b) => a.apptMs - b.apptMs);

      const prev = engineerOrders
        .filter(o => o.apptMs < opts.nextOrder.apptMs && o.id !== opts.nextOrder.id)
        .at(-1);
      if (!prev || prev.status !== "待施工") continue;
      if (!(await isOrderIncompleteForEngineer(prev.id, engineerUserId))) continue;

      const allowed = await getWorkReminderPrefForUser(engineerUserId, "receivePreviousJobIncomplete");
      if (!allowed) continue;

      const prevCustomer = prev.linkedCustomerName ?? prev.customerName ?? "—";
      const message = `上一案件尚未完成（${prevCustomer}），下一案件即將開始（${customerName}），請盡快收尾。`;
      const navUrl = opts.nextOrder.installAddress
        ? tryToAbsoluteAppUrl(`/work-orders?open=${opts.nextOrder.id}`)
        : null;
      const lineText = navUrl ? `${message}\n\n📍 下一案導航：${navUrl}` : message;

      fireAndForgetNotification({
        recipientUserIds: [engineerUserId],
        type: NOTIFICATION_TYPES.AI_WORK_REMINDER_PREVIOUS_INCOMPLETE,
        title: "上一案件尚未完成",
        message,
        workOrderId: opts.nextOrder.id,
        dedupeKey: `ai-wr-prev-incomplete-${engineerUserId}-${opts.nextOrder.id}-${opts.nextOrder.scheduledDate}`,
        lineMessage: lineText,
        channels: ["web_push", "line"],
      });
    }
  } catch (err) {
    logger.error({ err, workOrderId: opts.nextOrder.id }, "notifyPreviousJobIncompleteIfNeeded failed");
  }
}

export async function notifyReadyForNextJobAfterComplete(opts: {
  completedWorkOrderId: number;
  engineerUserId: number;
  engineerName: string;
}): Promise<void> {
  try {
    const allowed = await getWorkReminderPrefForUser(opts.engineerUserId, "receiveReadyForNextJob");
    if (!allowed) return;

    const todayOrders = await loadTodayOrders();
    const completed = todayOrders.find(o => o.id === opts.completedWorkOrderId);
    if (!completed) return;

    let nextOrder: TodayOrder | null = null;
    for (const order of todayOrders) {
      if (order.apptMs <= completed.apptMs) continue;
      const ids = await resolveEngineerUserIdsForWorkOrder(order);
      if (!ids.includes(opts.engineerUserId)) continue;
      nextOrder = order;
      break;
    }
    if (!nextOrder) return;

    const customerName = nextOrder.linkedCustomerName ?? nextOrder.customerName ?? "—";
    const message = `上一案件已完成，可前往下一案件：${customerName}（${nextOrder.workOrderNumber ?? nextOrder.id}）`;
    const navUrl = nextOrder.installAddress
      ? tryToAbsoluteAppUrl(`/work-orders?open=${nextOrder.id}`)
      : null;
    const lineText = navUrl ? `${message}\n\n📍 一鍵導航：${navUrl}` : message;

    fireAndForgetNotification({
      recipientUserIds: [opts.engineerUserId],
      type: NOTIFICATION_TYPES.AI_WORK_REMINDER_READY_NEXT,
      title: "可前往下一案件",
      message,
      workOrderId: nextOrder.id,
      dedupeKey: `ai-wr-ready-next-${opts.engineerUserId}-${completed.id}-${nextOrder.id}`,
      lineMessage: lineText,
      channels: ["web_push", "line"],
    });
  } catch (err) {
    logger.error({ err, ...opts }, "notifyReadyForNextJobAfterComplete failed");
  }
}

export type { TodayOrder };
