export const RECEIVABLE_COLLECTION_KIND = "receivable_collection" as const;

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
  lineChannelAccessToken: string;
  lineUserId: string;
  appBaseUrl: string;
  hasLineToken: boolean;
  lastSentDate: string | null;
  updatedAt: string | null;
}
