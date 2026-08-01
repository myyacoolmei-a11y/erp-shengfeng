/** Admin daily workbench — construction confirm / AR / subsidy / close (no warranty). */

export const ADMIN_WORKFLOW_STATUSES = [
  "pending_admin_review",
  "pending_billing",
  "billed",
  "partially_paid",
  "paid",
  "pending_close",
  "closed",
] as const;

export type AdminWorkflowStatus = (typeof ADMIN_WORKFLOW_STATUSES)[number];

export const ADMIN_WORKFLOW_LABELS: Record<AdminWorkflowStatus, string> = {
  pending_admin_review: "待確認施工資料",
  pending_billing: "待建立應收帳款",
  billed: "待收款",
  partially_paid: "部分收款",
  paid: "已收款",
  pending_close: "已收款／待結案",
  closed: "已結案",
};

/** Legacy values from earlier admin workbench */
export function normalizeAdminWorkflowStatus(
  value: string | null | undefined,
): AdminWorkflowStatus | null {
  if (!value) return null;
  if (value === "pending_admin") return "pending_admin_review";
  if (value === "pending_archive") return "pending_close";
  if (value === "admin_done") return "closed";
  if ((ADMIN_WORKFLOW_STATUSES as readonly string[]).includes(value)) {
    return value as AdminWorkflowStatus;
  }
  return null;
}

/**
 * Subsidy handling method (subsidy_applications.subsidy_type).
 * Legacy `none` kept for DB compatibility — do not use for new completions.
 */
export const SUBSIDY_TYPES = [
  "pending_confirmation",
  "not_needed",
  "customer_self_apply",
  "company_assisted",
  "none",
] as const;
export type SubsidyType = (typeof SUBSIDY_TYPES)[number];

export const SUBSIDY_TYPE_LABELS: Record<SubsidyType, string> = {
  pending_confirmation: "待確認補助方式",
  not_needed: "不需申請",
  customer_self_apply: "客戶自行申請",
  company_assisted: "公司協助申請",
  none: "不適用補助", // legacy only
};

/** Company-assisted program — only when subsidy_type = company_assisted. Nullable. */
export const ASSISTED_PROGRAMS = ["new_unit", "trade_in", "new_unit_and_trade_in"] as const;
export type AssistedProgram = (typeof ASSISTED_PROGRAMS)[number];

export const ASSISTED_PROGRAM_LABELS: Record<AssistedProgram, string> = {
  new_unit: "新機補助",
  trade_in: "舊換新補助",
  new_unit_and_trade_in: "新機＋舊換新補助",
};

export function normalizeSubsidyType(value: string | null | undefined): SubsidyType | null {
  if (!value) return null;
  if ((SUBSIDY_TYPES as readonly string[]).includes(value)) return value as SubsidyType;
  return null;
}

export function normalizeAssistedProgram(
  value: string | null | undefined,
): AssistedProgram | null {
  if (!value) return null;
  if ((ASSISTED_PROGRAMS as readonly string[]).includes(value)) return value as AssistedProgram;
  return null;
}

/** Independent of payment status */
export const SUBSIDY_PIPELINE_STATUSES = [
  "link_not_sent",
  "awaiting_upload",
  "docs_incomplete",
  "docs_complete",
  "pending_apply",
  "applied",
] as const;

export type SubsidyPipelineStatus = (typeof SUBSIDY_PIPELINE_STATUSES)[number];

export const SUBSIDY_PIPELINE_LABELS: Record<SubsidyPipelineStatus, string> = {
  link_not_sent: "待傳送補助資料連結",
  awaiting_upload: "等待客戶上傳",
  docs_incomplete: "客戶資料待補件",
  docs_complete: "補助資料已齊",
  pending_apply: "待申請補助",
  applied: "補助已完成",
};

export type AdminBillingInfo = {
  extraAmount?: string | null;
  discountAmount?: string | null;
  finalAmount?: string | null;
  invoiceNeeded?: boolean | null;
  billTo?: string | null;
  expectedPaymentDate?: string | null;
};

export type EngineeringStatus = "pending_confirm" | "confirmed";
export type ReceivableCardStatus =
  | "not_created"
  | "no_due_date"
  | "unpaid"
  | "partial"
  | "paid";

export function engineeringStatusLabel(s: EngineeringStatus): string {
  return s === "confirmed" ? "施工資料已確認" : "待確認施工資料";
}

export function receivableStatusLabel(s: ReceivableCardStatus): string {
  switch (s) {
    case "not_created":
      return "尚未建立應收";
    case "no_due_date":
      return "未設定收款日";
    case "unpaid":
      return "待收款";
    case "partial":
      return "部分收款";
    case "paid":
      return "已收款";
  }
}
