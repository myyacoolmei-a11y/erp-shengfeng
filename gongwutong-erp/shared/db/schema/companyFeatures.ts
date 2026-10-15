import { pgTable, text, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const companyFeaturesTable = pgTable(
  "company_features",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("company_features_company_id_feature_key_uidx").on(t.companyId, t.featureKey)],
);

export const insertCompanyFeatureSchema = createInsertSchema(companyFeaturesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompanyFeature = z.infer<typeof insertCompanyFeatureSchema>;
export type CompanyFeature = typeof companyFeaturesTable.$inferSelect;
