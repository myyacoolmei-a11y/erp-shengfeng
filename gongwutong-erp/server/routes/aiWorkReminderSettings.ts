import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import {
  getCompanyAiWorkReminderSettings,
  updateCompanyAiWorkReminderSettings,
} from "../lib/aiWorkReminder/companySettingsService.ts";
import {
  AI_REMINDER_PREVIEW_SAMPLE,
  WORK_REMINDER_SCENARIOS,
  renderAiReminderMessage,
  parseCompanyAiWorkReminderSettings,
} from "../../shared/aiWorkReminder.ts";

const router: IRouter = Router();

const ADMIN_ROLES = ["super_admin", "owner", "admin"] as const;
const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant", "engineer", "technician"] as const;

const ScenarioSettingSchema = z.object({
  enabled: z.boolean(),
  message: z.string(),
});

const UpdateBodySchema = z.object({
  scenarios: z.record(ScenarioSettingSchema),
});

router.get("/ai-work-reminder-settings", requireRole(...READ_ROLES), async (_req, res) => {
  const settings = await getCompanyAiWorkReminderSettings();
  res.json(settings);
});

router.patch("/ai-work-reminder-settings", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = UpdateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "設定格式不正確" });
    return;
  }
  const normalized = parseCompanyAiWorkReminderSettings(parsed.data);
  const saved = await updateCompanyAiWorkReminderSettings(normalized);
  res.json(saved);
});

router.get("/ai-work-reminder-settings/preview", requireRole(...READ_ROLES), async (_req, res) => {
  const settings = await getCompanyAiWorkReminderSettings();
  const previews = WORK_REMINDER_SCENARIOS.map(scenario => ({
    id: scenario.id,
    label: scenario.label,
    enabled: settings.scenarios[scenario.id]?.enabled ?? true,
    message: settings.scenarios[scenario.id]?.message ?? scenario.defaultMessage,
    rendered: renderAiReminderMessage(
      settings.scenarios[scenario.id]?.message ?? scenario.defaultMessage,
      { ...AI_REMINDER_PREVIEW_SAMPLE, remainingTime: scenario.defaultRemainingTime },
    ),
  }));
  res.json({ sampleContext: AI_REMINDER_PREVIEW_SAMPLE, previews });
});

export default router;
