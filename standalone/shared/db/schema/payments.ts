import { pgTable, text, serial, integer, timestamp, date, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { quotesTable } from "./quotes";
import { workOrdersTable } from "./workOrders";
import { receivablesTable } from "./receivables";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  quoteId: integer("quote_id").references(() => quotesTable.id, { onDelete: "set null" }),
  workOrderId: integer("work_order_id").references(() => workOrdersTable.id, { onDelete: "set null" }),
  receivableId: integer("receivable_id").references(() => receivablesTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  reversalOfPaymentId: integer("reversal_of_payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
