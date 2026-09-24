import { pgTable, text, serial, integer, timestamp, date, numeric } from "drizzle-orm/pg-core";
import { wholesaleCustomersTable } from "./wholesaleCustomers";
import { wholesaleOrdersTable } from "./wholesaleOrders";
import { usersTable } from "./users";

export const wholesalePaymentsTable = pgTable("wholesale_payments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => wholesaleCustomersTable.id, { onDelete: "restrict" }),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wholesalePaymentAllocationsTable = pgTable("wholesale_payment_allocations", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => wholesalePaymentsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => wholesaleOrdersTable.id, { onDelete: "cascade" }),
  allocatedAmount: numeric("allocated_amount", { precision: 12, scale: 2 }).notNull(),
});

export type WholesalePayment = typeof wholesalePaymentsTable.$inferSelect;
export type WholesalePaymentAllocation = typeof wholesalePaymentAllocationsTable.$inferSelect;
