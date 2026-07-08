import { pgTable, text, serial, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workOrdersTable } from "./workOrders";
import { productsTable } from "./products";
import { quoteItemsTable } from "./quoteItems";

export const workOrderEquipmentItemsTable = pgTable("work_order_equipment_items", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  quoteItemId: integer("quote_item_id").references(() => quoteItemsTable.id, { onDelete: "set null" }),
  category: text("category"),
  itemName: text("item_name"),
  brand: text("brand"),
  model: text("model"),
  quantity: integer("quantity"),
  unit: text("unit"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  notes: text("notes"),
  indoorUnits: integer("indoor_units"),
  outdoorUnits: integer("outdoor_units"),
  floor: text("floor"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertWorkOrderEquipmentItemSchema = createInsertSchema(workOrderEquipmentItemsTable).omit({ id: true });
export type InsertWorkOrderEquipmentItem = z.infer<typeof insertWorkOrderEquipmentItemSchema>;
export type WorkOrderEquipmentItem = typeof workOrderEquipmentItemsTable.$inferSelect;
