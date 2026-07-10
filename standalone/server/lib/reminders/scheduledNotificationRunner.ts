import { eq } from "drizzle-orm";
import { db, notificationLogsTable, notificationSettingsTable } from "@workspace/db";
import { logger } from "../logger.ts";
import { sendLinePushMessage } from "../line/lineMessaging.ts";
import { isLineMessagingConfigured } from "../line/lineConfig.ts";
import { getNotificationSettings } from "./reminderSettingsService.ts";
import { taipeiToday } from "./dateUtils.ts";

export interface LinePushRecipient {
  lineUserId: string;
  userId?: number;
  displayName?: string;
}

async function writeLog(opts: {
  kind: string;
  recipient: string;
  itemCount: number;
  success: boolean;
  errorMessage?: string;
  messagePreview?: string;
}) {
  await db.insert(notificationLogsTable).values({
    kind: opts.kind,
    recipient: opts.recipient,
    itemCount: opts.itemCount,
    success: opts.success,
    errorMessage: opts.errorMessage ?? null,
    messagePreview: opts.messagePreview?.slice(0, 2000) ?? null,
  });
}

export async function pushLineMessageToRecipients(opts: {
  kind: string;
  message: string;
  itemCount: number;
  recipients: LinePushRecipient[];
}): Promise<{ sentCount: number; failedCount: number; errors: string[] }> {
  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const recipient of opts.recipients) {
    try {
      await sendLinePushMessage({ userId: recipient.lineUserId, text: opts.message });
      sentCount += 1;
      await writeLog({
        kind: opts.kind,
        recipient: recipient.lineUserId,
        itemCount: opts.itemCount,
        success: true,
        messagePreview: opts.message,
      });
    } catch (err) {
      failedCount += 1;
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push(`${recipient.displayName ?? recipient.lineUserId}: ${errorMessage}`);
      await writeLog({
        kind: opts.kind,
        recipient: recipient.lineUserId,
        itemCount: opts.itemCount,
        success: false,
        errorMessage,
        messagePreview: opts.message,
      });
    }
  }

  return { sentCount, failedCount, errors };
}

export async function runScheduledLineNotification(opts: {
  kind: string;
  itemCount: number;
  force?: boolean;
  buildMessages: () => Promise<Array<{ recipient: LinePushRecipient; message: string; itemCount: number }>>;
}): Promise<{ skipped: boolean; sent?: boolean; reason?: string; error?: string; sentCount?: number }> {
  const settings = await getNotificationSettings(opts.kind);
  if (!settings) {
    return { skipped: true, reason: "settings_not_found" };
  }

  if (!settings.enabled && !opts.force) {
    return { skipped: true, reason: "disabled" };
  }

  const today = taipeiToday();
  if (!opts.force && settings.lastSentDate === today) {
    return { skipped: true, reason: "already_sent_today" };
  }

  if (!isLineMessagingConfigured()) {
    return { skipped: true, reason: "line_env_not_configured" };
  }

  const deliveries = await opts.buildMessages();
  if (deliveries.length === 0) {
    return { skipped: true, reason: "no_recipients" };
  }

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const delivery of deliveries) {
    const result = await pushLineMessageToRecipients({
      kind: opts.kind,
      message: delivery.message,
      itemCount: delivery.itemCount,
      recipients: [delivery.recipient],
    });
    sentCount += result.sentCount;
    failedCount += result.failedCount;
    errors.push(...result.errors);
  }

  if (sentCount > 0 && !opts.force) {
    await db
      .update(notificationSettingsTable)
      .set({ lastSentDate: today })
      .where(eq(notificationSettingsTable.kind, opts.kind));
  }

  logger.info({ kind: opts.kind, sentCount, failedCount }, "Scheduled LINE notification batch finished");

  if (sentCount === 0) {
    return { skipped: false, sent: false, error: errors.join("; ") || "推播失敗", sentCount: 0 };
  }

  return { skipped: false, sent: true, sentCount, error: failedCount > 0 ? errors.join("; ") : undefined };
}

export async function sendTestLineNotification(opts: {
  kind: string;
  message: string;
  itemCount: number;
  recipient: LinePushRecipient;
}) {
  if (!isLineMessagingConfigured()) {
    throw new Error("請先在 Railway 設定 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_CHANNEL_SECRET");
  }

  const result = await pushLineMessageToRecipients({
    kind: opts.kind,
    message: opts.message,
    itemCount: opts.itemCount,
    recipients: [opts.recipient],
  });

  if (result.sentCount === 0) {
    throw new Error(result.errors[0] ?? "測試推播失敗");
  }

  return { sent: true, message: opts.message, test: true };
}
