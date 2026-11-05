import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  uniqueIndex,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { customersTable } from "./customers";
import { usersTable } from "./users";
import type {
  AssistedProgram,
  SubsidyInvoiceKind,
  SubsidyPipelineStatus,
  SubsidyType,
} from "../../adminWorkflowConstants";
import type { SubsidyAcceptanceChecklist } from "../../operationCenterConstants";

/** Company-assisted subsidy pipeline — independent of payment. */
export const subsidyApplicationsTable = pgTable(
  "subsidy_applications",
  {
    id: serial("id").primaryKey(),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrdersTable.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
    /**
     * Handling method:
     * pending_confirmation | not_needed | customer_self_apply | company_assisted
     * Legacy: none
     */
    subsidyType: text("subsidy_type").$type<SubsidyType>().notNull().default("pending_confirmation"),
    /**
     * Only when subsidy_type = company_assisted:
     * new_unit | trade_in | null (unset — do not auto-fill for legacy rows)
     */
    assistedProgram: text("assisted_program").$type<AssistedProgram | null>(),
    /**
     * Invoice kind for customer upload / LINE copy:
     * dual = 二聯式（個人）| triple = 三聯式（公司）| null = unset
     */
    invoiceKind: text("invoice_kind").$type<SubsidyInvoiceKind | null>(),
    /** link_not_sent → … → applied (company_assisted flow) */
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

    /** 行政流程：L夾 / 財政部 / 經濟部 / 驗收 */
    lFolderCreated: boolean("l_folder_created").notNull().default(false),
    lFolderCreatedAt: timestamp("l_folder_created_at", { withTimezone: true }),
    lFolderCreatedBy: integer("l_folder_created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    mofCompleted: boolean("mof_completed").notNull().default(false),
    mofCompletedAt: timestamp("mof_completed_at", { withTimezone: true }),
    mofCompletedBy: integer("mof_completed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    /** 行政開關：本案是否需經濟部補助 */
    moeaRequired: boolean("moea_required").notNull().default(false),
    moeaCompleted: boolean("moea_completed").notNull().default(false),
    moeaCompletedAt: timestamp("moea_completed_at", { withTimezone: true }),
    moeaCompletedBy: integer("moea_completed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    adminLineAlbumCreated: boolean("admin_line_album_created").notNull().default(false),
    adminLineAlbumCreatedAt: timestamp("admin_line_album_created_at", { withTimezone: true }),
    mofScreenshotSaved: boolean("mof_screenshot_saved").notNull().default(false),
    moeaScreenshotSaved: boolean("moea_screenshot_saved").notNull().default(false),
    arAmountConfirmed: boolean("ar_amount_confirmed").notNull().default(false),
    arAmountConfirmedAt: timestamp("ar_amount_confirmed_at", { withTimezone: true }),
    /** 補助完成驗收勾選內容快照 */
    acceptanceChecklist: jsonb("acceptance_checklist").$type<SubsidyAcceptanceChecklist | null>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("subsidy_applications_work_order_uidx").on(t.workOrderId)],
);

export type SubsidyApplication = typeof subsidyApplicationsTable.$inferSelect;
