import { pgTable, text, serial, integer, timestamp, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { employeesTable } from "./employees";
import { usersTable } from "./users";

export interface QuoteIntentGroupConfig {
  id: string;
  name: string;
  selectionType: "single" | "multiple";
  required: boolean;
}

export interface QuoteCustomerSelectionRecord {
  selectedOptionIds: number[];
  selectedAt: string;
  groups?: Array<{
    groupId: string;
    groupName: string;
    selectedItemIds: number[];
  }>;
  convertedFormalQuoteId?: number | null;
}

export interface QuoteConfirmedSnapshot {
  version: number;
  confirmedAt: string;
  confirmationMethod: "electronic_signature" | "electronic_check";
  agreedTerms: boolean;
  signatureDataUrl?: string | null;
  quoteId: number;
  quoteNumber: string;
  sourceIntentQuoteId?: number | null;
  sourceIntentQuoteNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  salesRepName?: string | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  taxType: string;
  amount: number;
  discountAmount: number;
  finalAmount: number;
  items: Array<{
    id?: number;
    category: string;
    itemName: string;
    brand?: string | null;
    model?: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    installFee?: number;
    subtotal: number;
    notes?: string | null;
    workContent?: string | null;
  }>;
}

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  contactPerson: text("contact_person"),
  title: text("title").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
  finalAmount: numeric("final_amount", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("客戶確認中"),
  lostReason: text("lost_reason"),
  notes: text("notes"),
  address: text("address"),
  customerPhone: text("customer_phone"),
  taxType: text("tax_type").notNull().default("未稅"),
  salesRepId: integer("sales_rep_id").references(() => employeesTable.id, { onDelete: "set null" }),
  dispatchStatus: text("dispatch_status").notNull().default("未派工"),
  /** 'formal' (正式報價單) | 'intent' (意向選擇單) */
  documentType: text("document_type").notNull().default("formal"),
  /** Workflow stage: 草稿 | 已傳送 | 待客戶選擇 | 待客戶確認 | 已確認 | 待安排派工 | 已派工 | 已取消 */
  workflowStage: text("workflow_stage").notNull().default("待客戶確認"),
  sourceIntentQuoteId: integer("source_intent_quote_id"),
  convertedFormalQuoteId: integer("converted_formal_quote_id"),
  intentGroups: jsonb("intent_groups").$type<QuoteIntentGroupConfig[] | null>(),
  customerSelectedAt: timestamp("customer_selected_at", { withTimezone: true }),
  customerSelections: jsonb("customer_selections").$type<QuoteCustomerSelectionRecord | null>(),
  customerConfirmedAt: timestamp("customer_confirmed_at", { withTimezone: true }),
  confirmationMethod: text("confirmation_method"),
  agreedTerms: boolean("agreed_terms").notNull().default(false),
  signatureDataUrl: text("signature_data_url"),
  confirmedVersion: integer("confirmed_version").notNull().default(1),
  confirmedSnapshot: jsonb("confirmed_snapshot").$type<QuoteConfirmedSnapshot | null>(),
  confirmedHtmlSnapshot: text("confirmed_html_snapshot"),
  wonAt: timestamp("won_at", { withTimezone: true }),
  wonBy: integer("won_by").references(() => usersTable.id, { onDelete: "set null" }),
  wonByName: text("won_by_name"),
  winCanceledAt: timestamp("win_canceled_at", { withTimezone: true }),
  winCanceledBy: integer("win_canceled_by").references(() => usersTable.id, { onDelete: "set null" }),
  winCanceledByName: text("win_canceled_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  wonAt: true,
  wonBy: true,
  wonByName: true,
  winCanceledAt: true,
  winCanceledBy: true,
  winCanceledByName: true,
});
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
