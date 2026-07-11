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
import { sendWebPushNotification } from "./webPushService.ts";

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

/** Fire-and-forget: record event, in-app + Web Push to opted-in managers. Never throws. */
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
    const openUrl = `/work-orders?open=${order.id}`;

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

    const recipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isActive, true),
          eq(usersTable.receiveDispatchNotifications, true),
        ),
      );

    const title = `派工 ${actionLabel}`;
    const body = `${input.engineerName} · ${customerName} · ${woLabel} · ${timeLabel}`;
    const payload = { workOrderId: order.id, url: openUrl };

    for (const recipient of recipients) {
      if (recipient.id === input.engineerUserId) continue;

      await db.insert(inAppNotificationsTable).values({
        userId: recipient.id,
        kind: "field_progress",
        title,
        body,
        payload,
      });

      const subs = await db
        .select()
        .from(userPushSubscriptionsTable)
        .where(eq(userPushSubscriptionsTable.userId, recipient.id));

      for (const sub of subs) {
        void sendWebPushNotification(sub, { title, body, url: openUrl });
      }
    }

    logger.info({
      event: "field_progress_notify",
      workOrderId: input.workOrderId,
      action: input.action,
      recipientCount: recipients.length,
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

export async function upsertPushSubscription(
  userId: number,
  data: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
): Promise<void> {
  const [existing] = await db
    .select({ id: userPushSubscriptionsTable.id, userId: userPushSubscriptionsTable.userId })
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
