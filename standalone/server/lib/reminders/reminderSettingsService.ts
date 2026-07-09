import { eq, desc } from "drizzle-orm";
import {
  db,
  notificationSettingsTable,
  notificationLogsTable,
} from "@workspace/db";
import { RECEIVABLE_COLLECTION_KIND } from "../../../shared/reminders/types.ts";
import type { NotificationSettingsDto } from "../../../shared/reminders/types.ts";
import { logger } from "../logger.ts";
import { fetchReceivableCollectionReminders } from "./receivableCollectionService.ts";
import { buildReceivableCollectionMessage } from "./receivableCollectionMessage.ts";
import { sendLinePushMessage } from "./lineMessaging.ts";
import { taipeiToday } from "./dateUtils.ts";

function maskToken(token: string | null | undefined): string {
  if (!token) return "";
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function resolveAppBaseUrl(settings: { appBaseUrl: string | null }): string {
  return (settings.appBaseUrl ?? process.env.APP_BASE_URL ?? "").trim();
}

export function toSettingsDto(row: typeof notificationSettingsTable.$inferSelect): NotificationSettingsDto {
  return {
    kind: row.kind,
    enabled: row.enabled,
    reminderTime: row.reminderTime,
    lineChannelAccessToken: maskToken(row.lineChannelAccessToken),
    lineUserId: row.lineUserId ?? "",
    appBaseUrl: row.appBaseUrl ?? "",
    hasLineToken: Boolean(row.lineChannelAccessToken?.trim()),
    lastSentDate: row.lastSentDate ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

export async function getNotificationSettings(kind: string) {
  const [row] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.kind, kind));
  return row ?? null;
}

export async function getReceivableCollectionSettingsDto() {
  const row = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  if (!row) return null;
  return toSettingsDto(row);
}

export async function updateReceivableCollectionSettings(input: {
  enabled?: boolean;
  reminderTime?: string;
  lineChannelAccessToken?: string;
  lineUserId?: string;
  appBaseUrl?: string;
}) {
  const existing = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  if (!existing) {
    throw new Error("Reminder settings not initialized");
  }

  const data: Partial<typeof notificationSettingsTable.$inferInsert> = {};
  if (input.enabled != null) data.enabled = input.enabled;
  if (input.reminderTime != null) data.reminderTime = input.reminderTime;
  if (input.lineUserId != null) data.lineUserId = input.lineUserId || null;
  if (input.appBaseUrl != null) data.appBaseUrl = input.appBaseUrl || null;

  if (input.lineChannelAccessToken != null && input.lineChannelAccessToken.trim()) {
    data.lineChannelAccessToken = input.lineChannelAccessToken.trim();
  }

  const [updated] = await db
    .update(notificationSettingsTable)
    .set(data)
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND))
    .returning();

  return toSettingsDto(updated);
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

export async function previewReceivableCollectionReminder() {
  const settings = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  if (!settings) throw new Error("Reminder settings not initialized");

  const appBaseUrl = resolveAppBaseUrl(settings);
  const summary = await fetchReceivableCollectionReminders(appBaseUrl);
  const message =
    summary.total > 0
      ? buildReceivableCollectionMessage(summary, appBaseUrl)
      : "";

  return { summary, message, settings: toSettingsDto(settings) };
}

export async function runReceivableCollectionReminder(opts?: { force?: boolean }) {
  const settings = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  if (!settings) {
    return { skipped: true, reason: "settings_not_found" as const };
  }

  if (!settings.enabled && !opts?.force) {
    return { skipped: true, reason: "disabled" as const };
  }

  const today = taipeiToday();
  if (!opts?.force && settings.lastSentDate === today) {
    return { skipped: true, reason: "already_sent_today" as const };
  }

  const token = settings.lineChannelAccessToken?.trim();
  const userId = settings.lineUserId?.trim();
  if (!token || !userId) {
    return { skipped: true, reason: "line_not_configured" as const };
  }

  const appBaseUrl = resolveAppBaseUrl(settings);
  const summary = await fetchReceivableCollectionReminders(appBaseUrl);

  if (summary.total === 0) {
    logger.info("Receivable collection reminder: no items, skip LINE push");
    return { skipped: true, reason: "no_items" as const, summary };
  }

  const message = buildReceivableCollectionMessage(summary, appBaseUrl);

  try {
    await sendLinePushMessage({ channelAccessToken: token, userId, text: message });

    if (!opts?.force) {
      await db
        .update(notificationSettingsTable)
        .set({ lastSentDate: today })
        .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));
    }

    await writeLog({
      kind: RECEIVABLE_COLLECTION_KIND,
      recipient: userId,
      itemCount: summary.total,
      success: true,
      messagePreview: message,
    });

    return { skipped: false, sent: true, summary, message };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err: errorMessage }, "Receivable collection reminder failed");

    await writeLog({
      kind: RECEIVABLE_COLLECTION_KIND,
      recipient: userId,
      itemCount: summary.total,
      success: false,
      errorMessage,
      messagePreview: message,
    });

    return { skipped: false, sent: false, error: errorMessage, summary };
  }
}

export async function sendReceivableCollectionTestMessage() {
  return runReceivableCollectionReminder({ force: true });
}

export async function listRecentNotificationLogs(kind: string, limit = 20) {
  return db
    .select()
    .from(notificationLogsTable)
    .where(eq(notificationLogsTable.kind, kind))
    .orderBy(desc(notificationLogsTable.sentAt))
    .limit(limit);
}
