/** AI 工作提醒 — 公司預設與派工單覆寫共用型別與工具 */

export type WorkReminderScenarioId =
  | "next_job_60"
  | "next_job_30"
  | "next_job_15"
  | "next_job_5"
  | "past_appointment";

export type AiReminderRuleSource = "company_default" | "custom";

export interface AiReminderScenarioSetting {
  enabled: boolean;
  message: string;
}

export interface CompanyAiWorkReminderSettings {
  scenarios: Record<WorkReminderScenarioId, AiReminderScenarioSetting>;
}

export interface WorkOrderAiReminderCustomConfig {
  scenarios: Partial<Record<WorkReminderScenarioId, { enabled?: boolean; message?: string }>>;
}

export const AI_REMINDER_VARIABLES = [
  { token: "【客戶名稱】", key: "customerName" as const, description: "客戶名稱" },
  { token: "【施工地址】", key: "installAddress" as const, description: "施工地址" },
  { token: "【案件編號】", key: "workOrderNumber" as const, description: "派工單編號" },
  { token: "【工程師姓名】", key: "engineerName" as const, description: "指派工程師" },
  { token: "【預約到場時間】", key: "appointmentArrivalAt" as const, description: "預約日期與時間" },
  { token: "【剩餘時間】", key: "remainingTime" as const, description: "距離到場剩餘時間" },
] as const;

export const WORK_REMINDER_SCENARIOS: Array<{
  id: WorkReminderScenarioId;
  label: string;
  shortLabel: string;
  description: string;
  defaultMessage: string;
  defaultRemainingTime: string;
}> = [
  {
    id: "next_job_60",
    label: "提前 1 小時",
    shortLabel: "剩 1 小時",
    description: "預約到場時間前 60 分鐘",
    defaultRemainingTime: "1 小時",
    defaultMessage: `兄弟，
【客戶名稱】還有1小時開始，
請先整理工具。`,
  },
  {
    id: "next_job_30",
    label: "提前 30 分鐘",
    shortLabel: "剩 30 分鐘",
    description: "預約到場時間前 30 分鐘",
    defaultRemainingTime: "30 分鐘",
    defaultMessage: `下一個案件即將開始，
請準備出發。`,
  },
  {
    id: "next_job_15",
    label: "提前 15 分鐘",
    shortLabel: "剩 15 分鐘",
    description: "預約到場時間前 15 分鐘",
    defaultRemainingTime: "15 分鐘",
    defaultMessage: `剩15分鐘，
工具收一收，準備前往下一個案場。`,
  },
  {
    id: "next_job_5",
    label: "提前 5 分鐘",
    shortLabel: "剩 5 分鐘",
    description: "預約到場時間前 5 分鐘",
    defaultRemainingTime: "5 分鐘",
    defaultMessage: `快衝啦！
客人等你囉！`,
  },
  {
    id: "past_appointment",
    label: "已超過預約時間",
    shortLabel: "已超過預約時間",
    description: "超過預約到場時間仍未到達案場",
    defaultRemainingTime: "已逾時",
    defaultMessage: `已超過預約時間，
請立即前往案場，
必要時通知主管。`,
  },
];

export const DEFAULT_AI_REMINDER_SCENARIO_IDS: WorkReminderScenarioId[] = WORK_REMINDER_SCENARIOS.map(s => s.id);

export function defaultCompanyAiWorkReminderSettings(): CompanyAiWorkReminderSettings {
  const scenarios = {} as CompanyAiWorkReminderSettings["scenarios"];
  for (const s of WORK_REMINDER_SCENARIOS) {
    scenarios[s.id] = { enabled: true, message: s.defaultMessage };
  }
  return { scenarios };
}

export interface AiReminderPreviewContext {
  customerName?: string;
  installAddress?: string;
  workOrderNumber?: string;
  engineerName?: string;
  appointmentArrivalAt?: string;
  remainingTime?: string;
}

export const AI_REMINDER_PREVIEW_SAMPLE: AiReminderPreviewContext = {
  customerName: "王大明",
  installAddress: "台北市信義區市府路1號",
  workOrderNumber: "WO-20260713-0001",
  engineerName: "阿國",
  appointmentArrivalAt: "2026/07/13 14:00",
  remainingTime: "30 分鐘",
};

export function renderAiReminderMessage(template: string, ctx: AiReminderPreviewContext): string {
  const map: Record<string, string> = {
    "【客戶名稱】": ctx.customerName ?? "—",
    "【施工地址】": ctx.installAddress ?? "—",
    "【案件編號】": ctx.workOrderNumber ?? "—",
    "【工程師姓名】": ctx.engineerName ?? "—",
    "【預約到場時間】": ctx.appointmentArrivalAt ?? "—",
    "【剩餘時間】": ctx.remainingTime ?? "—",
  };
  let out = template;
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }
  return out;
}

export function formatAppointmentArrivalAt(scheduledDate?: string, scheduledTime?: string): string {
  if (!scheduledDate) return "";
  if (scheduledTime) return `${scheduledDate.replace(/-/g, "/")} ${scheduledTime}`;
  return scheduledDate.replace(/-/g, "/");
}

export function buildWorkOrderPreviewContext(input: {
  customerName?: string;
  installAddress?: string;
  workOrderNumber?: string;
  engineerName?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  scenarioId?: WorkReminderScenarioId;
}): AiReminderPreviewContext {
  const scenario = WORK_REMINDER_SCENARIOS.find(s => s.id === input.scenarioId);
  return {
    customerName: input.customerName || "—",
    installAddress: input.installAddress || "—",
    workOrderNumber: input.workOrderNumber || "（儲存後產生）",
    engineerName: input.engineerName || "—",
    appointmentArrivalAt: formatAppointmentArrivalAt(input.scheduledDate, input.scheduledTime) || "—",
    remainingTime: scenario?.defaultRemainingTime ?? "—",
  };
}

export function parseCompanyAiWorkReminderSettings(raw: unknown): CompanyAiWorkReminderSettings {
  const base = defaultCompanyAiWorkReminderSettings();
  if (!raw || typeof raw !== "object") return base;
  const scenarios = (raw as CompanyAiWorkReminderSettings).scenarios;
  if (!scenarios || typeof scenarios !== "object") return base;
  for (const s of WORK_REMINDER_SCENARIOS) {
    const saved = scenarios[s.id];
    if (saved && typeof saved === "object") {
      base.scenarios[s.id] = {
        enabled: typeof saved.enabled === "boolean" ? saved.enabled : true,
        message: typeof saved.message === "string" && saved.message.trim()
          ? saved.message
          : s.defaultMessage,
      };
    }
  }
  return base;
}

export function parseWorkOrderAiReminderCustomConfig(raw: unknown): WorkOrderAiReminderCustomConfig {
  if (!raw || typeof raw !== "object") return { scenarios: {} };
  const scenarios = (raw as WorkOrderAiReminderCustomConfig).scenarios;
  if (!scenarios || typeof scenarios !== "object") return { scenarios: {} };
  return { scenarios };
}

export function parseAiReminderScenarioIds(raw: unknown): WorkReminderScenarioId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_AI_REMINDER_SCENARIO_IDS];
  const valid = new Set(WORK_REMINDER_SCENARIOS.map(s => s.id));
  const ids = raw.filter((id): id is WorkReminderScenarioId => typeof id === "string" && valid.has(id as WorkReminderScenarioId));
  return ids.length > 0 ? ids : [...DEFAULT_AI_REMINDER_SCENARIO_IDS];
}

export function resolveWorkOrderReminderMessage(input: {
  scenarioId: WorkReminderScenarioId;
  ruleSource: AiReminderRuleSource;
  companySettings: CompanyAiWorkReminderSettings;
  customConfig?: WorkOrderAiReminderCustomConfig | null;
}): string {
  const { scenarioId, ruleSource, companySettings, customConfig } = input;
  if (ruleSource === "custom") {
    const custom = customConfig?.scenarios?.[scenarioId];
    if (custom?.message?.trim()) return custom.message;
  }
  return companySettings.scenarios[scenarioId]?.message ?? WORK_REMINDER_SCENARIOS.find(s => s.id === scenarioId)?.defaultMessage ?? "";
}
