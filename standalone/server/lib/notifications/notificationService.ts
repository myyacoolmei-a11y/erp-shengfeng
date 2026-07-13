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
import { tryToAbsoluteAppUrl } from "../appUrl.ts";
import { sendWebPushToSubscription, isWebPushConfigured } from "./webPushService.ts";
import { sendLineWorkOrderNotification } from "./lineNotificationService.ts";
import { isLineMessagingConfigured } from "../line/lineConfig.ts";
import { filterRecipientUserIdsByNotificationType } from "./notificationRecipientFilter.ts";
import {
  getNotificationCategory,
  defaultChannelsForCategory,
  workReminderPrefKeyForNotificationType,
} from "../../../shared/notificationRolePermissions.ts";
import { getWorkReminderPrefForUser } from "../line/lineSubscriptionService.ts";

export interface SendNotificationInput {
  recipientUserIds: number[];
  type: string;
  title: string;
  message: string;
  workOrderId?: number;
  channels?: NotificationChannel[];
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  lineMessage?: string;
  pushTitle?: string;
  pushBody?: string;
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
  try {
    await ensureUserNotificationPrefs(userId);
  } catch (err) {
    logger.warn({ err, userId }, "ensureUserNotificationPrefs failed — using defaults");
  }

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

async function safeLogDelivery(row: {
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
}): Promise<void> {
  try {
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
  } catch (err) {
    logger.warn({ err, userId: row.userId, channel: row.channel }, "notification delivery log write failed");
  }
}

function resolvePushUrl(workOrderId?: number): string | null {
  if (workOrderId) {
    return tryToAbsoluteAppUrl(`/work-orders?open=${workOrderId}`);
  }
  return tryToAbsoluteAppUrl("/");
}

/** Never throws — failures are logged and summarized. */
export async function sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
  const summary: SendNotificationResult = {
    recipientCount: 0,
    deduped: false,
    inApp: emptyChannelSummary(),
    webPush: { ...emptyChannelSummary(), subscriptionCount: 0 },
    line: emptyChannelSummary(),
  };

  try {
    const uniqueRecipients = [...new Set(input.recipientUserIds.filter(id => id > 0))];
    const roleFilteredRecipients = await filterRecipientUserIdsByNotificationType(
      uniqueRecipients,
      input.type,
    );
    summary.recipientCount = roleFilteredRecipients.length;

    logger.info({
      event: "notification_dispatch_start",
      type: input.type,
      workOrderId: input.workOrderId,
      recipientCount: roleFilteredRecipients.length,
      skippedByRole: uniqueRecipients.length - roleFilteredRecipients.length,
      channels: input.channels ?? defaultChannelsForCategory(getNotificationCategory(input.type)),
    }, "Notification dispatch started");

    if (roleFilteredRecipients.length === 0) {
      logger.warn({ type: input.type, workOrderId: input.workOrderId }, "Notification skipped: no recipients after role filter");
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

    const category = getNotificationCategory(input.type);
    const channels = input.channels ?? defaultChannelsForCategory(category);
    const relativeOpenUrl = input.workOrderId ? `/work-orders?open=${input.workOrderId}` : "/";
    const payload = {
      workOrderId: input.workOrderId,
      url: relativeOpenUrl,
      type: input.type,
      ...input.payload,
    };

    for (const userId of roleFilteredRecipients) {
      const prefKey = workReminderPrefKeyForNotificationType(input.type);
      if (prefKey) {
        const allowed = await getWorkReminderPrefForUser(userId, prefKey);
        if (!allowed) {
          summary.webPush.skipped += 1;
          summary.line.skipped += 1;
          continue;
        }
      }

      let prefs;
      try {
        prefs = await getUserPrefs(userId);
      } catch (err) {
        logger.error({ err, userId, type: input.type }, "getUserPrefs failed — skipping user");
        continue;
      }

      if (!prefs.active) continue;
      if (input.requireDispatchPref && !prefs.receiveDispatchNotifications) continue;

      // 1) In-app — always attempt first
      if (channels.includes("in_app")) {
        if (!prefs.notifyInApp) {
          summary.inApp.skipped += 1;
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
            await safeLogDelivery({
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
            logger.error({ err, userId, type: input.type }, "In-app notification failed");
            await safeLogDelivery({
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

      // 2) Web Push — isolated; missing VAPID or APP_URL must not affect in-app
      if (channels.includes("web_push")) {
        if (!prefs.notifyWebPush) {
          summary.webPush.skipped += 1;
        } else if (!isWebPushConfigured()) {
          summary.webPush.skipped += 1;
          logger.info({ userId, type: input.type }, "Web Push skipped: VAPID not configured");
        } else {
          const pushUrl = resolvePushUrl(input.workOrderId);
          if (!pushUrl) {
            summary.webPush.skipped += 1;
            logger.warn({ userId, type: input.type }, "Web Push skipped: APP_URL not configured");
          } else {
            try {
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
              if (subs.length === 0) {
                summary.webPush.skipped += 1;
              }

              const pushTitle = input.pushTitle ?? input.title;
              const pushBody = input.pushBody ?? input.message;

              for (const sub of subs) {
                summary.webPush.attempted += 1;
                try {
                  const result = await sendWebPushToSubscription(sub, {
                    title: pushTitle,
                    body: pushBody,
                    url: pushUrl,
                    notificationId: input.dedupeKey,
                  });
                  if (result.success) {
                    summary.webPush.succeeded += 1;
                  } else {
                    summary.webPush.failed += 1;
                  }
                  await safeLogDelivery({
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
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  summary.webPush.failed += 1;
                  logger.warn({ err, userId, subscriptionId: sub.id }, "Web Push send threw");
                  await safeLogDelivery({
                    userId,
                    channel: "web_push",
                    notificationType: input.type,
                    title: pushTitle,
                    success: false,
                    errorMessage: msg,
                    workOrderId: input.workOrderId,
                    subscriptionId: sub.id,
                    dedupeKey: input.dedupeKey,
                  });
                }
              }
            } catch (err) {
              logger.warn({ err, userId, type: input.type }, "Web Push block failed");
            }
          }
        }
      }

      // 3) LINE — isolated
      if (channels.includes("line")) {
        if (!prefs.notifyLine) {
          summary.line.skipped += 1;
        } else if (!isLineMessagingConfigured()) {
          summary.line.skipped += 1;
          logger.info({ userId, type: input.type }, "LINE skipped: not configured");
        } else if (!prefs.lineUserId) {
          summary.line.skipped += 1;
        } else {
          summary.line.attempted += 1;
          try {
            await sendLineWorkOrderNotification({
              lineUserId: prefs.lineUserId,
              text: input.lineMessage ?? `${input.title}\n\n${input.message}`,
              workOrderId: input.workOrderId,
            });
            summary.line.succeeded += 1;
            await safeLogDelivery({
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
            logger.warn({ err, userId, type: input.type }, "LINE notification failed");
            await safeLogDelivery({
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
      inApp: summary.inApp,
      webPush: summary.webPush,
      line: summary.line,
    }, "Notification dispatch complete");
  } catch (err) {
    logger.error({ err, type: input.type, workOrderId: input.workOrderId }, "sendNotification unexpected error");
  }

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
  try {
    await ensureUserNotificationPrefs(userId);
  } catch (err) {
    logger.warn({ err, userId }, "ensureUserNotificationPrefs failed in getUserNotificationPrefs");
  }

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
