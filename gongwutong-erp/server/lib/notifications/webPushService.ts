import { eq } from "drizzle-orm";
import { db, userPushSubscriptionsTable } from "@workspace/db";
import { logger } from "../logger.ts";

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  notificationId?: string;
}

export interface WebPushResult {
  success: boolean;
  errorMessage?: string;
  statusCode?: number;
  staleSubscription?: boolean;
}

let configured = false;

function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = process.env["VAPID_PRIVATE_KEY"]?.trim();
  const subject = process.env["VAPID_SUBJECT"]?.trim() || "mailto:admin@shengfeng.local";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  return getVapidKeys()?.publicKey ?? null;
}

export function isWebPushConfigured(): boolean {
  return getVapidKeys() != null;
}

function extractPushError(err: unknown): { statusCode?: number; errorMessage: string } {
  if (!err || typeof err !== "object") {
    return { errorMessage: String(err) };
  }
  const e = err as { statusCode?: number; message?: string; body?: string };
  const statusCode = e.statusCode;
  const bodySnippet = typeof e.body === "string" ? e.body.slice(0, 500) : "";
  const errorMessage = [e.message, bodySnippet].filter(Boolean).join(" | ") || "Web Push delivery failed";
  return { statusCode, errorMessage };
}

function isStalePushError(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function isVapidMismatchError(statusCode?: number): boolean {
  return statusCode === 401 || statusCode === 403;
}

export async function sendWebPushToSubscription(
  subscription: {
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: WebPushPayload,
): Promise<WebPushResult> {
  const keys = getVapidKeys();
  if (!keys) {
    return { success: false, errorMessage: "VAPID keys not configured" };
  }

  try {
    const webpush = await import("web-push");
    if (!configured) {
      webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
      configured = true;
    }

    const payloadJson = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      notificationId: payload.notificationId,
    });

    logger.info(
      { subscriptionId: subscription.id, url: payload.url, endpoint: subscription.endpoint.slice(0, 48) },
      "Web Push sending",
    );

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payloadJson,
    );

    if (subscription.id > 0) {
      await db
        .update(userPushSubscriptionsTable)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(userPushSubscriptionsTable.id, subscription.id));
    }

    return { success: true, statusCode: 201 };
  } catch (err) {
    const { statusCode, errorMessage } = extractPushError(err);
    logger.warn(
      { err, endpoint: subscription.endpoint.slice(0, 48), statusCode },
      "Web Push delivery failed",
    );

    if (isStalePushError(statusCode) && subscription.id > 0) {
      await db.delete(userPushSubscriptionsTable).where(eq(userPushSubscriptionsTable.id, subscription.id));
      return { success: false, errorMessage, statusCode, staleSubscription: true };
    }

    return { success: false, errorMessage, statusCode };
  }
}

/** @deprecated Use sendWebPushToSubscription */
export async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string },
): Promise<boolean> {
  const result = await sendWebPushToSubscription({ ...subscription, id: 0 }, payload);
  return result.success;
}
