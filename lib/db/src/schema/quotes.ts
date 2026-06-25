import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
  finalAmount: numeric("final_amount", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("草稿"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
