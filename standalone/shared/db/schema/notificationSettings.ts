import { pgTable, text, serial, boolean, timestamp, date } from "drizzle-orm/pg-core";

/** Shared reminder configuration — extensible by `kind`. */
export const notificationSettingsTable = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  reminderTime: text("reminder_time").notNull().default("09:00"),
  lineChannelAccessToken: text("line_channel_access_token"),
  lineUserId: text("line_user_id"),
  appBaseUrl: text("app_base_url"),
  lastSentDate: date("last_sent_date", { mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type NotificationSetting = typeof notificationSettingsTable.$inferSelect;
