/**
 * Company-assisted subsidy document checklist + display helpers.
 * Document requirements are centralized here — do not hardcode lists in pages.
 */

import type {
  SubsidyInvoiceKind,
  SubsidyPipelineStatus,
  SubsidyType,
} from "./adminWorkflowConstants.ts";
import {
  SUBSIDY_PIPELINE_LABELS,
  SUBSIDY_TYPE_LABELS,
} from "./adminWorkflowConstants.ts";

/**
 * 客戶需上傳的補助資料由「發票類型」決定，行政不再選補助種類。
 * 發票／保固書一律不向客戶收取（二聯／三聯皆隱藏）。
 */
export const BASE_REQUIRED_DOC_TYPES = [
  "id_front",
  "id_back",
  "bank_book",
] as const;

/** 三聯式（公司）：身分證正反面 + 存摺封面 */
export const TRIPLE_REQUIRED_DOC_TYPES = BASE_REQUIRED_DOC_TYPES;

/** 二聯式（個人）：三聯式清單 + 電費單 */
export const DUAL_REQUIRED_DOC_TYPES = [
  ...BASE_REQUIRED_DOC_TYPES,
  "utility_bill",
] as const;

/** All uploadable subsidy doc types (union). */
export const ALL_SUBSIDY_DOC_TYPES = [
  "id_front",
  "id_back",
  "invoice",
  "warranty",
  "bank_book",
  "utility_bill",
  "scrap_recycle_form",
] as const;

export type SubsidyDocType = (typeof ALL_SUBSIDY_DOC_TYPES)[number];

/**
 * @deprecated Prefer requiredDocTypesForAssistedProgram.
 * Kept as the full union for upload-type allowlists.
 */
export const COMPANY_ASSISTED_REQUIRED_DOC_TYPES = ALL_SUBSIDY_DOC_TYPES;

export const SUBSIDY_DOC_TYPE_LABELS: Record<SubsidyDocType, string> = {
  id_front: "身分證正面",
  id_back: "身分證反面",
  invoice: "發票",
  warranty: "保固書",
  bank_book: "客戶帳戶／存摺封面",
  utility_bill: "電費單",
  scrap_recycle_form: "廢四機回收聯單",
};

export const ALLOWED_SUBSIDY_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export type SubsidyDisplayStatus =
  | "pending_confirmation"
  | "not_needed"
  | "customer_self_apply"
  | "not_applicable"
  | "awaiting_invoice_kind"
  | "link_not_sent"
  | "awaiting_upload"
  | "docs_incomplete"
  | "awaiting_manual_review"
  | "docs_complete"
  | "applied"
  | "no_record";

export const SUBSIDY_DISPLAY_LABELS: Record<SubsidyDisplayStatus, string> = {
  pending_confirmation: "待確認補助方式",
  not_needed: "不需申請",
  customer_self_apply: "客戶自行申請",
  not_applicable: "不適用補助",
  no_record: "尚無補助紀錄",
  awaiting_invoice_kind: "待選發票類型",
  link_not_sent: "待傳送補助資料連結",
  awaiting_upload: "等待客戶上傳補助資料",
  docs_incomplete: "客戶資料待補件",
  awaiting_manual_review: "等待人工確認",
  docs_complete: "補助資料已齊，可進行申請",
  applied: "補助已完成",
};

/** Tailwind badge classes — reuse existing palette tokens. */
export const SUBSIDY_DISPLAY_COLORS: Record<SubsidyDisplayStatus, string> = {
  pending_confirmation: "bg-gray-100 text-gray-600",
  not_needed: "bg-gray-100 text-gray-600",
  customer_self_apply: "bg-slate-100 text-slate-700",
  not_applicable: "bg-gray-100 text-gray-600",
  no_record: "bg-gray-50 text-gray-500",
  awaiting_invoice_kind: "bg-gray-100 text-gray-600",
  link_not_sent: "bg-gray-100 text-gray-600",
  awaiting_upload: "bg-blue-100 text-blue-700",
  docs_incomplete: "bg-orange-100 text-orange-800",
  awaiting_manual_review: "bg-yellow-100 text-yellow-800",
  docs_complete: "bg-green-100 text-green-800",
  applied: "bg-emerald-200 text-emerald-900",
};

export type SubsidyMeta = {
  needsManualReview?: boolean;
  aiTips?: string[];
  aiCheckedAt?: string | null;
  manualConfirmedAt?: string | null;
  manualConfirmedBy?: number | null;
  lastCheckAt?: string | null;
};

const META_PREFIX = "SF_SUBSIDY_META:";

export function parseSubsidyMeta(note: string | null | undefined): {
  meta: SubsidyMeta;
  freeNote: string;
} {
  const raw = String(note ?? "");
  const idx = raw.indexOf(META_PREFIX);
  if (idx < 0) return { meta: {}, freeNote: raw };
  const before = raw.slice(0, idx).trim();
  const jsonPart = raw.slice(idx + META_PREFIX.length).trim();
  try {
    const meta = JSON.parse(jsonPart) as SubsidyMeta;
    return { meta: meta && typeof meta === "object" ? meta : {}, freeNote: before };
  } catch {
    return { meta: {}, freeNote: raw };
  }
}

export function serializeSubsidyMeta(freeNote: string, meta: SubsidyMeta): string {
  const base = freeNote.trim();
  const payload = `${META_PREFIX}${JSON.stringify(meta)}`;
  return base ? `${base}\n${payload}` : payload;
}

/** 必備文件只看發票類型；尚未選擇時不計缺件。 */
export function requiredDocTypesForInvoiceKind(
  invoiceKind: SubsidyInvoiceKind | null | undefined,
): SubsidyDocType[] {
  if (invoiceKind === "triple") return [...TRIPLE_REQUIRED_DOC_TYPES];
  if (invoiceKind === "dual") return [...DUAL_REQUIRED_DOC_TYPES];
  return [];
}

export function missingRequiredDocs(
  invoiceKind: SubsidyInvoiceKind | null | undefined,
  uploadedDocTypes: Array<string | null | undefined>,
): SubsidyDocType[] {
  const required = requiredDocTypesForInvoiceKind(invoiceKind);
  const have = new Set(
    uploadedDocTypes
      .map((t) => String(t ?? "").trim())
      .filter(Boolean),
  );
  return required.filter((t) => !have.has(t));
}

/**
 * 補助顯示狀態。
 *
 * 除了「補助已完成」是由 pipeline_status = applied 決定之外，其餘一律依實際
 * 上傳份數與缺件清單計算，不再讓舊的 pipeline_status（docs_complete /
 * pending_apply 等）直接決定「資料已齊」。
 */
export function resolveSubsidyDisplayStatus(input: {
  subsidyType: SubsidyType | null | undefined;
  pipeline: SubsidyPipelineStatus | null | undefined;
  invoiceKind: SubsidyInvoiceKind | null | undefined;
  missingDocs: string[];
  uploadedDocCount: number;
  needsManualReview?: boolean;
}): SubsidyDisplayStatus {
  if (input.pipeline === "applied") return "applied";

  if (!input.subsidyType) return "no_record";
  // legacy 舊案件保留原顯示；新案件一律走補助流程
  if (input.subsidyType === "not_needed") return "not_needed";
  if (input.subsidyType === "customer_self_apply") return "customer_self_apply";
  if (input.subsidyType === "none") return "not_applicable";

  // 還沒選發票類型就不知道要收哪些資料，也還沒有上傳網址
  if (!input.invoiceKind) return "awaiting_invoice_kind";

  if (input.uploadedDocCount <= 0) return "awaiting_upload";
  if (input.missingDocs.length > 0) return "docs_incomplete";
  if (input.needsManualReview) return "awaiting_manual_review";
  return "docs_complete";
}

/** Combined label for receivables / cards — pipeline only, no 補助種類. */
export function subsidyCombinedStatusLabel(input: {
  displayStatus: SubsidyDisplayStatus;
  pipeline?: SubsidyPipelineStatus | null;
}): string {
  const { displayStatus, pipeline } = input;
  if (displayStatus === "docs_complete" && pipeline === "pending_apply") {
    return "補助資料已齊，可進行申請";
  }
  return SUBSIDY_DISPLAY_LABELS[displayStatus];
}

export function subsidyDisplayLabel(
  status: SubsidyDisplayStatus,
  pipeline?: SubsidyPipelineStatus | null,
): string {
  if (status === "docs_complete" && pipeline === "pending_apply") {
    return "補助資料已齊，可進行申請";
  }
  return SUBSIDY_DISPLAY_LABELS[status];
}

export function pipelineLabel(pipeline: SubsidyPipelineStatus | null | undefined): string {
  if (!pipeline) return "—";
  return SUBSIDY_PIPELINE_LABELS[pipeline] ?? pipeline;
}

export function typeLabel(t: SubsidyType | null | undefined): string {
  if (!t) return "尚無補助紀錄";
  return SUBSIDY_TYPE_LABELS[t] ?? t;
}

/** Map pipeline → legacy receivables Chinese field (shared source of truth is pipeline). */
export function pipelineToReceivableSubsidyStatus(
  pipeline: SubsidyPipelineStatus | null | undefined,
): "未申請補助" | "已申請補助" {
  return pipeline === "applied" ? "已申請補助" : "未申請補助";
}

export const SUBSIDY_UPLOAD_TOKEN_TTL_DAYS = 30;
