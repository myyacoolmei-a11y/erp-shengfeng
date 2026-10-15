import { pgTable, text, serial, integer, timestamp, date, numeric } from "drizzle-orm/pg-core";
import { wholesaleCustomersTable } from "./wholesaleCustomers";
import { productsTable } from "./products";

export const wholesaleQuotesTable = pgTable("wholesale_quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").unique(),
  customerId: integer("customer_id").references(() => wholesaleCustomersTable.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  quoteDate: date("quote_date", { mode: "string" }).notNull(),
  expiryDate: date("expiry_date", { mode: "string" }),
  salesperson: text("salesperson"),
  notes: text("notes"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  shippingFee: numeric("shipping_fee", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("草稿"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const wholesaleQuoteItemsTable = pgTable("wholesale_quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => wholesaleQuotesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  brand: text("brand"),
  model: text("model"),
  unit: text("unit"),
  qty: integer("qty").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 5, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type WholesaleQuote = typeof wholesaleQuotesTable.$inferSelect;
export type WholesaleQuoteItem = typeof wholesaleQuoteItemsTable.$inferSelect;
