import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { workOrdersTable } from "./workOrders";
import { customersTable } from "./customers";
import { subsidyApplicationsTable } from "./subsidyApplications";
import { usersTable } from "./users";

/** Customer-uploaded / admin-tracked documents for a work order (e.g. subsidy docs). */
export const customerDocumentsTable = pgTable("customer_documents", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  subsidyApplicationId: integer("subsidy_application_id").references(
    () => subsidyApplicationsTable.id,
    { onDelete: "set null" },
  ),
  docType: text("doc_type").notNull().default("subsidy"),
  fileName: text("file_name"),
  fileUrl: text("file_url"),
  /** pending | uploaded | rejected | accepted */
  status: text("status").notNull().default("pending"),
  note: text("note"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CustomerDocument = typeof customerDocumentsTable.$inferSelect;
