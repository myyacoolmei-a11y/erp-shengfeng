import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const notificationLogsTable = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  recipient: text("recipient"),
  itemCount: integer("item_count").notNull().default(0),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  messagePreview: text("message_preview"),
});

export type NotificationLog = typeof notificationLogsTable.$inferSelect;
