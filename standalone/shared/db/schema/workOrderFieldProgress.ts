import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { usersTable } from "./users";

/** Per-engineer on-site progress and work hours for a work order. */
export const workOrderFieldProgressTable = pgTable("work_order_field_progress", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  engineerUserId: integer("engineer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  engineerName: text("engineer_name").notNull(),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  unableToCompleteAt: timestamp("unable_to_complete_at", { withTimezone: true }),
  unableReason: text("unable_reason"),
  unableNote: text("unable_note"),
  travelDurationMinutes: integer("travel_duration_minutes"),
  workDurationMinutes: integer("work_duration_minutes"),
  totalDurationMinutes: integer("total_duration_minutes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorkOrderFieldProgress = typeof workOrderFieldProgressTable.$inferSelect;
