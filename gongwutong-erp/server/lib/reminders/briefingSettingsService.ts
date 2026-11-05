import { eq } from "drizzle-orm";
import { db, notificationSettingsTable } from "@workspace/db";
import {
  DAILY_MORNING_BRIEFING_KIND,
  EVENING_RECEIVABLE_REMINDER_KIND,
} from "../../../shared/reminders/types.ts";
import type { NotificationSettingsDto } from "../../../shared/reminders/types.ts";
import { toSettingsDto, getNotificationSettings } from "./reminderSettingsService.ts";
import {
  buildMorningBriefingPayload,
  buildEveningReminderPayload,
  runDailyMorningBriefing,
  runEveningReceivableReminder,
  sendDailyMorningBriefingTest,
  sendEveningReceivableReminderTest,
} from "./briefingReminderService.ts";

async function updateBriefingSettings(
  kind: string,
  input: { enabled?: boolean },
  erpUserId?: number,
): Promise<NotificationSettingsDto> {
  const existing = await getNotificationSettings(kind);
  if (!existing) {
    throw new Error("Reminder settings not initialized");
  }

  const data: Partial<typeof notificationSettingsTable.$inferInsert> = {};
  if (input.enabled != null) data.enabled = input.enabled;

  const [updated] = await db
    .update(notificationSettingsTable)
    .set(data)
    .where(eq(notificationSettingsTable.kind, kind))
    .returning();

  return toSettingsDto(updated, erpUserId);
}

export async function getDailyMorningBriefingSettingsDto(erpUserId?: number) {
  const row = await getNotificationSettings(DAILY_MORNING_BRIEFING_KIND);
  if (!row) return null;
  return toSettingsDto(row, erpUserId);
}

export async function updateDailyMorningBriefingSettings(
  input: { enabled?: boolean },
  erpUserId?: number,
) {
  return updateBriefingSettings(DAILY_MORNING_BRIEFING_KIND, input, erpUserId);
}

export async function previewDailyMorningBriefing() {
  const settings = await getNotificationSettings(DAILY_MORNING_BRIEFING_KIND);
  if (!settings) throw new Error("Reminder settings not initialized");
  const payload = await buildMorningBriefingPayload();
  return { ...payload, settings: await toSettingsDto(settings) };
}

export async function getEveningReceivableReminderSettingsDto(erpUserId?: number) {
  const row = await getNotificationSettings(EVENING_RECEIVABLE_REMINDER_KIND);
  if (!row) return null;
  return toSettingsDto(row, erpUserId);
}

export async function updateEveningReceivableReminderSettings(
  input: { enabled?: boolean },
  erpUserId?: number,
) {
  return updateBriefingSettings(EVENING_RECEIVABLE_REMINDER_KIND, input, erpUserId);
}

export async function previewEveningReceivableReminder() {
  const settings = await getNotificationSettings(EVENING_RECEIVABLE_REMINDER_KIND);
  if (!settings) throw new Error("Reminder settings not initialized");
  const payload = await buildEveningReminderPayload();
  return { ...payload, settings: await toSettingsDto(settings) };
}

export {
  runDailyMorningBriefing,
  runEveningReceivableReminder,
  sendDailyMorningBriefingTest,
  sendEveningReceivableReminderTest,
};
