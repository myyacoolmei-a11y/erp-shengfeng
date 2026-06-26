import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const acUnitsTable = pgTable("ac_units", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  serialNumber: text("serial_number"),
  purchaseDate: date("purchase_date", { mode: "string" }),
  installationDate: date("installation_date", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAcUnitSchema = createInsertSchema(acUnitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAcUnit = z.infer<typeof insertAcUnitSchema>;
export type AcUnit = typeof acUnitsTable.$inferSelect;
