import { pgTable, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userNotificationPrefsTable = pgTable("user_notification_prefs", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  notifyInApp: boolean("notify_in_app").notNull().default(true),
  notifyWebPush: boolean("notify_web_push").notNull().default(true),
  notifyLine: boolean("notify_line").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserNotificationPrefs = typeof userNotificationPrefsTable.$inferSelect;
