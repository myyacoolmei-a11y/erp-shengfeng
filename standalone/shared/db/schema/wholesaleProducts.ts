import { pgTable, serial, integer, boolean, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const wholesaleProductsTable = pgTable("wholesale_products", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .unique()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  wholesalePrice: numeric("wholesale_price", { precision: 12, scale: 2 }),
  minQuantity: integer("min_quantity").notNull().default(1),
  wholesaleNote: text("wholesale_note"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WholesaleProduct = typeof wholesaleProductsTable.$inferSelect;
