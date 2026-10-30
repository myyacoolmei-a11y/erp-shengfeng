import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";

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
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WholesaleCustomer = typeof wholesaleCustomersTable.$inferSelect;
