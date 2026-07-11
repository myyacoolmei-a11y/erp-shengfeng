import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, desc, and } from "drizzle-orm";
import { authenticate, effectiveRoles } from "../lib/auth";
import { db, workOrderReopenEventsTable, usersTable, userPushSubscriptionsTable, lineUserBindingsTable } from "@workspace/db";
import {
  listInAppNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  upsertPushSubscription,
  deletePushSubscription,
  listPushSubscriptionsForUser,
} from "../lib/notifications/fieldProgressNotifyService";
import {
  getUserNotificationPrefs,
  updateUserNotificationPrefs,
} from "../lib/notifications/notificationService";
import { getVapidPublicKey, isWebPushConfigured } from "../lib/notifications/webPushService";
import { sendTestWebPushForUser } from "../lib/notifications/webPushTestService";

const router: IRouter = Router();
const ADMIN_ROLES = ["super_admin", "owner", "admin"];

router.use(authenticate);

router.get("/notifications/vapid-public-key", (_req, res): void => {
  res.json({ publicKey: getVapidPublicKey(), configured: isWebPushConfigured() });
});

router.get("/notifications/prefs", async (req, res): Promise<void> => {
  const prefs = await getUserNotificationPrefs(req.user!.id);
  res.json({
    ...prefs,
    webPushConfigured: isWebPushConfigured(),
    pushPermission: null,
  });
});

const PrefsBody = z.object({
  notifyInApp: z.boolean().optional(),
  notifyWebPush: z.boolean().optional(),
  notifyLine: z.boolean().optional(),
});

router.patch("/notifications/prefs", async (req, res): Promise<void> => {
  const parsed = PrefsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await updateUserNotificationPrefs(req.user!.id, parsed.data);
  res.json(row);
});

router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  res.json({ count: await countUnreadNotifications(req.user!.id) });
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
  deviceName: z.string().optional(),
});

router.post("/notifications/push/subscribe", async (req, res): Promise<void> => {
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
    },
  });
});

router.get("/notifications/push/subscriptions", async (req, res): Promise<void> => {
  const rows = await listPushSubscriptionsForUser(req.user!.id);
  res.json({
    subscriptions: rows.map(r => ({
      id: r.id,
      endpoint: r.endpoint,
      deviceName: r.deviceName,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    })),
  });
});

/** Server-side Web Push test — does NOT create in-app notifications */
router.post("/notifications/push/test", async (req, res): Promise<void> => {
  if (!isWebPushConfigured()) {
    res.status(503).json({
      vapidConfigured: false,
      foundCount: 0,
      sentCount: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      overallSuccess: false,
      message: "伺服器 VAPID 金鑰未設定，無法發送 Web Push",
    });
    return;
  }

  const result = await sendTestWebPushForUser(req.user!.id);
  res.json(result);
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

router.get("/notifications/work-orders/:workOrderId/reopen-info", async (req, res): Promise<void> => {
  const workOrderId = parseInt(String(req.params.workOrderId), 10);
  if (isNaN(workOrderId)) {
    res.status(400).json({ error: "Invalid workOrderId" });
    return;
  }

  const [event] = await db
    .select({
      returnReason: workOrderReopenEventsTable.returnReason,
      returnNote: workOrderReopenEventsTable.returnNote,
      createdAt: workOrderReopenEventsTable.createdAt,
      reopenedByName: usersTable.displayName,
    })
    .from(workOrderReopenEventsTable)
    .leftJoin(usersTable, eq(workOrderReopenEventsTable.reopenedByUserId, usersTable.id))
    .where(eq(workOrderReopenEventsTable.workOrderId, workOrderId))
    .orderBy(desc(workOrderReopenEventsTable.createdAt))
    .limit(1);

  if (!event) {
    res.json({ latest: null });
    return;
  }

  res.json({
    latest: {
      returnReason: event.returnReason,
      returnNote: event.returnNote,
      createdAt: event.createdAt.toISOString(),
      reopenedByName: event.reopenedByName,
    },
  });
});

router.get("/notifications/admin/user-status", async (req, res): Promise<void> => {
  if (!effectiveRoles(req.user!).some(r => ADMIN_ROLES.includes(r))) {
    res.status(403).json({ error: "需要管理員權限" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
    })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  const result = [];
  for (const user of users) {
    const pushRows = await db
      .select({ id: userPushSubscriptionsTable.id })
      .from(userPushSubscriptionsTable)
      .where(
        and(
          eq(userPushSubscriptionsTable.userId, user.id),
          eq(userPushSubscriptionsTable.enabled, true),
        ),
      );
    const [line] = await db
      .select({ lineUserId: lineUserBindingsTable.lineUserId })
      .from(lineUserBindingsTable)
      .where(and(eq(lineUserBindingsTable.userId, user.id), eq(lineUserBindingsTable.enabled, true)));

    result.push({
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      webPushDeviceCount: pushRows.length,
      lineBound: !!line?.lineUserId,
    });
  }

  res.json(result);
});

export default router;
