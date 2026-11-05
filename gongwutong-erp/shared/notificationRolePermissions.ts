import { NOTIFICATION_TYPES, type NotificationType } from "./notifications/types.ts";

/** 通知分類 */
export const NOTIFICATION_CATEGORIES = {
  MANAGEMENT: "management",
  ENGINEER_WORK_REMINDER: "engineer_work_reminder",
  COMPANY_ANNOUNCEMENT: "company_announcement",
} as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export const MANAGER_ROLES = ["super_admin", "owner", "admin"] as const;
export const ENGINEER_ROLES = ["engineer", "technician"] as const;

export type ManagerRole = (typeof MANAGER_ROLES)[number];
export type EngineerRole = (typeof ENGINEER_ROLES)[number];

/** 管理端 LINE 訂閱偏好（AI 晨報／晚報／財務／派工進度相關） */
export const MANAGEMENT_LINE_PREF_KEYS = [
  "receiveMorningBriefing",
  "receiveEveningReminder",
  "receivePendingDispatch",
  "receiveQuoteFollowUp",
  "receiveReceivableCollection",
] as const;

/** 工程師工作提醒 LINE 訂閱偏好 */
export const ENGINEER_LINE_PREF_KEYS = [
  "receiveWorkReminder60",
  "receiveWorkReminder30",
  "receiveWorkReminder15",
  "receiveWorkReminder5",
  "receivePastAppointment",
  "receivePreviousJobIncomplete",
  "receiveReadyForNextJob",
  "receiveOneTapNavigation",
] as const;

/** 管理者與工程師皆可訂閱 */
export const SHARED_LINE_PREF_KEYS = ["receiveCompanyAnnouncement"] as const;

export type ManagementLinePrefKey = (typeof MANAGEMENT_LINE_PREF_KEYS)[number];
export type EngineerLinePrefKey = (typeof ENGINEER_LINE_PREF_KEYS)[number];
export type SharedLinePrefKey = (typeof SHARED_LINE_PREF_KEYS)[number];
export type LineNotificationPrefKey =
  | ManagementLinePrefKey
  | EngineerLinePrefKey
  | SharedLinePrefKey;

export const AI_WORK_REMINDER_NOTIFICATION_TYPES = {
  AI_WORK_REMINDER_60: "ai_work_reminder_60",
  AI_WORK_REMINDER_30: "ai_work_reminder_30",
  AI_WORK_REMINDER_15: "ai_work_reminder_15",
  AI_WORK_REMINDER_5: "ai_work_reminder_5",
  AI_WORK_REMINDER_PAST: "ai_work_reminder_past_appointment",
  AI_WORK_REMINDER_PREVIOUS_INCOMPLETE: "ai_work_reminder_previous_incomplete",
  AI_WORK_REMINDER_READY_NEXT: "ai_work_reminder_ready_next",
  AI_WORK_REMINDER_SUPERVISOR: "ai_work_reminder_supervisor_alert",
} as const;

const ENGINEER_WORK_TYPE_SET = new Set<string>([
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_60,
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_30,
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_15,
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_5,
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_PAST,
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_PREVIOUS_INCOMPLETE,
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_READY_NEXT,
]);

const MANAGEMENT_TYPE_SET = new Set<string>([
  NOTIFICATION_TYPES.FIELD_PROGRESS,
  NOTIFICATION_TYPES.WORK_ORDER_ADMIN_NOTE,
  NOTIFICATION_TYPES.WORK_ORDER_REOPENED,
  NOTIFICATION_TYPES.WORK_ORDER_RETURNED,
  NOTIFICATION_TYPES.WORK_ORDER_RETAKE_PHOTOS,
  NOTIFICATION_TYPES.WORK_ORDER_CANCELLED,
  AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_SUPERVISOR,
  "leave_request",
  "system_notice",
]);

const COMPANY_TYPE_SET = new Set<string>([
  "company_announcement",
  NOTIFICATION_TYPES.WORK_ORDER_ASSIGNED,
]);

/** 工程師派工相關（非 1h/30m 工作提醒） */
const ENGINEER_DISPATCH_TYPE_SET = new Set<string>([
  NOTIFICATION_TYPES.WORK_ORDER_ASSIGNED,
  NOTIFICATION_TYPES.WORK_ORDER_ENGINEER_ADDED,
  NOTIFICATION_TYPES.WORK_ORDER_SCHEDULE_CHANGED,
  NOTIFICATION_TYPES.WORK_ORDER_ADDRESS_CHANGED,
  NOTIFICATION_TYPES.WORK_ORDER_RESCHEDULED,
  NOTIFICATION_TYPES.WORK_ORDER_REMINDER_DAY_BEFORE,
  NOTIFICATION_TYPES.WORK_ORDER_REMINDER_TWO_HOURS,
]);

export function effectiveRoleList(roles: string[] | undefined, primaryRole?: string): string[] {
  if (roles?.length) return roles;
  if (primaryRole) return [primaryRole];
  return [];
}

export function isManagerRole(roles: string[]): boolean {
  return roles.some(r => (MANAGER_ROLES as readonly string[]).includes(r));
}

export function isEngineerRole(roles: string[]): boolean {
  return roles.some(r => (ENGINEER_ROLES as readonly string[]).includes(r));
}

export function getNotificationCategory(type: string): NotificationCategory {
  if (ENGINEER_WORK_TYPE_SET.has(type)) return NOTIFICATION_CATEGORIES.ENGINEER_WORK_REMINDER;
  if (COMPANY_TYPE_SET.has(type) || type === "company_announcement") {
    return NOTIFICATION_CATEGORIES.COMPANY_ANNOUNCEMENT;
  }
  if (ENGINEER_DISPATCH_TYPE_SET.has(type)) return NOTIFICATION_CATEGORIES.ENGINEER_WORK_REMINDER;
  if (MANAGEMENT_TYPE_SET.has(type)) return NOTIFICATION_CATEGORIES.MANAGEMENT;
  return NOTIFICATION_CATEGORIES.MANAGEMENT;
}

export function rolesCanReceiveCategory(roles: string[], category: NotificationCategory): boolean {
  if (category === NOTIFICATION_CATEGORIES.MANAGEMENT) return isManagerRole(roles);
  if (category === NOTIFICATION_CATEGORIES.ENGINEER_WORK_REMINDER) return isEngineerRole(roles);
  if (category === NOTIFICATION_CATEGORIES.COMPANY_ANNOUNCEMENT) {
    return isManagerRole(roles) || isEngineerRole(roles);
  }
  return false;
}

export function rolesCanReceiveNotificationType(roles: string[], type: string): boolean {
  return rolesCanReceiveCategory(roles, getNotificationCategory(type));
}

export function allowedLinePrefKeysForRoles(roles: string[]): LineNotificationPrefKey[] {
  const keys: LineNotificationPrefKey[] = [];
  if (isManagerRole(roles)) keys.push(...MANAGEMENT_LINE_PREF_KEYS);
  if (isEngineerRole(roles)) keys.push(...ENGINEER_LINE_PREF_KEYS);
  if (isManagerRole(roles) || isEngineerRole(roles)) keys.push(...SHARED_LINE_PREF_KEYS);
  return keys;
}

export function defaultLinePrefsForRoles(roles: string[]): Record<LineNotificationPrefKey, boolean> {
  const manager = isManagerRole(roles);
  const engineer = isEngineerRole(roles);
  return {
    receiveMorningBriefing: manager,
    receiveEveningReminder: manager,
    receivePendingDispatch: manager,
    receiveQuoteFollowUp: manager,
    receiveReceivableCollection: manager,
    receiveWorkReminder60: engineer,
    receiveWorkReminder30: engineer,
    receiveWorkReminder15: engineer,
    receiveWorkReminder5: engineer,
    receivePastAppointment: engineer,
    receivePreviousJobIncomplete: engineer,
    receiveReadyForNextJob: engineer,
    receiveOneTapNavigation: engineer,
    receiveCompanyAnnouncement: manager || engineer,
  };
}

export function sanitizeLinePrefPatch(
  roles: string[],
  input: Partial<Record<LineNotificationPrefKey, boolean>>,
): Partial<Record<LineNotificationPrefKey, boolean>> {
  const allowed = new Set(allowedLinePrefKeysForRoles(roles));
  const out: Partial<Record<LineNotificationPrefKey, boolean>> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key as LineNotificationPrefKey)) continue;
    if (typeof value === "boolean") out[key as LineNotificationPrefKey] = value;
  }
  return out;
}

export function workReminderPrefKeyForNotificationType(
  type: string,
): EngineerLinePrefKey | null {
  switch (type) {
    case AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_60:
      return "receiveWorkReminder60";
    case AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_30:
      return "receiveWorkReminder30";
    case AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_15:
      return "receiveWorkReminder15";
    case AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_5:
      return "receiveWorkReminder5";
    case AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_PAST:
      return "receivePastAppointment";
    case AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_PREVIOUS_INCOMPLETE:
      return "receivePreviousJobIncomplete";
    case AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_READY_NEXT:
      return "receiveReadyForNextJob";
    default:
      return null;
  }
}

export function defaultChannelsForCategory(category: NotificationCategory): Array<"in_app" | "web_push" | "line"> {
  if (category === NOTIFICATION_CATEGORIES.ENGINEER_WORK_REMINDER) {
    return ["web_push", "line"];
  }
  return ["in_app", "web_push", "line"];
}

export type { NotificationType };
