import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { workOrderFieldProgressTable } from "./workOrderFieldProgress";
import { usersTable } from "./users";

/** Engineer requests to backfill a missed field-progress step (approval UI later). */
export const fieldProgressBackfillRequestsTable = pgTable("field_progress_backfill_requests", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  progressId: integer("progress_id").references(() => workOrderFieldProgressTable.id, {
    onDelete: "set null",
  }),
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  missedStep: text("missed_step").notNull(),
  requestedTime: timestamp("requested_time", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  note: text("note"),
  approvalStatus: text("approval_status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FieldProgressBackfillRequest = typeof fieldProgressBackfillRequestsTable.$inferSelect;
