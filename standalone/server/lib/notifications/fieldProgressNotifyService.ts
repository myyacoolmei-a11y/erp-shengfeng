import { eq, and, isNull, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  workOrdersTable,
  customersTable,
  fieldProgressEventsTable,
  inAppNotificationsTable,
  userPushSubscriptionsTable,
} from "@workspace/db";
import type { FieldProgressAction } from "@workspace/db";
import { logger } from "../logger.ts";
import { notifyManagersFieldProgress } from "./workOrderNotificationHelpers.ts";

const ACTION_LABELS: Record<FieldProgressAction, string> = {
  depart: "已出發",
  arrive: "已到達",
  complete: "已完工",
  unable: "無法施工",
};

function formatTaipeiTime(date: Date): string {
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface FieldProgressNotifyInput {
  workOrderId: number;
  engineerUserId: number;
  engineerName: string;
  action: FieldProgressAction;
  actedAt: Date;
}

/** Fire-and-forget: record event + unified notifications. Never throws. */
export async function notifyFieldProgressEvent(input: FieldProgressNotifyInput): Promise<void> {
  try {
    const [order] = await db
      .select({
        id: workOrdersTable.id,
        customerId: workOrdersTable.customerId,
        workOrderNumber: workOrdersTable.workOrderNumber,
        customerName: customersTable.name,
      })
      .from(workOrdersTable)
      .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
      .where(eq(workOrdersTable.id, input.workOrderId));

    if (!order) {
      logger.warn({ workOrderId: input.workOrderId }, "notifyFieldProgressEvent: work order not found");
      return;
    }

    const actionLabel = ACTION_LABELS[input.action];
    const customerName = order.customerName ?? "（未知客戶）";
    const timeLabel = formatTaipeiTime(input.actedAt);
    const woLabel = order.workOrderNumber ?? `#${order.id}`;

    await db.insert(fieldProgressEventsTable).values({
      workOrderId: input.workOrderId,
      customerId: order.customerId,
      customerName,
      engineerUserId: input.engineerUserId,
      engineerName: input.engineerName,
      action: input.action,
      actionLabel,
      actedAt: input.actedAt,
    });

    const title = `派工 ${actionLabel}`;
    const message = `${input.engineerName} · ${customerName} · ${woLabel} · ${timeLabel}`;

    await notifyManagersFieldProgress({
      workOrderId: order.id,
      engineerUserId: input.engineerUserId,
      title,
      message,
      dedupeKey: `field-progress-${input.workOrderId}-${input.action}-${input.engineerUserId}-${input.actedAt.getTime()}`,
    });

    logger.info({
      event: "field_progress_notify",
      workOrderId: input.workOrderId,
      action: input.action,
    }, "Field progress notifications sent");
  } catch (err) {
    logger.error({ err, ...input }, "notifyFieldProgressEvent failed");
  }
}

export async function listInAppNotifications(userId: number, limit = 50) {
  return db
    .select()
    .from(inAppNotificationsTable)
    .where(eq(inAppNotificationsTable.userId, userId))
    .orderBy(desc(inAppNotificationsTable.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(userId: number): Promise<number> {
  const rows = await db
    .select({ id: inAppNotificationsTable.id })
    .from(inAppNotificationsTable)
    .where(
      and(
        eq(inAppNotificationsTable.userId, userId),
        isNull(inAppNotificationsTable.readAt),
      ),
    );
  return rows.length;
}

export async function markNotificationRead(userId: number, notificationId: number): Promise<boolean> {
  const [row] = await db
    .update(inAppNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(inAppNotificationsTable.id, notificationId),
        eq(inAppNotificationsTable.userId, userId),
      ),
    )
    .returning({ id: inAppNotificationsTable.id });
  return !!row;
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  await db
    .update(inAppNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(inAppNotificationsTable.userId, userId),
        isNull(inAppNotificationsTable.readAt),
      ),
    );
}

function inferDeviceName(userAgent?: string): string | null {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  return "瀏覽器";
}

export async function upsertPushSubscription(
  userId: number,
  data: { endpoint: string; p256dh: string; auth: string; userAgent?: string; deviceName?: string },
): Promise<void> {
  const now = new Date();
  const deviceName = data.deviceName?.trim() || inferDeviceName(data.userAgent) || null;

  const [existing] = await db
    .select({ id: userPushSubscriptionsTable.id })
    .from(userPushSubscriptionsTable)
    .where(eq(userPushSubscriptionsTable.endpoint, data.endpoint));

  if (existing) {
    await db
      .update(userPushSubscriptionsTable)
      .set({
        userId,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
        deviceName,
        enabled: true,
        updatedAt: now,
      })
      .where(eq(userPushSubscriptionsTable.id, existing.id));
    return;
  }

  await db.insert(userPushSubscriptionsTable).values({
    userId,
    endpoint: data.endpoint,
    p256dh: data.p256dh,
    auth: data.auth,
    userAgent: data.userAgent ?? null,
    deviceName,
    enabled: true,
    updatedAt: now,
  });
}

export async function deletePushSubscription(userId: number, endpoint: string): Promise<void> {
  await db
    .delete(userPushSubscriptionsTable)
    .where(
      and(
        eq(userPushSubscriptionsTable.userId, userId),
        eq(userPushSubscriptionsTable.endpoint, endpoint),
      ),
    );
}
