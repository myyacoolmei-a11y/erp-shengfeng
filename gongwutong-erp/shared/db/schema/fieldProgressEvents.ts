import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workOrdersTable } from "./workOrders";
import { customersTable } from "./customers";

export const FIELD_PROGRESS_ACTIONS = ["depart", "arrive", "complete", "unable"] as const;
export type FieldProgressAction = (typeof FIELD_PROGRESS_ACTIONS)[number];

/** Audit log when engineer updates field progress on a work order */
export const fieldProgressEventsTable = pgTable("field_progress_events", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  engineerUserId: integer("engineer_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  engineerName: text("engineer_name").notNull(),
  action: text("action").notNull(),
  actionLabel: text("action_label").notNull(),
  actedAt: timestamp("acted_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FieldProgressEvent = typeof fieldProgressEventsTable.$inferSelect;
