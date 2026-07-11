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

function isStalePushError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const statusCode = (err as { statusCode?: number }).statusCode;
  return statusCode === 404 || statusCode === 410;
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

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        notificationId: payload.notificationId,
      }),
    );

    await db
      .update(userPushSubscriptionsTable)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(userPushSubscriptionsTable.id, subscription.id));

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err, endpoint: subscription.endpoint.slice(0, 48), statusCode: (err as { statusCode?: number }).statusCode },
      "Web Push delivery failed",
    );

    if (isStalePushError(err)) {
      await db
        .update(userPushSubscriptionsTable)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(userPushSubscriptionsTable.id, subscription.id));
      return { success: false, errorMessage, staleSubscription: true };
    }

    return { success: false, errorMessage };
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
