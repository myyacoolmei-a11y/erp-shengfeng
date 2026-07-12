import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { authenticate } from "../lib/auth";
import {
  upsertPushSubscription,
  deletePushSubscription,
  listPushSubscriptionsForUser,
} from "../lib/notifications/fieldProgressNotifyService";
import { getVapidPublicKey, isWebPushConfigured } from "../lib/notifications/webPushService";
import { sendTestWebPushForUser } from "../lib/notifications/webPushTestService";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(authenticate);

router.get("/push/vapid-public-key", (_req, res): void => {
  res.json({ publicKey: getVapidPublicKey(), configured: isWebPushConfigured() });
});

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceName: z.string().optional(),
});

router.post("/push/subscribe", async (req, res): Promise<void> => {
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.id;
  const saved = await upsertPushSubscription(userId, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: req.headers["user-agent"],
    deviceName: parsed.data.deviceName,
  });

  const all = await listPushSubscriptionsForUser(userId);
  const verified = all.some(s => s.endpoint === parsed.data.endpoint && s.enabled);

  res.status(201).json({
    ok: true,
    verified,
    dbCount: all.filter(s => s.enabled).length,
    subscription: {
      id: saved.id,
      endpoint: saved.endpoint.slice(0, 48) + "…",
      deviceName: saved.deviceName,
      enabled: saved.enabled,
      userId: saved.userId,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
});

router.delete("/push/unsubscribe", async (req, res): Promise<void> => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }
  await deletePushSubscription(req.user!.id, endpoint);
  res.json({ ok: true });
});

/** Server-side Web Push test — does NOT create in-app or LINE notifications */
router.post("/push/test", async (req, res): Promise<void> => {
  const userId = req.user!.id;
  logger.info({ event: "push_test_request", userId, channel: "web_push" }, "Push test request received");

  if (!isWebPushConfigured()) {
    logger.warn({ userId }, "Push test rejected: VAPID not configured");
    res.status(503).json({
      vapidConfigured: false,
      foundCount: 0,
      sentCount: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      overallSuccess: false,
      message: "伺服器 VAPID 金鑰未設定，無法發送 Web Push",
      channel: "web_push",
    });
    return;
  }

  const result = await sendTestWebPushForUser(userId);
  logger.info({
    event: "push_test_complete",
    userId,
    foundCount: result.foundCount,
    successCount: result.successCount,
    failCount: result.failCount,
    overallSuccess: result.overallSuccess,
  }, "Push test completed");

  res.json({ ...result, channel: "web_push" });
});

export default router;
