import { pgTable, serial, integer, text, uniqueIndex } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const productUsageTypesTable = pgTable(
  "product_usage_types",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    usageType: text("usage_type").notNull(),
  },
  (table) => ({
    productUsageUnique: uniqueIndex("product_usage_types_product_id_usage_type_idx").on(
      table.productId,
      table.usageType,
    ),
  }),
);

export type ProductUsageTypeRow = typeof productUsageTypesTable.$inferSelect;
