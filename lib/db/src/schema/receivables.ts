import { pgTable, text, serial, integer, timestamp, date, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { workOrdersTable } from "./workOrders";

export const receivablesTable = pgTable("receivables", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  workOrderId: integer("work_order_id").references(() => workOrdersTable.id, { onDelete: "set null" }),
  workOrderNumber: text("work_order_number"),
  projectName: text("project_name"),
  projectType: text("project_type"),
  completionDate: date("completion_date", { mode: "string" }),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  receivedAmount: numeric("received_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("未收款"),
  expectedPaymentDate: date("expected_payment_date", { mode: "string" }),
  actualPaymentDate: date("actual_payment_date", { mode: "string" }),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  invoiceStatus: text("invoice_status").notNull().default("未開立"),
  invoiceType: text("invoice_type"),
  taxId: text("tax_id"),
  invoiceTitle: text("invoice_title"),
  invoiceNumber: text("invoice_number"),
  invoiceDate: date("invoice_date", { mode: "string" }),
  invoiceNotes: text("invoice_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReceivableSchema = createInsertSchema(receivablesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReceivable = z.infer<typeof insertReceivableSchema>;
export type Receivable = typeof receivablesTable.$inferSelect;
