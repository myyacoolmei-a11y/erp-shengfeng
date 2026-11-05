import { pgTable, text, serial, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { quotesTable } from "./quotes";
import { productsTable } from "./products";

export const quoteItemsTable = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  category: text("category").notNull().default("其他"),
  itemName: text("item_name").notNull().default(""),
  brand: text("brand"),
  model: text("model"),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: text("unit").notNull().default("台"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  installFee: numeric("install_fee", { precision: 12, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  workContent: text("work_content"),
  optionGroupId: text("option_group_id"),
  optionGroupName: text("option_group_name"),
  isRequiredGroup: boolean("is_required_group").notNull().default(true),
  selectionMode: text("selection_mode").notNull().default("single"),
  isSelected: boolean("is_selected"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertQuoteItemSchema = createInsertSchema(quoteItemsTable).omit({ id: true });
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;
export type QuoteItem = typeof quoteItemsTable.$inferSelect;
