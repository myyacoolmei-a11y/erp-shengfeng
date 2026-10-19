import { pgTable, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Per-user notification preferences (LINE / in-app / web push content filters). */
export const userLineNotificationPrefsTable = pgTable("user_line_notification_prefs", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  receiveMorningBriefing: boolean("receive_morning_briefing").notNull().default(false),
  receiveEveningReminder: boolean("receive_evening_reminder").notNull().default(false),
  receivePendingDispatch: boolean("receive_pending_dispatch").notNull().default(false),
  receiveQuoteFollowUp: boolean("receive_quote_follow_up").notNull().default(false),
  receiveReceivableCollection: boolean("receive_receivable_collection").notNull().default(false),
  receiveAccountsReceivable: boolean("receive_accounts_receivable").notNull().default(false),
  receiveAiWorkReminder: boolean("receive_ai_work_reminder").notNull().default(false),
  receiveNextJobReminder: boolean("receive_next_job_reminder").notNull().default(false),
  receiveFieldDepart: boolean("receive_field_depart").notNull().default(false),
  receiveFieldArrive: boolean("receive_field_arrive").notNull().default(false),
  receiveFieldComplete: boolean("receive_field_complete").notNull().default(false),
  receiveFieldDelay: boolean("receive_field_delay").notNull().default(false),
  receiveLeaveRequest: boolean("receive_leave_request").notNull().default(false),
  receiveWorkReminder60: boolean("receive_work_reminder_60").notNull().default(false),
  receiveWorkReminder30: boolean("receive_work_reminder_30").notNull().default(false),
  receiveWorkReminder15: boolean("receive_work_reminder_15").notNull().default(false),
  receiveWorkReminder5: boolean("receive_work_reminder_5").notNull().default(false),
  receivePastAppointment: boolean("receive_past_appointment").notNull().default(false),
  receivePreviousJobIncomplete: boolean("receive_previous_job_incomplete").notNull().default(false),
  receiveReadyForNextJob: boolean("receive_ready_for_next_job").notNull().default(false),
  receiveOneTapNavigation: boolean("receive_one_tap_navigation").notNull().default(false),
  receiveCompanyAnnouncement: boolean("receive_company_announcement").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserLineNotificationPrefs = typeof userLineNotificationPrefsTable.$inferSelect;
