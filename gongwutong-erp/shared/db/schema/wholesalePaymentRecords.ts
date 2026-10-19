import { pgTable, text, serial, integer, timestamp, date, numeric } from "drizzle-orm/pg-core";
import { wholesaleOrdersTable } from "./wholesaleOrders";
import { wholesaleCustomersTable } from "./wholesaleCustomers";
import { usersTable } from "./users";

export const wholesalePaymentRecordsTable = pgTable("wholesale_payment_records", {
  id: serial("id").primaryKey(),
  wholesaleCustomerId: integer("wholesale_customer_id").references(() => wholesaleCustomersTable.id, { onDelete: "set null" }),
  wholesaleOrderId: integer("wholesale_order_id").references(() => wholesaleOrdersTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  paymentMethod: text("payment_method"),
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WholesalePaymentRecord = typeof wholesalePaymentRecordsTable.$inferSelect;
