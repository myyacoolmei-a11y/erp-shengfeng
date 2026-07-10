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
import {
  buildLineAddFriendUrl,
  getLineChannelAccessToken,
  isLineMessagingConfigured,
  defaultLineWebhookUrl,
} from "../line/lineConfig.ts";
import {
  createLineBindingCode,
  getLineBindingInfoForUser,
  getLineBindingStatusForUser,
  maskLineUserId,
} from "../line/lineUserBinding.ts";
import { listSubscribersForReceivableCollection, getSubscriberForUser } from "../line/lineSubscriptionService.ts";
import { pushLineMessageToRecipients } from "./scheduledNotificationRunner.ts";
import { taipeiToday } from "./dateUtils.ts";

function resolveAppBaseUrl(settings: { appBaseUrl: string | null }): string {
  return (settings.appBaseUrl ?? process.env.APP_BASE_URL ?? "").trim();
}

export async function toSettingsDto(
  row: typeof notificationSettingsTable.$inferSelect,
  erpUserId?: number,
): Promise<NotificationSettingsDto> {
  const binding = erpUserId != null
    ? await getLineBindingInfoForUser(erpUserId)
    : { lineUserId: null, linkedUserId: null, linkedDisplayName: null, boundSubscriberCount: 0 };
  const pendingLineLink =
    erpUserId != null
      ? (await getLineBindingStatusForUser(erpUserId)).status === "pending"
      : false;

  return {
    kind: row.kind,
    enabled: row.enabled,
    reminderTime: row.reminderTime,
    appBaseUrl: row.appBaseUrl ?? "",
    lastSentDate: row.lastSentDate ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    hasLineEnvConfig: isLineMessagingConfigured(),
    lineWebhookUrl: defaultLineWebhookUrl(),
    lineLinked: Boolean(binding.lineUserId),
    lineUserIdMasked: binding.lineUserId ? maskLineUserId(binding.lineUserId) : "",
    linkedErpUserName: binding.linkedDisplayName,
    pendingLineLink,
    boundSubscriberCount: binding.boundSubscriberCount,
  };
}

export async function getNotificationSettings(kind: string) {
  const [row] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.kind, kind));
  return row ?? null;
}

export async function getReceivableCollectionSettingsDto(erpUserId?: number) {
  const row = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  if (!row) return null;
  return toSettingsDto(row, erpUserId);
}

export async function updateReceivableCollectionSettings(
  input: {
    enabled?: boolean;
    reminderTime?: string;
    appBaseUrl?: string;
  },
  erpUserId?: number,
) {
  const existing = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  if (!existing) {
    throw new Error("Reminder settings not initialized");
  }

  const data: Partial<typeof notificationSettingsTable.$inferInsert> = {};
  if (input.enabled != null) data.enabled = input.enabled;
  if (input.reminderTime != null) data.reminderTime = input.reminderTime;
  if (input.appBaseUrl != null) data.appBaseUrl = input.appBaseUrl || null;

  const [updated] = await db
    .update(notificationSettingsTable)
    .set(data)
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND))
    .returning();

  return toSettingsDto(updated, erpUserId);
}

export async function generateReceivableLineBindingCode(erpUserId: number) {
  if (!isLineMessagingConfigured()) {
    throw new Error("請先在 Railway 設定 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_CHANNEL_SECRET");
  }

  const addFriendUrl = buildLineAddFriendUrl();
  if (!addFriendUrl) {
    throw new Error("尚未設定 LINE 官方帳號 ID");
  }

  const { code, expiresAt } = await createLineBindingCode(erpUserId);
  const instruction = `請先加入「晟風小秘書」好友，然後在 LINE 對話輸入：綁定 ${code}`;

  return {
    code,
    expiresAt: expiresAt.toISOString(),
    addFriendUrl,
    instruction,
  };
}

export async function getReceivableLineBindingStatus(erpUserId: number) {
  return getLineBindingStatusForUser(erpUserId);
}

/** @deprecated Use generateReceivableLineBindingCode instead. */
export async function prepareReceivableLineLink(erpUserId: number) {
  const result = await generateReceivableLineBindingCode(erpUserId);
  return {
    pending: true,
    webhookUrl: defaultLineWebhookUrl(),
    instructions: result.instruction,
    ...result,
  };
}

async function sendCollectionMessageToSubscribers(opts: {
  message: string;
  summaryTotal: number;
  force?: boolean;
}) {
  const subscribers = await listSubscribersForReceivableCollection();
  if (subscribers.length === 0) {
    return { skipped: true, reason: "line_not_linked" as const, sentCount: 0 };
  }

  const result = await pushLineMessageToRecipients({
    kind: RECEIVABLE_COLLECTION_KIND,
    message: opts.message,
    itemCount: opts.summaryTotal,
    recipients: subscribers.map(s => ({
      lineUserId: s.lineUserId,
      userId: s.userId,
      displayName: s.displayName,
    })),
  });

  return { skipped: false, ...result };
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

  return { summary, message, settings: await toSettingsDto(settings) };
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

  if (!isLineMessagingConfigured()) {
    return { skipped: true, reason: "line_env_not_configured" as const };
  }

  const appBaseUrl = resolveAppBaseUrl(settings);
  const summary = await fetchReceivableCollectionReminders(appBaseUrl);

  if (summary.total === 0) {
    logger.info("Receivable collection reminder: no items, skip LINE push");
    return { skipped: true, reason: "no_items" as const, summary };
  }

  const message = buildReceivableCollectionMessage(summary, appBaseUrl);

  try {
    const pushResult = await sendCollectionMessageToSubscribers({
      message,
      summaryTotal: summary.total,
      force: opts?.force,
    });

    if (pushResult.skipped) {
      return { skipped: true, reason: "line_not_linked" as const, summary };
    }

    if (pushResult.sentCount === 0) {
      const errors = "errors" in pushResult ? pushResult.errors : [];
      return {
        skipped: false,
        sent: false,
        error: errors.join("; ") || "推播失敗",
        summary,
      };
    }

    if (!opts?.force) {
      await db
        .update(notificationSettingsTable)
        .set({ lastSentDate: today })
        .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));
    }

    return { skipped: false, sent: true, summary, message, sentCount: pushResult.sentCount };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err: errorMessage }, "Receivable collection reminder failed");
    return { skipped: false, sent: false, error: errorMessage, summary };
  }
}

/** Test push via LINE Messaging API — sends to current user's LINE if bound. */
export async function sendReceivableCollectionTestMessage(userId: number) {
  const settings = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
  if (!settings) {
    throw new Error("Reminder settings not initialized");
  }

  if (!isLineMessagingConfigured()) {
    throw new Error("請先在 Railway 設定 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_CHANNEL_SECRET");
  }

  const subscriber = await getSubscriberForUser(userId);
  if (!subscriber) {
    throw new Error("請先完成 LINE 綁定");
  }

  const appBaseUrl = resolveAppBaseUrl(settings);
  const summary = await fetchReceivableCollectionReminders(appBaseUrl);

  const message =
    summary.total > 0
      ? buildReceivableCollectionMessage(summary, appBaseUrl)
      : "💰【晟風 AI 收款秘書 — 測試】\n\nLINE 推播連線正常。\n目前沒有到期或未收的應收款。";

  const result = await pushLineMessageToRecipients({
    kind: RECEIVABLE_COLLECTION_KIND,
    message,
    itemCount: summary.total,
    recipients: [{
      lineUserId: subscriber.lineUserId,
      userId: subscriber.userId,
      displayName: subscriber.displayName,
    }],
  });

  if (result.sentCount === 0) {
    throw new Error(result.errors[0] ?? "測試推播失敗");
  }

  return { sent: true, summary, message, test: true };
}

export async function listRecentNotificationLogs(kind: string, limit = 20) {
  return db
    .select()
    .from(notificationLogsTable)
    .where(eq(notificationLogsTable.kind, kind))
    .orderBy(desc(notificationLogsTable.sentAt))
    .limit(limit);
}
