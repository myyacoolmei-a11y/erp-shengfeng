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

export interface ChannelDeliverySummary {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface SendNotificationResult {
  recipientCount: number;
  deduped: boolean;
  inApp: ChannelDeliverySummary;
  webPush: ChannelDeliverySummary & { subscriptionCount: number };
  line: ChannelDeliverySummary;
}

function emptyChannelSummary(): ChannelDeliverySummary {
  return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
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
  await ensureUserNotificationPrefs(userId);

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

export async function sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
  const summary: SendNotificationResult = {
    recipientCount: 0,
    deduped: false,
    inApp: emptyChannelSummary(),
    webPush: { ...emptyChannelSummary(), subscriptionCount: 0 },
    line: emptyChannelSummary(),
  };

  const uniqueRecipients = [...new Set(input.recipientUserIds.filter(id => id > 0))];
  summary.recipientCount = uniqueRecipients.length;

  logger.info({
    event: "notification_dispatch_start",
    type: input.type,
    workOrderId: input.workOrderId,
    recipientCount: uniqueRecipients.length,
    recipientUserIds: uniqueRecipients,
    channels: input.channels ?? ["in_app", "web_push", "line"],
    dedupeKey: input.dedupeKey,
  }, "Notification dispatch started");

  if (uniqueRecipients.length === 0) {
    logger.warn({
      event: "notification_dispatch_skipped",
      type: input.type,
      workOrderId: input.workOrderId,
      reason: "no_recipients",
    }, "Notification dispatch skipped: no recipients");
    return summary;
  }

  if (input.dedupeKey) {
    const claimed = await claimDedupeKey(input.dedupeKey);
    if (!claimed) {
      summary.deduped = true;
      logger.info({ dedupeKey: input.dedupeKey, type: input.type }, "Notification deduped");
      return summary;
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

  for (const userId of uniqueRecipients) {
    const prefs = await getUserPrefs(userId);
    if (!prefs.active) {
      logger.info({ userId, type: input.type }, "Notification skipped: inactive user");
      continue;
    }

    if (input.requireDispatchPref && !prefs.receiveDispatchNotifications) {
      logger.info({ userId, type: input.type }, "Notification skipped: receiveDispatchNotifications disabled");
      continue;
    }

    if (channels.includes("in_app")) {
      if (!prefs.notifyInApp) {
        summary.inApp.skipped += 1;
        logger.info({ userId, type: input.type }, "In-app notification skipped: user pref disabled");
      } else {
        summary.inApp.attempted += 1;
        try {
          await db.insert(inAppNotificationsTable).values({
            userId,
            kind: input.type,
            title: input.title,
            body: input.message,
            payload,
          });
          summary.inApp.succeeded += 1;
          logger.info({ userId, type: input.type, channel: "in_app" }, "In-app notification created");
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
          summary.inApp.failed += 1;
          logger.error({ err, userId, type: input.type, channel: "in_app" }, "In-app notification failed");
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
    }

    if (channels.includes("web_push")) {
      if (!prefs.notifyWebPush) {
        summary.webPush.skipped += 1;
        logger.info({ userId, type: input.type }, "Web Push skipped: user pref disabled");
      } else {
        const subs = await db
          .select()
          .from(userPushSubscriptionsTable)
          .where(
            and(
              eq(userPushSubscriptionsTable.userId, userId),
              eq(userPushSubscriptionsTable.enabled, true),
            ),
          );

        summary.webPush.subscriptionCount += subs.length;
        logger.info({
          userId,
          type: input.type,
          channel: "web_push",
          subscriptionCount: subs.length,
        }, "Web Push subscriptions loaded");

        if (subs.length === 0) {
          summary.webPush.skipped += 1;
          logger.warn({ userId, type: input.type }, "Web Push skipped: no active subscriptions");
        }

        const pushTitle = input.pushTitle ?? input.title;
        const pushBody = input.pushBody ?? input.message;

        for (const sub of subs) {
          summary.webPush.attempted += 1;
          const result = await sendWebPushToSubscription(sub, {
            title: pushTitle,
            body: pushBody,
            url: absolutePushUrl,
            notificationId: input.dedupeKey,
          });

          if (result.success) {
            summary.webPush.succeeded += 1;
            logger.info({
              userId,
              subscriptionId: sub.id,
              type: input.type,
              channel: "web_push",
              statusCode: result.statusCode,
            }, "Web Push sent successfully");
          } else {
            summary.webPush.failed += 1;
            logger.warn({
              userId,
              subscriptionId: sub.id,
              type: input.type,
              channel: "web_push",
              statusCode: result.statusCode,
              errorMessage: result.errorMessage,
            }, "Web Push delivery failed");
          }

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
    }

    if (channels.includes("line")) {
      if (!prefs.notifyLine) {
        summary.line.skipped += 1;
        logger.info({ userId, type: input.type }, "LINE notification skipped: user pref disabled");
      } else if (!prefs.lineUserId) {
        summary.line.skipped += 1;
        logger.info({ userId, type: input.type }, "LINE notification skipped: no LINE binding");
      } else {
        summary.line.attempted += 1;
        try {
          await sendLineWorkOrderNotification({
            lineUserId: prefs.lineUserId,
            text: input.lineMessage ?? `${input.title}\n\n${input.message}`,
            workOrderId: input.workOrderId,
          });
          summary.line.succeeded += 1;
          logger.info({
            userId,
            lineUserId: prefs.lineUserId.slice(0, 8),
            type: input.type,
            channel: "line",
          }, "LINE notification sent successfully");
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
          summary.line.failed += 1;
          logger.warn({ err, userId, type: input.type, channel: "line" }, "LINE notification failed");
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

  logger.info({
    event: "notification_dispatch_complete",
    type: input.type,
    workOrderId: input.workOrderId,
    recipientCount: uniqueRecipients.length,
    dedupeKey: input.dedupeKey,
    inApp: summary.inApp,
    webPush: summary.webPush,
    line: summary.line,
  }, "Notification dispatch complete");

  return summary;
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
