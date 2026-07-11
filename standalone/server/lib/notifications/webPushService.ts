import { logger } from "../logger.ts";

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

export async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string },
): Promise<boolean> {
  const keys = getVapidKeys();
  if (!keys) {
    logger.debug("Web Push skipped: VAPID keys not configured");
    return false;
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
      JSON.stringify(payload),
    );
    return true;
  } catch (err) {
    logger.warn({ err, endpoint: subscription.endpoint.slice(0, 48) }, "Web Push delivery failed");
    return false;
  }
}
