/** Admin post-construction workflow (行政每日工作台). */

export const ADMIN_WORKFLOW_STATUSES = [
  "pending_admin_review",
  "pending_billing",
  "billed",
  "partially_paid",
  "paid",
  "pending_archive",
  "closed",
] as const;

export type AdminWorkflowStatus = (typeof ADMIN_WORKFLOW_STATUSES)[number];

export const ADMIN_WORKFLOW_LABELS: Record<AdminWorkflowStatus, string> = {
  pending_admin_review: "待行政確認",
  pending_billing: "待製作請款",
  billed: "已請款／待收款",
  partially_paid: "部分收款",
  paid: "已收款",
  pending_archive: "待歸檔",
  closed: "已結案",
};

/** Legacy field_progress.workflow_status values → new admin status */
export function normalizeAdminWorkflowStatus(
  value: string | null | undefined,
): AdminWorkflowStatus | null {
  if (!value) return null;
  if (value === "pending_admin") return "pending_admin_review";
  if (value === "admin_done") return "closed";
  if ((ADMIN_WORKFLOW_STATUSES as readonly string[]).includes(value)) {
    return value as AdminWorkflowStatus;
  }
  return null;
}

export const ARCHIVE_CHECKLIST_KEYS = [
  "quote",
  "workOrder",
  "photos",
  "signature",
  "billingDoc",
  "invoice",
  "warranty",
  "subsidy",
] as const;

export type ArchiveChecklistKey = (typeof ARCHIVE_CHECKLIST_KEYS)[number];

export const ARCHIVE_CHECKLIST_LABELS: Record<ArchiveChecklistKey, string> = {
  quote: "報價單",
  workOrder: "派工單",
  photos: "完工照片",
  signature: "客戶簽名",
  billingDoc: "請款單",
  invoice: "發票",
  warranty: "保固書",
  subsidy: "補助資料",
};

export type ArchiveChecklist = Record<ArchiveChecklistKey, boolean>;

export function emptyArchiveChecklist(needsSubsidy: boolean): ArchiveChecklist {
  return {
    quote: false,
    workOrder: false,
    photos: false,
    signature: false,
    billingDoc: false,
    invoice: false,
    warranty: false,
    subsidy: !needsSubsidy,
  };
}

export function isArchiveChecklistComplete(
  c: ArchiveChecklist | null | undefined,
  needsSubsidy: boolean,
): boolean {
  if (!c) return false;
  for (const key of ARCHIVE_CHECKLIST_KEYS) {
    if (key === "subsidy" && !needsSubsidy) continue;
    if (!c[key]) return false;
  }
  return true;
}

export const SUBSIDY_STATUSES = ["未申請補助", "已申請補助"] as const;
export type SubsidyStatus = (typeof SUBSIDY_STATUSES)[number];

export type AdminBillingInfo = {
  extraAmount?: string | null;
  discountAmount?: string | null;
  finalAmount?: string | null;
  invoiceNeeded?: boolean | null;
  billTo?: string | null;
  expectedPaymentDate?: string | null;
};
