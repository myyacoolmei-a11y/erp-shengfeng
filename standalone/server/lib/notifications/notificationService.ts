import { eq, and } from "drizzle-orm";
import {
  db,
  usersTable,
  userNotificationPrefsTable,
  lineUserBindingsTable,
  userPushSubscriptionsTable,
  inAppNotificationsTable,
  notificationDeliveryLogsTable,
  notificationDedupTable,
} from "@workspace/db";
import type { NotificationChannel } from "../../../shared/notifications/types.ts";
import { logger } from "../logger.ts";
import { absoluteWorkOrderViewUrl, toAbsoluteAppUrl } from "../appUrl.ts";
import { sendWebPushToSubscription } from "./webPushService.ts";
import { sendLineWorkOrderNotification } from "./lineNotificationService.ts";

export interface SendNotificationInput {
  recipientUserIds: number[];
  type: string;
  title: string;
  message: string;
  workOrderId?: number;
  channels?: NotificationChannel[];
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  /** LINE-specific formatted body (supports emoji / multiline) */
  lineMessage?: string;
  /** Override push title/body; defaults to title/message */
  pushTitle?: string;
  pushBody?: string;
  /** If true, also honor users.receive_dispatch_notifications for in_app/web_push */
  requireDispatchPref?: boolean;
}

async function claimDedupeKey(dedupeKey: string): Promise<boolean> {
  try {
    await db.insert(notificationDedupTable).values({ dedupeKey });
    return true;
  } catch {
    return false;
  }
}

async function getUserPrefs(userId: number) {
  const [prefs] = await db
    .select()
    .from(userNotificationPrefsTable)
    .where(eq(userNotificationPrefsTable.userId, userId));

  const [user] = await db
    .select({
      receiveDispatchNotifications: usersTable.receiveDispatchNotifications,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const [lineBinding] = await db
    .select()
    .from(lineUserBindingsTable)
    .where(and(eq(lineUserBindingsTable.userId, userId), eq(lineUserBindingsTable.enabled, true)));

  return {
    active: user?.isActive ?? false,
    receiveDispatchNotifications: user?.receiveDispatchNotifications ?? true,
    notifyInApp: prefs?.notifyInApp ?? true,
    notifyWebPush: prefs?.notifyWebPush ?? true,
    notifyLine: prefs?.notifyLine ?? true,
    lineUserId: lineBinding?.lineUserId ?? null,
  };
}

async function logDelivery(row: {
  userId: number;
  channel: NotificationChannel;
  notificationType: string;
  title: string;
  success: boolean;
  errorMessage?: string | null;
  workOrderId?: number;
  subscriptionId?: number;
  lineUserId?: string;
  dedupeKey?: string;
}) {
  await db.insert(notificationDeliveryLogsTable).values({
    userId: row.userId,
    channel: row.channel,
    notificationType: row.notificationType,
    title: row.title,
    success: row.success,
    errorMessage: row.errorMessage ?? null,
    workOrderId: row.workOrderId ?? null,
    subscriptionId: row.subscriptionId ?? null,
    lineUserId: row.lineUserId ?? null,
    dedupeKey: row.dedupeKey ?? null,
  });
}

export async function sendNotification(input: SendNotificationInput): Promise<void> {
  if (input.dedupeKey) {
    const claimed = await claimDedupeKey(input.dedupeKey);
    if (!claimed) {
      logger.debug({ dedupeKey: input.dedupeKey }, "notification deduped");
      return;
    }
  }

  const channels = input.channels ?? ["in_app", "web_push", "line"];
  const relativeOpenUrl = input.workOrderId ? `/work-orders?open=${input.workOrderId}` : "/";
  const absolutePushUrl = input.workOrderId
    ? absoluteWorkOrderViewUrl(input.workOrderId)
    : toAbsoluteAppUrl("/");
  const payload = {
    workOrderId: input.workOrderId,
    url: relativeOpenUrl,
    type: input.type,
    ...input.payload,
  };

  const uniqueRecipients = [...new Set(input.recipientUserIds.filter(id => id > 0))];
  if (uniqueRecipients.length === 0) return;

  for (const userId of uniqueRecipients) {
    const prefs = await getUserPrefs(userId);
    if (!prefs.active) continue;

    if (input.requireDispatchPref && !prefs.receiveDispatchNotifications) {
      continue;
    }

    if (channels.includes("in_app") && prefs.notifyInApp) {
      try {
        await db.insert(inAppNotificationsTable).values({
          userId,
          kind: input.type,
          title: input.title,
          body: input.message,
          payload,
        });
        await logDelivery({
          userId,
          channel: "in_app",
          notificationType: input.type,
          title: input.title,
          success: true,
          workOrderId: input.workOrderId,
          dedupeKey: input.dedupeKey,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, userId, type: input.type }, "in-app notification failed");
        await logDelivery({
          userId,
          channel: "in_app",
          notificationType: input.type,
          title: input.title,
          success: false,
          errorMessage: msg,
          workOrderId: input.workOrderId,
          dedupeKey: input.dedupeKey,
        });
      }
    }

    if (channels.includes("web_push") && prefs.notifyWebPush) {
      const subs = await db
        .select()
        .from(userPushSubscriptionsTable)
        .where(
          and(
            eq(userPushSubscriptionsTable.userId, userId),
            eq(userPushSubscriptionsTable.enabled, true),
          ),
        );

      const pushTitle = input.pushTitle ?? input.title;
      const pushBody = input.pushBody ?? input.message;

      for (const sub of subs) {
        const result = await sendWebPushToSubscription(sub, {
          title: pushTitle,
          body: pushBody,
          url: absolutePushUrl,
          notificationId: input.dedupeKey,
        });

        await logDelivery({
          userId,
          channel: "web_push",
          notificationType: input.type,
          title: pushTitle,
          success: result.success,
          errorMessage: result.errorMessage,
          workOrderId: input.workOrderId,
          subscriptionId: sub.id,
          dedupeKey: input.dedupeKey,
        });
      }
    }

    if (channels.includes("line") && prefs.notifyLine && prefs.lineUserId) {
      try {
        await sendLineWorkOrderNotification({
          lineUserId: prefs.lineUserId,
          text: input.lineMessage ?? `${input.title}\n\n${input.message}`,
          workOrderId: input.workOrderId,
        });
        await logDelivery({
          userId,
          channel: "line",
          notificationType: input.type,
          title: input.title,
          success: true,
          workOrderId: input.workOrderId,
          lineUserId: prefs.lineUserId,
          dedupeKey: input.dedupeKey,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err, userId, type: input.type }, "LINE notification failed");
        await logDelivery({
          userId,
          channel: "line",
          notificationType: input.type,
          title: input.title,
          success: false,
          errorMessage: msg,
          workOrderId: input.workOrderId,
          lineUserId: prefs.lineUserId,
          dedupeKey: input.dedupeKey,
        });
      }
    }
  }
}

/** Fire-and-forget — never blocks caller or throws. */
export function fireAndForgetNotification(input: SendNotificationInput): void {
  void sendNotification(input).catch(err => {
    logger.error({ err, type: input.type }, "sendNotification failed");
  });
}

export async function ensureUserNotificationPrefs(userId: number): Promise<void> {
  await db
    .insert(userNotificationPrefsTable)
    .values({ userId })
    .onConflictDoNothing();
}

export async function getUserNotificationPrefs(userId: number) {
  await ensureUserNotificationPrefs(userId);
  const [prefs] = await db
    .select()
    .from(userNotificationPrefsTable)
    .where(eq(userNotificationPrefsTable.userId, userId));

  const pushSubs = await db
    .select({
      id: userPushSubscriptionsTable.id,
      deviceName: userPushSubscriptionsTable.deviceName,
      enabled: userPushSubscriptionsTable.enabled,
      lastUsedAt: userPushSubscriptionsTable.lastUsedAt,
      createdAt: userPushSubscriptionsTable.createdAt,
    })
    .from(userPushSubscriptionsTable)
    .where(eq(userPushSubscriptionsTable.userId, userId));

  const [lineBinding] = await db
    .select()
    .from(lineUserBindingsTable)
    .where(eq(lineUserBindingsTable.userId, userId));

  return {
    notifyInApp: prefs?.notifyInApp ?? true,
    notifyWebPush: prefs?.notifyWebPush ?? true,
    notifyLine: prefs?.notifyLine ?? true,
    pushDevices: pushSubs,
    lineBound: !!lineBinding?.enabled,
    lineDisplayName: lineBinding?.displayName ?? null,
  };
}

export async function updateUserNotificationPrefs(
  userId: number,
  data: Partial<{ notifyInApp: boolean; notifyWebPush: boolean; notifyLine: boolean }>,
) {
  await ensureUserNotificationPrefs(userId);
  const [row] = await db
    .update(userNotificationPrefsTable)
    .set(data)
    .where(eq(userNotificationPrefsTable.userId, userId))
    .returning();
  return row;
}
