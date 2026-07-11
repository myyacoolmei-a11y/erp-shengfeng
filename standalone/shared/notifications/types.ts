export const NOTIFICATION_CHANNELS = ["in_app", "web_push", "line"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = {
  WORK_ORDER_ASSIGNED: "work_order_assigned",
  WORK_ORDER_ENGINEER_ADDED: "work_order_engineer_added",
  WORK_ORDER_SCHEDULE_CHANGED: "work_order_schedule_changed",
  WORK_ORDER_ADDRESS_CHANGED: "work_order_address_changed",
  WORK_ORDER_RESCHEDULED: "work_order_rescheduled",
  WORK_ORDER_CANCELLED: "work_order_cancelled",
  WORK_ORDER_ADMIN_NOTE: "work_order_admin_note",
  WORK_ORDER_REOPENED: "work_order_reopened",
  WORK_ORDER_RETAKE_PHOTOS: "work_order_retake_photos",
  WORK_ORDER_RETURNED: "work_order_returned",
  WORK_ORDER_REMINDER_DAY_BEFORE: "work_order_reminder_day_before",
  WORK_ORDER_REMINDER_TWO_HOURS: "work_order_reminder_two_hours",
  FIELD_PROGRESS: "field_progress",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export function workOrderOpenUrl(workOrderId: number): string {
  return `/work-orders?open=${workOrderId}`;
}

export function absoluteWorkOrderUrl(workOrderId: number): string {
  const base = process.env.APP_BASE_URL?.trim()?.replace(/\/+$/, "")
    ?? "http://localhost:3000";
  return `${base}${workOrderOpenUrl(workOrderId)}`;
}
