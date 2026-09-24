import { pgTable, text, serial, timestamp, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const wholesaleCustomersTable = pgTable("wholesale_customers", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person"),
  mobile: text("mobile"),
  telephone: text("telephone"),
  taxId: text("tax_id"),
  address: text("address"),
  email: text("email"),
  paymentTerms: text("payment_terms"),
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }),
  billingCompanyName: text("billing_company_name"),
  billingTaxId: text("billing_tax_id"),
  billingAddress: text("billing_address"),
  invoiceEmail: text("invoice_email"),
  salesUserId: integer("sales_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  deliveryAddresses: jsonb("delivery_addresses").$type<string[]>().notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WholesaleCustomer = typeof wholesaleCustomersTable.$inferSelect;
