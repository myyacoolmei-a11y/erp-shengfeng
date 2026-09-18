import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationDeliveryLogsTable = pgTable("notification_delivery_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  channel: text("channel").notNull(),
  notificationType: text("notification_type").notNull(),
  title: text("title").notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  workOrderId: integer("work_order_id"),
  subscriptionId: integer("subscription_id"),
  lineUserId: text("line_user_id"),
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationDeliveryLog = typeof notificationDeliveryLogsTable.$inferSelect;
