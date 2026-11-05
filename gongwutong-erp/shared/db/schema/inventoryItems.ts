import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * 庫存品項主檔。
 * 數量不存欄位，一律由 inventory_transactions 累加計算。
 */
export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  brand: text("brand"),
  category: text("category"),
  itemName: text("item_name").notNull(),
  model: text("model"),
  serialNumber: text("serial_number"),
  unit: text("unit").notNull().default("台"),
  warehouseLocation: text("warehouse_location"),
  status: text("status").notNull().default("庫存中"),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
