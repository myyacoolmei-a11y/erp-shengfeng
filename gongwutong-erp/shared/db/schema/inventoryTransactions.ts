import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { inventoryItemsTable } from "./inventoryItems";
import { usersTable } from "./users";

/**
 * 庫存異動流水。數量變更只能透過此表，不可直接改品項數量。
 * quantityChange 為有號整數（進貨為正、領料/報廢為負、盤點可正可負）。
 */
export const inventoryTransactionsTable = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  inventoryItemId: integer("inventory_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  quantityChange: integer("quantity_change").notNull(),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type InventoryTransaction = typeof inventoryTransactionsTable.$inferSelect;
