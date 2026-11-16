import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type { CompanyAiWorkReminderSettings } from "../../../shared/aiWorkReminder.ts";

export async function getCompanyAiWorkReminderSettings(): Promise<CompanyAiWorkReminderSettings> {
  return customFetch("/api/ai-work-reminder-settings");
}

export async function updateCompanyAiWorkReminderSettings(
  data: CompanyAiWorkReminderSettings,
): Promise<CompanyAiWorkReminderSettings> {
  return customFetch("/api/ai-work-reminder-settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export interface AiWorkReminderPreviewItem {
  id: string;
  label: string;
  enabled: boolean;
  message: string;
  rendered: string;
}

export async function previewCompanyAiWorkReminderSettings(): Promise<{
  sampleContext: Record<string, string>;
  previews: AiWorkReminderPreviewItem[];
}> {
  return customFetch("/api/ai-work-reminder-settings/preview");
}
