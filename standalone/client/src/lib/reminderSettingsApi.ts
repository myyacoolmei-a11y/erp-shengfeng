import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  NotificationSettingsDto,
  ReceivableReminderSummary,
} from "../../../shared/reminders/types.ts";

export async function getReceivableReminderSettings(): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/receivable-collection");
}

export async function updateReceivableReminderSettings(data: {
  enabled?: boolean;
  reminderTime?: string;
  lineChannelAccessToken?: string;
  lineUserId?: string;
  appBaseUrl?: string;
}): Promise<NotificationSettingsDto> {
  return customFetch("/api/reminder-settings/receivable-collection", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function previewReceivableReminder(): Promise<{
  summary: ReceivableReminderSummary;
  message: string;
  settings: NotificationSettingsDto;
}> {
  return customFetch("/api/reminder-settings/receivable-collection/preview");
}

export async function testReceivableReminderPush(): Promise<unknown> {
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

export type { NotificationSettingsDto, ReceivableReminderSummary };
