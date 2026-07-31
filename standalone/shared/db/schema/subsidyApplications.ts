import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { customersTable } from "./customers";
import { usersTable } from "./users";
import type { SubsidyPipelineStatus, SubsidyType } from "../../adminWorkflowConstants";

/** Company-assisted subsidy pipeline — independent of payment. */
export const subsidyApplicationsTable = pgTable(
  "subsidy_applications",
  {
    id: serial("id").primaryKey(),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrdersTable.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
    /** none | company_assisted */
    subsidyType: text("subsidy_type").$type<SubsidyType>().notNull().default("none"),
    /** link_not_sent → … → applied */
    pipelineStatus: text("pipeline_status")
      .$type<SubsidyPipelineStatus>()
      .notNull()
      .default("link_not_sent"),
    uploadLinkToken: text("upload_link_token"),
    uploadLinkSentAt: timestamp("upload_link_sent_at", { withTimezone: true }),
    uploadLinkSentBy: integer("upload_link_sent_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedBy: integer("applied_by").references(() => usersTable.id, { onDelete: "set null" }),
    note: text("note"),
    /** owner / super_admin may approve close before subsidy applied */
    closeOverrideAt: timestamp("close_override_at", { withTimezone: true }),
    closeOverrideBy: integer("close_override_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    closeOverrideNote: text("close_override_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("subsidy_applications_work_order_uidx").on(t.workOrderId)],
);

export type SubsidyApplication = typeof subsidyApplicationsTable.$inferSelect;
