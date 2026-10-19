import { pgTable, text, serial, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { usersTable } from "./users";

/** Lightweight admin follow-up queue (e.g. after engineer completes field work). */
export const adminTodosTable = pgTable(
  "admin_todos",
  {
    id: serial("id").primaryKey(),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrdersTable.id, { onDelete: "cascade" }),
    /** e.g. field_complete */
    todoType: text("todo_type").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("pending"),
    payload: jsonb("payload"),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("admin_todos_work_order_type_uidx").on(t.workOrderId, t.todoType)],
);

export type AdminTodo = typeof adminTodosTable.$inferSelect;
