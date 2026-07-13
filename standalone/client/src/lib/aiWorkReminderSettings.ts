export const WORK_REMINDER_STORAGE_KEY = "erp-ai-work-reminder-settings-v1";

export type WorkReminderScenarioId =
  | "next_job_60"
  | "next_job_30"
  | "next_job_15"
  | "next_job_5"
  | "past_appointment"
  | "previous_job_incomplete";

export interface WorkReminderScenarioConfig {
  id: WorkReminderScenarioId;
  label: string;
  description: string;
  defaultMessage: string;
  enabled: boolean;
  message: string;
}

export interface WorkReminderSettings {
  scenarios: Record<WorkReminderScenarioId, { enabled: boolean; message: string }>;
}

export const WORK_REMINDER_SCENARIOS: Array<{
  id: WorkReminderScenarioId;
  label: string;
  description: string;
  defaultMessage: string;
}> = [
  {
    id: "next_job_60",
    label: "下一案件剩 1 小時",
    description: "預約施工時間前 60 分鐘提醒",
    defaultMessage: "提醒：下一案件將於 1 小時後開始，請預留前往時間。",
  },
  {
    id: "next_job_30",
    label: "下一案件剩 30 分鐘",
    description: "預約施工時間前 30 分鐘提醒",
    defaultMessage: "提醒：下一案件將於 30 分鐘後開始，請確認工具與路線。",
  },
  {
    id: "next_job_15",
    label: "下一案件剩 15 分鐘",
    description: "預約施工時間前 15 分鐘提醒",
    defaultMessage: "提醒：下一案件將於 15 分鐘後開始，請準備出發。",
  },
  {
    id: "next_job_5",
    label: "下一案件剩 5 分鐘",
    description: "預約施工時間前 5 分鐘提醒",
    defaultMessage: "提醒：下一案件即將開始，請前往案場。",
  },
  {
    id: "past_appointment",
    label: "已超過預約時間",
    description: "超過預約時間仍未按「到達施工」",
    defaultMessage: "提醒：您已超過預約施工時間，請更新進度或聯絡調度。",
  },
  {
    id: "previous_job_incomplete",
    label: "上一案件尚未完成",
    description: "下一案件將開始，但上一案件尚未完工離場",
    defaultMessage: "提醒：上一案件尚未完工離場，請確認是否需改期或加派支援。",
  },
];

export function defaultWorkReminderSettings(): WorkReminderSettings {
  const scenarios = {} as WorkReminderSettings["scenarios"];
  for (const s of WORK_REMINDER_SCENARIOS) {
    scenarios[s.id] = { enabled: true, message: s.defaultMessage };
  }
  return { scenarios };
}

export function loadWorkReminderSettings(): WorkReminderSettings {
  try {
    const raw = localStorage.getItem(WORK_REMINDER_STORAGE_KEY);
    if (!raw) return defaultWorkReminderSettings();
    const parsed = JSON.parse(raw) as WorkReminderSettings;
    const base = defaultWorkReminderSettings();
    for (const s of WORK_REMINDER_SCENARIOS) {
      const saved = parsed.scenarios?.[s.id];
      if (saved) {
        base.scenarios[s.id] = {
          enabled: typeof saved.enabled === "boolean" ? saved.enabled : true,
          message: typeof saved.message === "string" && saved.message.trim()
            ? saved.message
            : s.defaultMessage,
        };
      }
    }
    return base;
  } catch {
    return defaultWorkReminderSettings();
  }
}

export function saveWorkReminderSettings(settings: WorkReminderSettings): void {
  localStorage.setItem(WORK_REMINDER_STORAGE_KEY, JSON.stringify(settings));
}
