import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { authenticate } from "../lib/auth";
import {
  listInAppNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  upsertPushSubscription,
  deletePushSubscription,
} from "../lib/notifications/fieldProgressNotifyService";
import { getVapidPublicKey, isWebPushConfigured } from "../lib/notifications/webPushService";

const router: IRouter = Router();

router.use(authenticate);

router.get("/notifications/vapid-public-key", (_req, res): void => {
  const publicKey = getVapidPublicKey();
  res.json({ publicKey, configured: isWebPushConfigured() });
});

router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const count = await countUnreadNotifications(req.user!.id);
  res.json({ count });
});

router.get("/notifications/in-app", async (req, res): Promise<void> => {
  const rows = await listInAppNotifications(req.user!.id);
  res.json(
    rows.map(r => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      payload: r.payload,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.patch("/notifications/in-app/:id/read", async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const ok = await markNotificationRead(req.user!.id, id);
  if (!ok) {
    res.status(404).json({ error: "找不到通知" });
    return;
  }
  res.json({ ok: true });
});

router.patch("/notifications/in-app/read-all", async (req, res): Promise<void> => {
  await markAllNotificationsRead(req.user!.id);
  res.json({ ok: true });
});

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

router.post("/notifications/push/subscribe", async (req, res): Promise<void> => {
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await upsertPushSubscription(req.user!.id, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: req.headers["user-agent"],
  });
  res.status(201).json({ ok: true });
});

router.delete("/notifications/push/subscribe", async (req, res): Promise<void> => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }
  await deletePushSubscription(req.user!.id, endpoint);
  res.json({ ok: true });
});

export default router;
