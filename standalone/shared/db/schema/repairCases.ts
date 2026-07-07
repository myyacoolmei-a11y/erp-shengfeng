import { pgTable, text, serial, integer, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { employeesTable } from "./employees";

export const REPAIR_STATUSES = [
  "待派工",
  "已派工",
  "診斷中",
  "等待客戶確認",
  "等待零件",
  "維修中",
  "已完工",
  "已取消",
] as const;

export const REPAIR_SOURCES = ["客戶報修", "原廠派案"] as const;
export const REPAIR_PRIORITIES = ["普通", "急件", "VIP"] as const;

export const repairCasesTable = pgTable("repair_cases", {
  id: serial("id").primaryKey(),
  repairNo: text("repair_no"),
  source: text("source").notNull().default("客戶報修"),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  tempCustomerName: text("temp_customer_name"),
  contactName: text("contact_name"),
  phone: text("phone"),
  address: text("address"),
  siteAddress: text("site_address"),
  brand: text("brand"),
  model: text("model"),
  quantity: integer("quantity"),
  problemDescription: text("problem_description"),
  status: text("status").notNull().default("待派工"),
  priority: text("priority").notNull().default("普通"),
  appointmentDate: date("appointment_date", { mode: "string" }),
  appointmentTime: text("appointment_time"),
  employeeId: integer("employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRepairCaseSchema = createInsertSchema(repairCasesTable).omit({
  id: true,
  repairNo: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRepairCase = z.infer<typeof insertRepairCaseSchema>;
export type RepairCase = typeof repairCasesTable.$inferSelect;
