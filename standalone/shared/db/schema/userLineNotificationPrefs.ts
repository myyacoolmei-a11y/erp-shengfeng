import { pgTable, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Per-user LINE notification preferences (multi-recipient push). */
export const userLineNotificationPrefsTable = pgTable("user_line_notification_prefs", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  receiveMorningBriefing: boolean("receive_morning_briefing").notNull().default(true),
  receiveEveningReminder: boolean("receive_evening_reminder").notNull().default(true),
  receivePendingDispatch: boolean("receive_pending_dispatch").notNull().default(true),
  receiveQuoteFollowUp: boolean("receive_quote_follow_up").notNull().default(true),
  receiveReceivableCollection: boolean("receive_receivable_collection").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserLineNotificationPrefs = typeof userLineNotificationPrefsTable.$inferSelect;
