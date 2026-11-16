import { getLineChannelAccessToken, isLineMessagingConfigured } from "./lineConfig.ts";
import type { LineSubscriber } from "./lineSubscriptionService.ts";
import { getSubscriberForUser } from "./lineSubscriptionService.ts";
import { maskLineUserId } from "./lineUserBinding.ts";
import { pushLineMessageToRecipients } from "../reminders/scheduledNotificationRunner.ts";
import { logger } from "../logger.ts";

export const LINE_TEST_PUSH_MESSAGE = "✅ 晟風 AI 小秘書 LINE 推播測試成功";

export function formatLinePushError(raw: string): string {
  const text = raw.trim();
  if (!text) return "測試推播失敗";

  if (text.includes("LINE_CHANNEL_ACCESS_TOKEN") || text.includes("Token 無效")) {
    return "Token 無效：LINE Channel Access Token 未設定或無法載入";
  }
  if (text.includes("請先完成 LINE 綁定") || text.includes("找不到 LINE 綁定")) {
    return "找不到 LINE 綁定：請先完成 LINE 綁定";
  }
  if (text.includes("(401)") || text.includes("401")) {
    return "Token 無效：LINE API 拒絕請求（401）";
  }
  if (text.includes("Invalid user") || text.includes("invalid user") || text.includes("userId")) {
    return "LINE User ID 無效：請重新綁定 LINE";
  }
  if (text.includes("(400)") || text.includes("400")) {
    return `LINE API 拒絕請求：${text}`;
  }
  if (text.includes("(403)") || text.includes("403")) {
    return "LINE API 拒絕請求：權限不足（403）";
  }
  if (text.includes("LINE push failed")) {
    return `LINE API 拒絕請求：${text}`;
  }

  return text;
}

export function assertLineMessagingReady(): void {
  if (!isLineMessagingConfigured()) {
    throw new Error("Token 無效：請先在 Railway 設定 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_CHANNEL_SECRET");
  }
  if (!getLineChannelAccessToken()) {
    throw new Error("Token 無效：LINE Channel Access Token 未載入");
  }
}

function subscriberLabel(subscriber: Pick<LineSubscriber, "username" | "displayName">): string {
  return subscriber.username?.trim() || subscriber.displayName?.trim() || "unknown";
}

export async function sendLineTestPushToSubscribers(kind: string, subscribers: LineSubscriber[]) {
  assertLineMessagingReady();

  if (subscribers.length === 0) {
    throw new Error("找不到 LINE 綁定：尚無已綁定且啟用提醒的使用者");
  }

  logger.info(
    {
      kind,
      recipientCount: subscribers.length,
      recipients: subscribers.map(s => ({
        userId: s.userId,
        label: subscriberLabel(s),
        lineUserIdMasked: maskLineUserId(s.lineUserId),
      })),
      tokenLoaded: Boolean(getLineChannelAccessToken()),
    },
    "開始推播",
  );

  const result = await pushLineMessageToRecipients({
    kind,
    message: LINE_TEST_PUSH_MESSAGE,
    itemCount: 0,
    recipients: subscribers.map(s => ({
      lineUserId: s.lineUserId,
      userId: s.userId,
      displayName: subscriberLabel(s),
    })),
  });

  logger.info(
    {
      kind,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      errors: result.errors,
    },
    "全部完成",
  );

  if (result.sentCount === 0) {
    throw new Error(formatLinePushError(result.errors.join("；") || "測試推播失敗"));
  }

  return {
    sent: true,
    message: LINE_TEST_PUSH_MESSAGE,
    test: true,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    errors: result.errors.length > 0 ? result.errors : undefined,
  };
}

/** Single-user test push (morning/evening briefing buttons). */
export async function sendLineTestPushToUser(userId: number, kind: string) {
  const subscriber = await getSubscriberForUser(userId);
  if (!subscriber?.lineUserId?.trim()) {
    logger.warn({ userId, kind }, "LINE test push: binding not found");
    throw new Error("找不到 LINE 綁定：請先完成 LINE 綁定");
  }

  return sendLineTestPushToSubscribers(kind, [subscriber]);
}
