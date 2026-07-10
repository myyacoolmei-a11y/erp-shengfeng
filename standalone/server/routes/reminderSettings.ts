import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import { parseReminderTime } from "../lib/reminders/dateUtils.ts";
import {
  getReceivableCollectionSettingsDto,
  updateReceivableCollectionSettings,
  previewReceivableCollectionReminder,
  sendReceivableCollectionTestMessage,
  listRecentNotificationLogs,
  prepareReceivableLineLink,
  generateReceivableLineBindingCode,
  getReceivableLineBindingStatus,
} from "../lib/reminders/reminderSettingsService.ts";
import {
  getDailyMorningBriefingSettingsDto,
  updateDailyMorningBriefingSettings,
  previewDailyMorningBriefing,
  getEveningReceivableReminderSettingsDto,
  updateEveningReceivableReminderSettings,
  previewEveningReceivableReminder,
  sendDailyMorningBriefingTest,
  sendEveningReceivableReminderTest,
} from "../lib/reminders/briefingSettingsService.ts";
import {
  DAILY_MORNING_BRIEFING_KIND,
  EVENING_RECEIVABLE_REMINDER_KIND,
  RECEIVABLE_COLLECTION_KIND,
} from "../../shared/reminders/types.ts";
import {
  getMyLineNotificationPrefsDto,
  updateMyLineNotificationPrefs,
  listLineBindingOverviewForAdmin,
  adminUnbindLineUser,
  adminRegenerateBindingCode,
} from "../lib/line/lineSubscriptionService.ts";
import {
  buildLineAddFriendUrl,
  isLineMessagingConfigured,
} from "../lib/line/lineConfig.ts";

const router: IRouter = Router();

const ADMIN_ROLES = ["super_admin", "owner", "admin"] as const;

function requireUser(req: Request, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ error: "請先登入" });
    return false;
  }
  return true;
}

const EnableSchema = z.object({
  enabled: z.boolean().optional(),
});

const LineNotificationPrefsSchema = z.object({
  receiveMorningBriefing: z.boolean().optional(),
  receiveEveningReminder: z.boolean().optional(),
  receivePendingDispatch: z.boolean().optional(),
  receiveQuoteFollowUp: z.boolean().optional(),
  receiveReceivableCollection: z.boolean().optional(),
});

router.post("/reminder-settings/line-binding/code", async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const result = await generateReceivableLineBindingCode(req.user!.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "無法產生綁定碼" });
  }
});

router.get("/reminder-settings/line-binding/status", async (req, res) => {
  if (!requireUser(req, res)) return;
  const status = await getReceivableLineBindingStatus(req.user!.id);
  res.json({
    ...status,
    hasLineEnvConfig: isLineMessagingConfigured(),
    addFriendUrl: buildLineAddFriendUrl(),
  });
});

router.get("/reminder-settings/my-line-notifications", async (req, res) => {
  if (!requireUser(req, res)) return;
  res.json(await getMyLineNotificationPrefsDto(req.user!.id));
});

router.patch("/reminder-settings/my-line-notifications", async (req, res) => {
  if (!requireUser(req, res)) return;
  const parsed = LineNotificationPrefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await updateMyLineNotificationPrefs(req.user!.id, parsed.data));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "更新失敗" });
  }
});

router.get("/reminder-settings/receivable-collection", requireRole(...ADMIN_ROLES), async (req, res) => {
  const settings = await getReceivableCollectionSettingsDto(req.user?.id);
  if (!settings) {
    res.status(404).json({ error: "找不到提醒設定" });
    return;
  }
  res.json(settings);
});

router.patch("/reminder-settings/receivable-collection", requireRole(...ADMIN_ROLES), async (req, res) => {
  const UpdateSchema = z.object({
    enabled: z.boolean().optional(),
    reminderTime: z.string().optional(),
    appBaseUrl: z.string().optional(),
  });
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.reminderTime && !parseReminderTime(parsed.data.reminderTime)) {
    res.status(400).json({ error: "提醒時間格式錯誤，請使用 HH:mm（例如 09:00）" });
    return;
  }

  try {
    const updated = await updateReceivableCollectionSettings(parsed.data, req.user?.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "更新失敗" });
  }
});

router.post("/reminder-settings/receivable-collection/line-binding-code", async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const result = await generateReceivableLineBindingCode(req.user!.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "無法產生綁定碼" });
  }
});

router.get("/reminder-settings/receivable-collection/line-binding-status", async (req, res) => {
  if (!requireUser(req, res)) return;
  const status = await getReceivableLineBindingStatus(req.user!.id);
  res.json(status);
});

router.post("/reminder-settings/receivable-collection/prepare-line-link", requireRole(...ADMIN_ROLES), async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  try {
    const result = await prepareReceivableLineLink(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "無法準備 LINE 連結" });
  }
});

router.get("/reminder-settings/receivable-collection/preview", requireRole(...ADMIN_ROLES), async (_req, res) => {
  try {
    const preview = await previewReceivableCollectionReminder();
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "預覽失敗" });
  }
});

router.post("/reminder-settings/receivable-collection/test", requireRole(...ADMIN_ROLES), async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  try {
    const result = await sendReceivableCollectionTestMessage(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "測試推播失敗" });
  }
});

router.get("/reminder-settings/receivable-collection/logs", requireRole(...ADMIN_ROLES), async (_req, res) => {
  const logs = await listRecentNotificationLogs(RECEIVABLE_COLLECTION_KIND, 30);
  res.json(
    logs.map(log => ({
      ...log,
      sentAt: log.sentAt instanceof Date ? log.sentAt.toISOString() : log.sentAt,
    })),
  );
});

router.get("/reminder-settings/daily-morning-briefing", requireRole(...ADMIN_ROLES), async (req, res) => {
  const settings = await getDailyMorningBriefingSettingsDto(req.user?.id);
  if (!settings) { res.status(404).json({ error: "找不到提醒設定" }); return; }
  res.json(settings);
});

router.patch("/reminder-settings/daily-morning-briefing", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = EnableSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    res.json(await updateDailyMorningBriefingSettings(parsed.data, req.user?.id));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "更新失敗" });
  }
});

router.get("/reminder-settings/daily-morning-briefing/preview", requireRole(...ADMIN_ROLES), async (_req, res) => {
  try {
    res.json(await previewDailyMorningBriefing());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "預覽失敗" });
  }
});

router.post("/reminder-settings/daily-morning-briefing/test", requireRole(...ADMIN_ROLES), async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  try {
    res.json(await sendDailyMorningBriefingTest(req.user.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "測試推播失敗" });
  }
});

router.get("/reminder-settings/evening-receivable-reminder", requireRole(...ADMIN_ROLES), async (req, res) => {
  const settings = await getEveningReceivableReminderSettingsDto(req.user?.id);
  if (!settings) { res.status(404).json({ error: "找不到提醒設定" }); return; }
  res.json(settings);
});

router.patch("/reminder-settings/evening-receivable-reminder", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = EnableSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    res.json(await updateEveningReceivableReminderSettings(parsed.data, req.user?.id));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "更新失敗" });
  }
});

router.get("/reminder-settings/evening-receivable-reminder/preview", requireRole(...ADMIN_ROLES), async (_req, res) => {
  try {
    res.json(await previewEveningReceivableReminder());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "預覽失敗" });
  }
});

router.post("/reminder-settings/evening-receivable-reminder/test", requireRole(...ADMIN_ROLES), async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  try {
    res.json(await sendEveningReceivableReminderTest(req.user.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "測試推播失敗" });
  }
});

router.get("/reminder-settings/line-subscriptions", requireRole(...ADMIN_ROLES), async (_req, res) => {
  res.json(await listLineBindingOverviewForAdmin());
});

router.post("/reminder-settings/line-subscriptions/:userId/regenerate-code", requireRole(...ADMIN_ROLES), async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    res.status(400).json({ error: "無效的使用者 ID" });
    return;
  }
  try {
    res.json(await adminRegenerateBindingCode(userId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "無法產生綁定碼" });
  }
});

router.delete("/reminder-settings/line-subscriptions/:userId", requireRole(...ADMIN_ROLES), async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    res.status(400).json({ error: "無效的使用者 ID" });
    return;
  }
  try {
    await adminUnbindLineUser(userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "解除綁定失敗" });
  }
});

export default router;
