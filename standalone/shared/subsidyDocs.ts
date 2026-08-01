/**
 * Company-assisted subsidy document checklist + display helpers.
 * Document requirements are centralized here — do not hardcode lists in pages.
 */

import type {
  AssistedProgram,
  SubsidyPipelineStatus,
  SubsidyType,
} from "./adminWorkflowConstants.ts";
import {
  ASSISTED_PROGRAM_LABELS,
  SUBSIDY_PIPELINE_LABELS,
  SUBSIDY_TYPE_LABELS,
} from "./adminWorkflowConstants.ts";

/** Common required docs for 新機補助 (no utility bill / scrap form). */
export const NEW_UNIT_REQUIRED_DOC_TYPES = [
  "id_front",
  "id_back",
  "invoice",
  "warranty",
  "bank_book",
] as const;

/** 舊換新 = 新機共通 + 電費單 + 廢四機回收聯單 */
export const TRADE_IN_REQUIRED_DOC_TYPES = [
  ...NEW_UNIT_REQUIRED_DOC_TYPES,
  "utility_bill",
  "scrap_recycle_form",
] as const;

/** 新機＋舊換新：文件需求與舊換新相同（共通＋電費單＋回收聯單） */
export const NEW_UNIT_AND_TRADE_IN_REQUIRED_DOC_TYPES = TRADE_IN_REQUIRED_DOC_TYPES;

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
  link_not_sent: "待傳送補助資料連結",
  awaiting_upload: "等待客戶上傳",
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

export function requiredDocTypesForAssistedProgram(
  program: AssistedProgram | null | undefined,
): SubsidyDocType[] {
  if (program === "trade_in" || program === "new_unit_and_trade_in") {
    return [...TRADE_IN_REQUIRED_DOC_TYPES];
  }
  if (program === "new_unit") return [...NEW_UNIT_REQUIRED_DOC_TYPES];
  // company_assisted without program yet — no checklist until admin selects
  return [];
}

export function requiredDocTypesForSubsidy(
  subsidyType: SubsidyType | null | undefined,
  assistedProgram?: AssistedProgram | null,
): SubsidyDocType[] {
  if (subsidyType !== "company_assisted") return [];
  return requiredDocTypesForAssistedProgram(assistedProgram);
}

export function missingRequiredDocs(
  subsidyType: SubsidyType | null | undefined,
  uploadedDocTypes: Array<string | null | undefined>,
  assistedProgram?: AssistedProgram | null,
): SubsidyDocType[] {
  const required = requiredDocTypesForSubsidy(subsidyType, assistedProgram);
  const have = new Set(
    uploadedDocTypes
      .map((t) => String(t ?? "").trim())
      .filter(Boolean),
  );
  return required.filter((t) => !have.has(t));
}

export function resolveSubsidyDisplayStatus(input: {
  subsidyType: SubsidyType | null | undefined;
  pipeline: SubsidyPipelineStatus | null | undefined;
  missingDocs: string[];
  needsManualReview?: boolean;
  assistedProgram?: AssistedProgram | null;
}): SubsidyDisplayStatus {
  if (!input.subsidyType) return "no_record";
  if (input.subsidyType === "pending_confirmation") return "pending_confirmation";
  if (input.subsidyType === "not_needed") return "not_needed";
  if (input.subsidyType === "customer_self_apply") return "customer_self_apply";
  if (input.subsidyType === "none") return "not_applicable";

  // company_assisted — pipeline drives status
  if (input.pipeline === "applied") return "applied";
  if (input.pipeline === "link_not_sent" || !input.pipeline) return "link_not_sent";
  if (input.pipeline === "awaiting_upload") return "awaiting_upload";
  if (input.pipeline === "docs_complete" || input.pipeline === "pending_apply") {
    return "docs_complete";
  }
  if (input.needsManualReview && input.missingDocs.length === 0) {
    return "awaiting_manual_review";
  }
  return "docs_incomplete";
}

/** Combined label for receivables / cards: handling + program + pipeline. */
export function subsidyCombinedStatusLabel(input: {
  subsidyType: SubsidyType | null | undefined;
  assistedProgram?: AssistedProgram | null;
  displayStatus: SubsidyDisplayStatus;
  pipeline?: SubsidyPipelineStatus | null;
}): string {
  const { subsidyType, assistedProgram, displayStatus, pipeline } = input;
  if (subsidyType === "company_assisted") {
    const prog =
      assistedProgram != null ? ASSISTED_PROGRAM_LABELS[assistedProgram] : null;
    if (displayStatus === "applied") {
      return "補助已完成";
    }
    if (displayStatus === "docs_complete") {
      return prog
        ? `公司協助－${prog}｜補助資料已齊`
        : "補助資料已齊，可進行申請";
    }
    if (displayStatus === "link_not_sent") {
      return prog ? `公司協助－${prog}｜待傳送連結` : "待傳送補助資料連結";
    }
    if (displayStatus === "awaiting_upload") {
      return prog ? `公司協助－${prog}｜等待客戶上傳` : "等待客戶上傳";
    }
    if (displayStatus === "docs_incomplete") {
      return prog ? `公司協助－${prog}｜待補件` : "客戶資料待補件";
    }
    if (displayStatus === "awaiting_manual_review") {
      return prog ? `公司協助－${prog}｜等待人工確認` : "等待人工確認";
    }
    return prog ? `公司協助－${prog}` : SUBSIDY_TYPE_LABELS.company_assisted;
  }
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
