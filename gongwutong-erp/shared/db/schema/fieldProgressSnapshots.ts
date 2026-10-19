import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";

/** Archived field-progress cycle before admin reopens a completed work order. */
export const fieldProgressSnapshotsTable = pgTable("field_progress_snapshots", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  engineerUserId: integer("engineer_user_id").notNull(),
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
  sourceProgressId: integer("source_progress_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FieldProgressSnapshot = typeof fieldProgressSnapshotsTable.$inferSelect;
