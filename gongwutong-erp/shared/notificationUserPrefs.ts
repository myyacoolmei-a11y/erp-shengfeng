import { NOTIFICATION_TYPES } from "./notifications/types.ts";

/** 使用者可獨立設定的通知偏好鍵 */
export const NOTIFICATION_PREF_KEYS = [
  "receiveMorningBriefing",
  "receiveEveningReminder",
  "receiveAiWorkReminder",
  "receiveNextJobReminder",
  "receiveFieldDepart",
  "receiveFieldArrive",
  "receiveFieldComplete",
  "receiveFieldDelay",
  "receiveReceivableCollection",
  "receiveAccountsReceivable",
  "receiveQuoteFollowUp",
  "receiveLeaveRequest",
  "receiveCompanyAnnouncement",
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export interface UserNotificationPrefs {
  receiveMorningBriefing: boolean;
  receiveEveningReminder: boolean;
  receiveAiWorkReminder: boolean;
  receiveNextJobReminder: boolean;
  receiveFieldDepart: boolean;
  receiveFieldArrive: boolean;
  receiveFieldComplete: boolean;
  receiveFieldDelay: boolean;
  receiveReceivableCollection: boolean;
  receiveAccountsReceivable: boolean;
  receiveQuoteFollowUp: boolean;
  receiveLeaveRequest: boolean;
  receiveCompanyAnnouncement: boolean;
}

export const NOTIFICATION_PREF_ITEMS: Array<{ key: NotificationPrefKey; label: string; description: string }> = [
  { key: "receiveMorningBriefing", label: "AI 晨報", description: "每日 09:00 晨報推播" },
  { key: "receiveEveningReminder", label: "AI 晚報", description: "每日 21:00 晚間摘要" },
  { key: "receiveAiWorkReminder", label: "AI 工作提醒", description: "逾時、上案未完成、可往下一案等工作提醒" },
  { key: "receiveNextJobReminder", label: "下一案件提醒", description: "距離下一案 1h／30m／15m／5m 提醒" },
  { key: "receiveFieldDepart", label: "工程師前往案場", description: "工程師回報已出發" },
  { key: "receiveFieldArrive", label: "工程師到達施工", description: "工程師回報已到達案場" },
  { key: "receiveFieldComplete", label: "工程師完工", description: "工程師回報已完工離場" },
  { key: "receiveFieldDelay", label: "工程師延誤", description: "逾預約時間或無法施工等需留意狀況" },
  { key: "receiveReceivableCollection", label: "收款提醒", description: "到期應收帳款排程提醒" },
  { key: "receiveAccountsReceivable", label: "應收帳款", description: "晨報／晚報中的應收帳款區塊" },
  { key: "receiveQuoteFollowUp", label: "報價追蹤", description: "晨報中的報價追蹤區塊" },
  { key: "receiveLeaveRequest", label: "請假通知", description: "員工請假相關通知" },
  { key: "receiveCompanyAnnouncement", label: "公司公告", description: "晟風夥伴文化與公司公告" },
];

export function defaultUserNotificationPrefs(): UserNotificationPrefs {
  return {
    receiveMorningBriefing: false,
    receiveEveningReminder: false,
    receiveAiWorkReminder: false,
    receiveNextJobReminder: false,
    receiveFieldDepart: false,
    receiveFieldArrive: false,
    receiveFieldComplete: false,
    receiveFieldDelay: false,
    receiveReceivableCollection: false,
    receiveAccountsReceivable: false,
    receiveQuoteFollowUp: false,
    receiveLeaveRequest: false,
    receiveCompanyAnnouncement: false,
  };
}

export type NotificationPrefContext = {
  fieldProgressAction?: "depart" | "arrive" | "complete" | "unable";
};

const DAILY_MORNING_BRIEFING_KIND = "daily_morning_briefing";
const EVENING_RECEIVABLE_REMINDER_KIND = "evening_receivable_reminder";
const RECEIVABLE_COLLECTION_KIND = "receivable_collection";

export function notificationPrefKeyForType(
  type: string,
  context?: NotificationPrefContext,
): NotificationPrefKey | null {
  switch (type) {
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_60:
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_30:
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_15:
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_5:
      return "receiveNextJobReminder";
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_PAST_APPOINTMENT:
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_PREVIOUS_INCOMPLETE:
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_READY_NEXT:
      return "receiveAiWorkReminder";
    case NOTIFICATION_TYPES.AI_WORK_REMINDER_SUPERVISOR_ALERT:
      return "receiveFieldDelay";
    case NOTIFICATION_TYPES.FIELD_PROGRESS: {
      const action = context?.fieldProgressAction;
      if (action === "depart") return "receiveFieldDepart";
      if (action === "arrive") return "receiveFieldArrive";
      if (action === "complete") return "receiveFieldComplete";
      if (action === "unable") return "receiveFieldDelay";
      return "receiveFieldDepart";
    }
    case NOTIFICATION_TYPES.COMPANY_ANNOUNCEMENT:
    case "company_announcement":
      return "receiveCompanyAnnouncement";
    case "leave_request":
      return "receiveLeaveRequest";
    case DAILY_MORNING_BRIEFING_KIND:
      return "receiveMorningBriefing";
    case EVENING_RECEIVABLE_REMINDER_KIND:
      return "receiveEveningReminder";
    case RECEIVABLE_COLLECTION_KIND:
      return "receiveReceivableCollection";
    default:
      return null;
  }
}

export function sanitizeNotificationPrefPatch(
  input: Partial<UserNotificationPrefs>,
): Partial<UserNotificationPrefs> {
  const allowed = new Set(NOTIFICATION_PREF_KEYS);
  const out: Partial<UserNotificationPrefs> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key as NotificationPrefKey)) continue;
    if (typeof value === "boolean") out[key as NotificationPrefKey] = value;
  }
  return out;
}

export function isNotificationTypeEnabled(
  prefs: UserNotificationPrefs,
  type: string,
  context?: NotificationPrefContext,
): boolean {
  const key = notificationPrefKeyForType(type, context);
  if (!key) return true;
  return Boolean(prefs[key]);
}

export function formatEnabledNotificationLabels(prefs: UserNotificationPrefs): string {
  const labels = NOTIFICATION_PREF_ITEMS
    .filter(item => prefs[item.key])
    .map(item => item.label);
  return labels.length > 0 ? labels.join("、") : "（未勾選）";
}

/** 晨報訂閱：任一晨報相關區塊啟用即可 */
export function receivesMorningBriefingSection(
  prefs: UserNotificationPrefs,
  section: "dispatch" | "receivable" | "quote" | "full",
): boolean {
  if (section === "full" || section === "dispatch") {
    if (prefs.receiveMorningBriefing) return true;
  }
  if (section === "receivable" && prefs.receiveAccountsReceivable) return true;
  if (section === "quote" && prefs.receiveQuoteFollowUp) return true;
  if (section === "dispatch" && prefs.receiveMorningBriefing) return true;
  return false;
}

export function defaultChannelsForNotificationType(type: string): Array<"in_app" | "web_push" | "line"> {
  const prefKey = notificationPrefKeyForType(type);
  if (
    prefKey === "receiveNextJobReminder"
    || prefKey === "receiveAiWorkReminder"
  ) {
    return ["web_push", "line"];
  }
  return ["in_app", "web_push", "line"];
}
