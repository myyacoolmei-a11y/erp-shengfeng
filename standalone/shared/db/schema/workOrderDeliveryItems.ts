import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { wholesaleOrdersTable } from "./wholesaleOrders";
import { productsTable } from "./products";
import { inventoryItemsTable } from "./inventoryItems";

export const workOrderDeliveryItemsTable = pgTable("work_order_delivery_items", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  wholesaleOrderId: integer("wholesale_order_id").references(() => wholesaleOrdersTable.id, { onDelete: "set null" }),
  wholesaleOrderItemId: integer("wholesale_order_item_id"),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name"),
  brand: text("brand"),
  model: text("model"),
  unit: text("unit"),
  orderedQty: integer("ordered_qty").notNull().default(0),
  shipQty: integer("ship_qty").notNull().default(0),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  inventoryDeductedAt: timestamp("inventory_deducted_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type WorkOrderDeliveryItem = typeof workOrderDeliveryItemsTable.$inferSelect;
