import { pgTable, text, serial, integer, timestamp, date, numeric } from "drizzle-orm/pg-core";
import { wholesaleOrdersTable } from "./wholesaleOrders";
import { wholesaleCustomersTable } from "./wholesaleCustomers";

export const wholesaleReceivablesTable = pgTable("wholesale_receivables", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => wholesaleOrdersTable.id, { onDelete: "set null" }),
  orderNumber: text("order_number"),
  customerId: integer("customer_id").references(() => wholesaleCustomersTable.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  receivedAmount: numeric("received_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: date("due_date", { mode: "string" }),
  paidDate: date("paid_date", { mode: "string" }),
  paymentStatus: text("payment_status").notNull().default("未收款"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WholesaleReceivable = typeof wholesaleReceivablesTable.$inferSelect;
