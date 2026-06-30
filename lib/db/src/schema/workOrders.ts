import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { quotesTable } from "./quotes";

export const workOrdersTable = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  quoteId: integer("quote_id").references(() => quotesTable.id, { onDelete: "set null" }),
  workOrderNumber: text("work_order_number"),
  title: text("title").notNull(),
  status: text("status").notNull().default("待處理"),
  contactPerson: text("contact_person"),
  mobilePhone: text("mobile_phone"),
  telephone: text("telephone"),
  installAddress: text("install_address"),
  scheduledDate: date("scheduled_date", { mode: "string" }),
  scheduledTime: text("scheduled_time"),
  completedDate: date("completed_date", { mode: "string" }),
  assignedTo: text("assigned_to"),
  assistantTo: text("assistant_to"),
  projectType: text("project_type"),
  acBrand: text("ac_brand"),
  modelNumber: text("model_number"),
  quantity: integer("quantity"),
  indoorUnits: integer("indoor_units"),
  outdoorUnits: integer("outdoor_units"),
  floorLevel: text("floor_level"),
  hasElevator: text("has_elevator"),
  description: text("description"),
  notes: text("notes"),
  technicians: text("technicians"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkOrderSchema = createInsertSchema(workOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrdersTable.$inferSelect;
