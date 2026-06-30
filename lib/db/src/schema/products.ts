import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  productNumber: text("product_number").unique(),

  // 基本資料
  brand: text("brand"),
  category: text("category"),
  name: text("name").notNull(),
  model: text("model"),
  spec: text("spec"),
  unit: text("unit"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),

  // 價格
  costPrice: numeric("cost_price"),
  retailPrice: numeric("retail_price"),
  wholesalePrice: numeric("wholesale_price"),
  minPrice: numeric("min_price"),
  taxIncluded: boolean("tax_included").notNull().default(false),

  // 庫存
  stockQty: integer("stock_qty").notNull().default(0),
  safetyStock: integer("safety_stock"),
  warehouseLocation: text("warehouse_location"),

  // 冷氣規格
  coolingCapacity: text("cooling_capacity"),
  heatingCapacity: text("heating_capacity"),
  cspf: text("cspf"),
  energyEfficiency: text("energy_efficiency"),
  voltage: text("voltage"),
  refrigerant: text("refrigerant"),
  warrantyMonths: integer("warranty_months"),

  // 其他
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
