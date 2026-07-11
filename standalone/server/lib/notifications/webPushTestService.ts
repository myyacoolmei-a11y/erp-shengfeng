import { eq, and } from "drizzle-orm";
import { db, userPushSubscriptionsTable } from "@workspace/db";
import { logger } from "../logger.ts";
import { sendWebPushToSubscription } from "./webPushService.ts";

export interface WebPushTestDeliveryResult {
  subscriptionId: number;
  deviceName: string | null;
  endpointPreview: string;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  deleted: boolean;
}

export interface WebPushTestResult {
  vapidConfigured: boolean;
  foundCount: number;
  sentCount: number;
  successCount: number;
  failCount: number;
  results: WebPushTestDeliveryResult[];
  overallSuccess: boolean;
  message: string;
}

function maskEndpoint(endpoint: string): string {
  if (endpoint.length <= 48) return endpoint;
  return `${endpoint.slice(0, 32)}…${endpoint.slice(-12)}`;
}

/** Server-only test push via web-push — does NOT create in-app notifications. */
export async function sendTestWebPushForUser(userId: number): Promise<WebPushTestResult> {
  const subs = await db
    .select()
    .from(userPushSubscriptionsTable)
    .where(
      and(
        eq(userPushSubscriptionsTable.userId, userId),
        eq(userPushSubscriptionsTable.enabled, true),
      ),
    );

  if (subs.length === 0) {
    return {
      vapidConfigured: true,
      foundCount: 0,
      sentCount: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      overallSuccess: false,
      message: "此手機尚未完成推播訂閱",
    };
  }

  const testId = `test-${userId}-${Date.now()}`;
  const payload = {
    title: "測試推播",
    body: "若您在鎖定畫面看到此訊息，Web Push 已成功設定。",
    url: "/notification-settings",
    notificationId: testId,
  };

  const results: WebPushTestDeliveryResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const sub of subs) {
    const delivery = await sendWebPushToSubscription(sub, payload);
    const statusCode = delivery.statusCode;
    let deleted = false;

    if (delivery.staleSubscription) {
      await db.delete(userPushSubscriptionsTable).where(eq(userPushSubscriptionsTable.id, sub.id));
      deleted = true;
      logger.info({ subscriptionId: sub.id, statusCode }, "deleted stale push subscription");
    }

    if (delivery.success) {
      successCount += 1;
    } else {
      failCount += 1;
    }

    results.push({
      subscriptionId: sub.id,
      deviceName: sub.deviceName,
      endpointPreview: maskEndpoint(sub.endpoint),
      success: delivery.success,
      statusCode,
      errorMessage: delivery.errorMessage,
      deleted,
    });
  }

  const overallSuccess = successCount > 0;
  let message: string;
  if (overallSuccess) {
    message = `Web Push 發送成功（${successCount}/${subs.length} 筆）`;
  } else if (failCount > 0) {
    message = `Web Push 發送失敗（0/${subs.length} 筆成功）`;
  } else {
    message = "此手機尚未完成推播訂閱";
  }

  logger.info({
    userId,
    foundCount: subs.length,
    successCount,
    failCount,
    testId,
  }, "Web Push test completed");

  return {
    vapidConfigured: true,
    foundCount: subs.length,
    sentCount: subs.length,
    successCount,
    failCount,
    results,
    overallSuccess,
    message,
  };
}
