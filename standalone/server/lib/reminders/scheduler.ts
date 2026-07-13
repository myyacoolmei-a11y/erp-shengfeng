import { logger } from "../logger.ts";
import { parseReminderTime, taipeiNowHm, taipeiToday } from "./dateUtils.ts";
import { getNotificationSettings } from "./reminderSettingsService.ts";
import { runDailyMorningBriefing, runEveningReceivableReminder } from "./briefingReminderService.ts";
import { runReceivableCollectionReminder } from "./reminderSettingsService.ts";
import { runWorkOrderReminders } from "../notifications/workOrderReminderService.ts";
import { runAiWorkReminderScheduler } from "../notifications/aiWorkReminderScheduler.ts";
import {
  DAILY_MORNING_BRIEFING_KIND,
  EVENING_RECEIVABLE_REMINDER_KIND,
  RECEIVABLE_COLLECTION_KIND,
} from "../../../shared/reminders/types.ts";

let schedulerStarted = false;
const runningKinds = new Set<string>();

async function tickKind(kind: string, runner: () => Promise<unknown>) {
  if (runningKinds.has(kind)) return;

  try {
    const settings = await getNotificationSettings(kind);
    if (!settings?.enabled) return;

    const parsed = parseReminderTime(settings.reminderTime);
    if (!parsed) return;

    const nowHm = taipeiNowHm();
    const [hourStr, minuteStr] = nowHm.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (hour !== parsed.hour || minute !== parsed.minute) return;

    const today = taipeiToday();
    if (settings.lastSentDate === today) return;

    runningKinds.add(kind);
    logger.info({ kind, reminderTime: settings.reminderTime }, "Reminder scheduler tick");
    const result = await runner();
    logger.info({ kind, result }, "Reminder scheduler finished");
  } catch (err) {
    logger.error({ err, kind }, "Reminder scheduler error");
  } finally {
    runningKinds.delete(kind);
  }
}

async function tickReceivableCollectionReminder() {
  await tickKind(RECEIVABLE_COLLECTION_KIND, () => runReceivableCollectionReminder());
}

async function tickDailyMorningBriefing() {
  await tickKind(DAILY_MORNING_BRIEFING_KIND, () => runDailyMorningBriefing());
}

async function tickEveningReceivableReminder() {
  await tickKind(EVENING_RECEIVABLE_REMINDER_KIND, () => runEveningReceivableReminder());
}

/** Shared in-process scheduler for all LINE reminder kinds. */
export function startReminderScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = 60_000;
  setInterval(() => {
    void tickReceivableCollectionReminder();
    void tickDailyMorningBriefing();
    void tickEveningReceivableReminder();
    void runWorkOrderReminders().catch(err => logger.error({ err }, "work order reminders failed"));
    void runAiWorkReminderScheduler().catch(err => logger.error({ err }, "AI work reminder scheduler failed"));
  }, intervalMs);

  logger.info({ intervalMs, timezone: "Asia/Taipei" }, "Reminder scheduler started");
}
