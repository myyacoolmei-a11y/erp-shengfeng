import { logger } from "../logger.ts";
import { parseReminderTime, taipeiNowHm, taipeiToday } from "./dateUtils.ts";
import { getNotificationSettings, runReceivableCollectionReminder } from "./reminderSettingsService.ts";
import { RECEIVABLE_COLLECTION_KIND } from "../../../shared/reminders/types.ts";

let schedulerStarted = false;
let running = false;

async function tickReceivableCollectionReminder() {
  if (running) return;

  try {
    const settings = await getNotificationSettings(RECEIVABLE_COLLECTION_KIND);
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

    running = true;
    logger.info({ reminderTime: settings.reminderTime }, "Receivable collection reminder scheduler tick");
    const result = await runReceivableCollectionReminder();
    logger.info({ result: result.skipped ? result.reason : "sent" }, "Receivable collection reminder finished");
  } catch (err) {
    logger.error({ err }, "Receivable collection reminder scheduler error");
  } finally {
    running = false;
  }
}

/** Shared in-process scheduler — future reminder kinds can register here. */
export function startReminderScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = 60_000;
  setInterval(() => {
    void tickReceivableCollectionReminder();
  }, intervalMs);

  logger.info({ intervalMs, timezone: "Asia/Taipei" }, "Reminder scheduler started");
}
