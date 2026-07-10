import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  LineBindingCodeResponse,
  LineBindingStatusResponse,
  NotificationSettingsDto,
  ReceivableReminderSummary,
} from "../../../shared/reminders/types.ts";

export async function getReceivableReminderSettings(): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/receivable-collection");
}

export async function updateReceivableReminderSettings(data: {
  enabled?: boolean;
  reminderTime?: string;
  appBaseUrl?: string;
}): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/receivable-collection", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function generateReceivableLineBindingCode(): Promise<LineBindingCodeResponse> {
  return customFetch("/api/reminder-settings/receivable-collection/line-binding-code", {
    method: "POST",
  });
}

export async function getReceivableLineBindingStatus(): Promise<LineBindingStatusResponse> {
  return customFetch("/api/reminder-settings/receivable-collection/line-binding-status");
}

export async function getLinePublicConfig(): Promise<{ addFriendUrl: string | null }> {
  return customFetch("/api/line/public-config");
}

export async function previewReceivableReminder(): Promise<{
  summary: ReceivableReminderSummary;
  message: string;
  settings: NotificationSettingsDto;
}> {
  return customFetch("/api/reminder-settings/receivable-collection/preview");
}

export async function testReceivableReminderPush(): Promise<{
  sent?: boolean;
  test?: boolean;
  summary?: ReceivableReminderSummary;
  message?: string;
  error?: string;
}> {
  return customFetch("/api/reminder-settings/receivable-collection/test", {
    method: "POST",
  });
}

export interface NotificationLogItem {
  id: number;
  kind: string;
  sentAt: string;
  recipient: string | null;
  itemCount: number;
  success: boolean;
  errorMessage: string | null;
  messagePreview: string | null;
}

export async function listReceivableReminderLogs(): Promise<NotificationLogItem[]> {
  return customFetch("/api/reminder-settings/receivable-collection/logs");
}

export async function getDailyMorningBriefingSettings(): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/daily-morning-briefing");
}

export async function updateDailyMorningBriefingSettings(data: { enabled?: boolean }): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/daily-morning-briefing", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function previewDailyMorningBriefing(): Promise<{ message: string; itemCount: number }> {
  return customFetch("/api/reminder-settings/daily-morning-briefing/preview");
}

export async function testDailyMorningBriefingPush(): Promise<{ sent?: boolean; message?: string }> {
  return customFetch("/api/reminder-settings/daily-morning-briefing/test", { method: "POST" });
}

export async function getEveningReceivableReminderSettings(): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/evening-receivable-reminder");
}

export async function updateEveningReceivableReminderSettings(data: { enabled?: boolean }): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/evening-receivable-reminder", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function previewEveningReceivableReminder(): Promise<{ message: string; itemCount: number }> {
  return customFetch("/api/reminder-settings/evening-receivable-reminder/preview");
}

export async function testEveningReceivableReminderPush(): Promise<{ sent?: boolean; message?: string }> {
  return customFetch("/api/reminder-settings/evening-receivable-reminder/test", { method: "POST" });
}

export type {
  LineBindingCodeResponse,
  LineBindingStatusResponse,
  NotificationSettingsDto,
  ReceivableReminderSummary,
};
