import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { quotesTable } from "./quotes";

export const workOrdersTable = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  quoteId: integer("quote_id").references(() => quotesTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  assignedTo: text("assigned_to"),
  scheduledDate: date("scheduled_date", { mode: "string" }),
  completedDate: date("completed_date", { mode: "string" }),
  status: text("status").notNull().default("待處理"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkOrderSchema = createInsertSchema(workOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrdersTable.$inferSelect;
