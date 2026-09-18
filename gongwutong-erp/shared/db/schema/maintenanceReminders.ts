import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { acUnitsTable } from "./acUnits";

export const maintenanceRemindersTable = pgTable("maintenance_reminders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  acUnitId: integer("ac_unit_id").references(() => acUnitsTable.id, { onDelete: "set null" }),
  reminderDate: date("reminder_date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("待處理"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaintenanceReminderSchema = createInsertSchema(maintenanceRemindersTable).omit({ id: true, createdAt: true });
export type InsertMaintenanceReminder = z.infer<typeof insertMaintenanceReminderSchema>;
export type MaintenanceReminder = typeof maintenanceRemindersTable.$inferSelect;
