import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workOrdersTable } from "./workOrders";

export const WORK_ORDER_RETURN_REASONS = [
  "照片錯誤",
  "照片不足",
  "資料填寫錯誤",
  "尚未完成施工",
  "其他",
] as const;
export type WorkOrderReturnReason = (typeof WORK_ORDER_RETURN_REASONS)[number];

/** Admin reopened a completed work order back to pending. */
export const workOrderReopenEventsTable = pgTable("work_order_reopen_events", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  reopenedByUserId: integer("reopened_by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  returnReason: text("return_reason").notNull(),
  returnNote: text("return_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkOrderReopenEvent = typeof workOrderReopenEventsTable.$inferSelect;
