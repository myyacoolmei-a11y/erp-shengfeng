import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  LineBindingCodeResponse,
  LineBindingOverviewAdminDto,
  LineBindingStatusResponse,
  NotificationSettingsDto,
  ReceivableReminderSummary,
  UserLineNotificationPrefsDto,
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

export async function generateLineBindingCode(): Promise<LineBindingCodeResponse> {
  return customFetch("/api/reminder-settings/line-binding/code", {
    method: "POST",
  });
}

export async function getLineBindingStatus(): Promise<LineBindingStatusResponse> {
  return customFetch("/api/reminder-settings/line-binding/status");
}

/** @deprecated Use generateLineBindingCode */
export async function generateReceivableLineBindingCode(): Promise<LineBindingCodeResponse> {
  return generateLineBindingCode();
}

/** @deprecated Use getLineBindingStatus */
export async function getReceivableLineBindingStatus(): Promise<LineBindingStatusResponse> {
  return getLineBindingStatus();
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

export async function getMyLineNotificationPrefs(): Promise<UserLineNotificationPrefsDto> {
  return customFetch("/api/reminder-settings/my-line-notifications");
}

export async function updateMyLineNotificationPrefs(data: Partial<Omit<UserLineNotificationPrefsDto, "lineLinked">>): Promise<UserLineNotificationPrefsDto> {
  return customFetch("/api/reminder-settings/my-line-notifications", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function listLineBindingOverview(): Promise<LineBindingOverviewAdminDto[]> {
  return customFetch("/api/reminder-settings/line-subscriptions");
}

/** @deprecated Use listLineBindingOverview */
export async function listLineSubscriptions(): Promise<LineBindingOverviewAdminDto[]> {
  return listLineBindingOverview();
}

export async function adminRegenerateLineBindingCode(userId: number): Promise<{
  userId: number;
  code: string;
  expiresAt: string;
  instruction: string;
}> {
  return customFetch(`/api/reminder-settings/line-subscriptions/${userId}/regenerate-code`, {
    method: "POST",
  });
}

export async function unbindLineSubscription(userId: number): Promise<{ ok: boolean }> {
  return customFetch(`/api/reminder-settings/line-subscriptions/${userId}`, {
    method: "DELETE",
  });
}

export type {
  LineBindingCodeResponse,
  LineBindingOverviewAdminDto,
  LineBindingStatusResponse,
  NotificationSettingsDto,
  ReceivableReminderSummary,
  UserLineNotificationPrefsDto,
};
