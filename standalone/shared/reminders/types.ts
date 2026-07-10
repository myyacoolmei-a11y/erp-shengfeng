export const RECEIVABLE_COLLECTION_KIND = "receivable_collection" as const;
export const DAILY_MORNING_BRIEFING_KIND = "daily_morning_briefing" as const;
export const EVENING_RECEIVABLE_REMINDER_KIND = "evening_receivable_reminder" as const;

export type ReceivableReminderCategory = "overdue" | "due_today" | "due_soon";

export interface ReceivableReminderItem {
  id: number;
  customerName: string;
  projectName: string;
  totalAmount: number;
  receivedAmount: number;
  unpaidAmount: number;
  paymentLabel: string;
  paymentMethod: string | null;
  expectedPaymentDate: string;
  overdueDays: number;
  daysUntilDue: number;
  salesRepName: string | null;
  contactPhone: string | null;
  erpUrl: string;
  category: ReceivableReminderCategory;
}

export interface ReceivableReminderSummary {
  total: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  items: ReceivableReminderItem[];
}

export interface NotificationSettingsDto {
  kind: string;
  enabled: boolean;
  reminderTime: string;
  appBaseUrl: string;
  lastSentDate: string | null;
  updatedAt: string | null;
  hasLineEnvConfig: boolean;
  lineWebhookUrl: string;
  lineLinked: boolean;
  lineUserIdMasked: string;
  linkedErpUserName: string | null;
  pendingLineLink: boolean;
  boundSubscriberCount: number;
}

export interface UserLineNotificationPrefsDto {
  lineLinked: boolean;
  receiveMorningBriefing: boolean;
  receiveEveningReminder: boolean;
  receivePendingDispatch: boolean;
  receiveQuoteFollowUp: boolean;
  receiveReceivableCollection: boolean;
}

export interface LineSubscriptionAdminDto {
  userId: number;
  displayName: string;
  username: string;
  lineUserIdMasked: string;
  prefs: {
    receiveMorningBriefing: boolean;
    receiveEveningReminder: boolean;
    receivePendingDispatch: boolean;
    receiveQuoteFollowUp: boolean;
    receiveReceivableCollection: boolean;
  };
}

export interface LineBindingCodeResponse {
  code: string;
  expiresAt: string;
  addFriendUrl: string;
  instruction: string;
}

export interface LineBindingStatusResponse {
  status: "none" | "pending" | "bound";
  lineLinked: boolean;
  code: string | null;
  expiresAt: string | null;
  linkedErpUserName: string | null;
  lineUserIdMasked: string | null;
}
