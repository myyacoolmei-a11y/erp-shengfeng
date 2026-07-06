import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workOrdersTable } from "./workOrders";

export const workOrderEquipmentItemsTable = pgTable("work_order_equipment_items", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  brand: text("brand"),
  model: text("model"),
  quantity: integer("quantity"),
  indoorUnits: integer("indoor_units"),
  outdoorUnits: integer("outdoor_units"),
  floor: text("floor"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertWorkOrderEquipmentItemSchema = createInsertSchema(workOrderEquipmentItemsTable).omit({ id: true });
export type InsertWorkOrderEquipmentItem = z.infer<typeof insertWorkOrderEquipmentItemSchema>;
export type WorkOrderEquipmentItem = typeof workOrderEquipmentItemsTable.$inferSelect;
