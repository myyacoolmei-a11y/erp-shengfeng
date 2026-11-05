import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { repairCasesTable } from "./repairCases";

export const repairCasePhotosTable = pgTable("repair_case_photos", {
  id: serial("id").primaryKey(),
  repairCaseId: integer("repair_case_id").notNull().references(() => repairCasesTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRepairCasePhotoSchema = createInsertSchema(repairCasePhotosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRepairCasePhoto = z.infer<typeof insertRepairCasePhotoSchema>;
export type RepairCasePhoto = typeof repairCasePhotosTable.$inferSelect;
