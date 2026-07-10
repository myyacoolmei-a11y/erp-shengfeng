import { eq } from "drizzle-orm";
import { db, notificationLogsTable, notificationSettingsTable } from "@workspace/db";
import { logger } from "../logger.ts";
import { sendLinePushMessage } from "../line/lineMessaging.ts";
import { getLineChannelAccessToken, isLineMessagingConfigured } from "../line/lineConfig.ts";
import { RECEIVABLE_COLLECTION_KIND } from "../../../shared/reminders/types.ts";
import { getNotificationSettings } from "./reminderSettingsService.ts";
import { taipeiToday } from "./dateUtils.ts";

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

export async function resolveSharedLineRecipient(): Promise<string> {
  const settings = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  const userId = settings?.lineUserId?.trim();
  if (!userId) {
    throw new Error("尚未連結 LINE，請在「AI 收款秘書」按「連結我的 LINE」完成綁定");
  }
  if (!getLineChannelAccessToken()) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN 未設定");
  }
  return userId;
}

export async function runScheduledLineNotification(opts: {
  kind: string;
  message: string;
  itemCount: number;
  force?: boolean;
}): Promise<{ skipped: boolean; sent?: boolean; reason?: string; error?: string }> {
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

  let userId: string;
  try {
    userId = await resolveSharedLineRecipient();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { skipped: true, reason: "line_not_linked", error: message };
  }

  try {
    await sendLinePushMessage({ userId, text: opts.message });

    if (!opts.force) {
      await db
        .update(notificationSettingsTable)
        .set({ lastSentDate: today })
        .where(eq(notificationSettingsTable.kind, opts.kind));
    }

    await writeLog({
      kind: opts.kind,
      recipient: userId,
      itemCount: opts.itemCount,
      success: true,
      messagePreview: opts.message,
    });

    logger.info({ kind: opts.kind, itemCount: opts.itemCount }, "Scheduled LINE notification sent");
    return { skipped: false, sent: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err: errorMessage, kind: opts.kind }, "Scheduled LINE notification failed");

    await writeLog({
      kind: opts.kind,
      recipient: userId,
      itemCount: opts.itemCount,
      success: false,
      errorMessage,
      messagePreview: opts.message,
    });

    return { skipped: false, sent: false, error: errorMessage };
  }
}

export async function sendTestLineNotification(opts: {
  kind: string;
  message: string;
  itemCount: number;
}) {
  if (!isLineMessagingConfigured()) {
    throw new Error("請先在 Railway 設定 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_CHANNEL_SECRET");
  }

  const userId = await resolveSharedLineRecipient();

  try {
    await sendLinePushMessage({ userId, text: opts.message });
    await writeLog({
      kind: opts.kind,
      recipient: userId,
      itemCount: opts.itemCount,
      success: true,
      messagePreview: opts.message,
    });
    return { sent: true, message: opts.message, test: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await writeLog({
      kind: opts.kind,
      recipient: userId,
      itemCount: opts.itemCount,
      success: false,
      errorMessage,
      messagePreview: opts.message,
    });
    throw new Error(errorMessage);
  }
}
