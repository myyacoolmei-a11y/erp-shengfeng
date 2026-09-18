/**
 * 營運中心（Owner / Super Admin）流程標籤與補助驗收 Checklist 定義。
 * 不影響工程師／行政日常工具，僅主管驗收與追蹤。
 */

/** 案件流程進度點（主管一眼看卡在哪） */
export const CASE_PROGRESS_STEPS = [
  "dispatched",
  "field_completed",
  "l_folder",
  "customer_docs",
  "mof",
  "moea",
  "subsidy_done",
  "billing",
  "paid",
  "closed",
] as const;
export type CaseProgressStep = (typeof CASE_PROGRESS_STEPS)[number];

export const CASE_PROGRESS_LABELS: Record<CaseProgressStep, string> = {
  dispatched: "派工完成",
  field_completed: "施工完成",
  l_folder: "L夾完成",
  customer_docs: "客戶資料完成",
  mof: "財政部完成",
  moea: "經濟部完成",
  subsidy_done: "補助完成",
  billing: "待請款",
  paid: "已收款",
  closed: "已結案",
};

export type ProgressTone = "done" | "current" | "pending" | "skipped";

/** 補助完成驗收 Checklist（全勾才能標記補助完成） */
export const SUBSIDY_ACCEPTANCE_KEYS = [
  "mofCompleted",
  "moeaCompleted",
  "lFolderCreated",
  "adminLineAlbumCreated",
  "mofScreenshotSaved",
  "moeaScreenshotSaved",
  "arAmountConfirmed",
] as const;
export type SubsidyAcceptanceKey = (typeof SUBSIDY_ACCEPTANCE_KEYS)[number];

export type SubsidyAcceptanceChecklist = Record<SubsidyAcceptanceKey, boolean>;

export const SUBSIDY_ACCEPTANCE_LABELS: Record<SubsidyAcceptanceKey, string> = {
  mofCompleted: "財政部補助已完成",
  moeaCompleted: "經濟部補助已完成（符合資格案件）",
  lFolderCreated: "L夾已整理完成",
  adminLineAlbumCreated: "行政LINE群組相簿已建立",
  mofScreenshotSaved: "財政部成功截圖已保存",
  moeaScreenshotSaved: "經濟部成功截圖已保存（如有）",
  arAmountConfirmed: "應收帳款請款金額已確認",
};

export function emptySubsidyAcceptanceChecklist(): SubsidyAcceptanceChecklist {
  return {
    mofCompleted: false,
    moeaCompleted: false,
    lFolderCreated: false,
    adminLineAlbumCreated: false,
    mofScreenshotSaved: false,
    moeaScreenshotSaved: false,
    arAmountConfirmed: false,
  };
}

/** 依「是否需經濟部」決定必勾項目 */
export function requiredSubsidyAcceptanceKeys(moeaRequired: boolean): SubsidyAcceptanceKey[] {
  if (moeaRequired) return [...SUBSIDY_ACCEPTANCE_KEYS];
  return SUBSIDY_ACCEPTANCE_KEYS.filter(
    (k) => k !== "moeaCompleted" && k !== "moeaScreenshotSaved",
  );
}

export function missingSubsidyAcceptanceKeys(
  checklist: Partial<SubsidyAcceptanceChecklist> | null | undefined,
  moeaRequired: boolean,
): SubsidyAcceptanceKey[] {
  const c = checklist ?? emptySubsidyAcceptanceChecklist();
  return requiredSubsidyAcceptanceKeys(moeaRequired).filter((k) => !c[k]);
}

/** 工程部 bucket ids */
export const ENGINEERING_BUCKETS = [
  "today_dispatched",
  "en_route",
  "arrived",
  "paused",
  "field_completed",
  "today_incomplete",
  "process_violation",
] as const;
export type EngineeringBucket = (typeof ENGINEERING_BUCKETS)[number];

export const ENGINEERING_BUCKET_LABELS: Record<EngineeringBucket, string> = {
  today_dispatched: "今日派工",
  en_route: "已出發",
  arrived: "已到場",
  paused: "暫停施工",
  field_completed: "已施工完成",
  today_incomplete: "今日未完成案件",
  process_violation: "未依流程操作案件",
};

/** 行政部 bucket ids */
export const ADMIN_BUCKETS = [
  "l_folder_pending",
  "l_folder_done",
  "awaiting_customer_upload",
  "docs_complete",
  "mof_pending",
  "moea_pending",
  "subsidy_pending_confirm",
  "subsidy_done",
] as const;
export type AdminBucket = (typeof ADMIN_BUCKETS)[number];

export const ADMIN_BUCKET_LABELS: Record<AdminBucket, string> = {
  l_folder_pending: "L夾未建立",
  l_folder_done: "L夾已建立",
  awaiting_customer_upload: "等待客戶上傳資料",
  docs_complete: "客戶資料已齊",
  mof_pending: "財政部待申請",
  moea_pending: "經濟部待申請",
  subsidy_pending_confirm: "補助待完成確認",
  subsidy_done: "已完成補助",
};

/** 業務部 bucket ids（對應應收／結案） */
export const SALES_BUCKETS = [
  "pending_billing",
  "billed",
  "paid",
  "closed",
  "overdue_unbilled",
] as const;
export type SalesBucket = (typeof SALES_BUCKETS)[number];

export const SALES_BUCKET_LABELS: Record<SalesBucket, string> = {
  pending_billing: "待請款",
  billed: "已請款",
  paid: "已收款",
  closed: "已結案",
  overdue_unbilled: "超過 7 天未請款案件",
};

export const OVERDUE_UNBILLED_DAYS = 7;
