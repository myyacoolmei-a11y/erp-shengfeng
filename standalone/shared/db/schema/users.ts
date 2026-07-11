import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const USER_ROLES = [
  "super_admin",
  "owner",
  "admin",
  "sales",
  "engineer",
  "technician",
  "accountant",
  "distributor",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("technician"),
  roles: text("roles").array().notNull().default([]),
  phone: text("phone"),
  email: text("email"),
  identityType: text("identity_type").notNull().default("employee"),
  title: text("title"),
  notes: text("notes"),
  featurePermissions: text("feature_permissions").array().notNull().default([]),
  dataPermission: text("data_permission").notNull().default("all"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lineUserId: text("line_user_id"),
  linkedEmployeeId: integer("linked_employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  receiveDispatchNotifications: boolean("receive_dispatch_notifications").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
