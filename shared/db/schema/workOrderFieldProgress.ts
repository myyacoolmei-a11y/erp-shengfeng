import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { usersTable } from "./users";
import type { CompletionChecklist, PauseInterval } from "../../fieldProgressConstants";

/** Per-engineer on-site progress and work hours for a work order. */
export const workOrderFieldProgressTable = pgTable("work_order_field_progress", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  engineerUserId: integer("engineer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  engineerName: text("engineer_name").notNull(),
  /** pending | en_route | in_progress | paused | completed */
  fieldStatus: text("field_status").notNull().default("pending"),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  pauseReason: text("pause_reason"),
  pauseNote: text("pause_note"),
  /** Accumulated pause minutes across all intervals */
  pauseTotalMinutes: integer("pause_total_minutes").notNull().default(0),
  pauseIntervals: jsonb("pause_intervals").$type<PauseInterval[]>().notNull().default([]),
  unableToCompleteAt: timestamp("unable_to_complete_at", { withTimezone: true }),
  unableReason: text("unable_reason"),
  unableNote: text("unable_note"),
  travelDurationMinutes: integer("travel_duration_minutes"),
  workDurationMinutes: integer("work_duration_minutes"),
  totalDurationMinutes: integer("total_duration_minutes"),
  completedBy: integer("completed_by").references(() => usersTable.id, { onDelete: "set null" }),
  completionChecklist: jsonb("completion_checklist").$type<CompletionChecklist | null>(),
  /** pending_admin after engineer completes — admin dashboard later */
  workflowStatus: text("workflow_status"),
  lastActionBy: integer("last_action_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorkOrderFieldProgress = typeof workOrderFieldProgressTable.$inferSelect;
