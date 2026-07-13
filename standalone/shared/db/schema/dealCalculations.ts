import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { usersTable } from "./users";

export const dealCalculationsTable = pgTable("deal_calculations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  calcType: text("calc_type").notNull(),
  customerName: text("customer_name"),
  inputJson: text("input_json").notNull(),
  resultJson: text("result_json").notNull(),
  benefitsJson: text("benefits_json"),
  aiExplanationJson: text("ai_explanation_json"),
  agentContactJson: text("agent_contact_json"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const governmentBenefitRulesTable = pgTable("government_benefit_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  conditionsJson: text("conditions_json").notNull(),
  sourceUrl: text("source_url").notNull(),
  lastUpdated: text("last_updated").notNull(),
  enabled: integer("enabled").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const customerTimelineEventsTable = pgTable("customer_timeline_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  refType: text("ref_type"),
  refId: integer("ref_id"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealCalcTasksTable = pgTable("deal_calc_tasks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  dealCalculationId: integer("deal_calculation_id").references(() => dealCalculationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: text("due_date"),
  status: text("status").notNull().default("pending"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDealCalculationSchema = createInsertSchema(dealCalculationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DealCalculation = typeof dealCalculationsTable.$inferSelect;
export type GovernmentBenefitRule = typeof governmentBenefitRulesTable.$inferSelect;
export type CustomerTimelineEvent = typeof customerTimelineEventsTable.$inferSelect;
export type DealCalcTask = typeof dealCalcTasksTable.$inferSelect;
