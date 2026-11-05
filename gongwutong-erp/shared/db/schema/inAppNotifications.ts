import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const inAppNotificationsTable = pgTable("in_app_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("field_progress"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  payload: jsonb("payload").$type<{ workOrderId?: number; url?: string }>(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InAppNotification = typeof inAppNotificationsTable.$inferSelect;
