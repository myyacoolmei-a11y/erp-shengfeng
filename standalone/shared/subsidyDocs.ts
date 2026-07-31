/**
 * Company-assisted subsidy document checklist + display helpers.
 * Uses existing pipeline statuses — does NOT add DB enum values.
 */

import type { SubsidyPipelineStatus, SubsidyType } from "./adminWorkflowConstants.ts";
import { SUBSIDY_PIPELINE_LABELS, SUBSIDY_TYPE_LABELS } from "./adminWorkflowConstants.ts";

/** Doc types for company_assisted cases (business default). */
export const COMPANY_ASSISTED_REQUIRED_DOC_TYPES = [
  "id_front",
  "id_back",
  "utility_bill",
  "invoice",
  "warranty",
  "bank_book",
] as const;

export type SubsidyDocType = (typeof COMPANY_ASSISTED_REQUIRED_DOC_TYPES)[number];

export const SUBSIDY_DOC_TYPE_LABELS: Record<SubsidyDocType, string> = {
  id_front: "身分證正面",
  id_back: "身分證反面",
  utility_bill: "電費單",
  invoice: "發票",
  warranty: "保固書",
  bank_book: "客戶帳戶／存摺封面",
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
  | "not_applicable"
  | "link_not_sent"
  | "awaiting_upload"
  | "docs_incomplete"
  | "awaiting_manual_review"
  | "docs_complete"
  | "applied";

export const SUBSIDY_DISPLAY_LABELS: Record<SubsidyDisplayStatus, string> = {
  not_applicable: "不適用補助",
  link_not_sent: "待傳送上傳網址",
  awaiting_upload: "等待客戶上傳",
  docs_incomplete: "資料不完整",
  awaiting_manual_review: "等待人工確認",
  docs_complete: "補助資料完整",
  applied: "補助申請已完成",
};

/** Tailwind badge classes — reuse existing palette tokens. */
export const SUBSIDY_DISPLAY_COLORS: Record<SubsidyDisplayStatus, string> = {
  not_applicable: "bg-gray-100 text-gray-600",
  link_not_sent: "bg-gray-100 text-gray-700",
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

export function requiredDocTypesForSubsidy(subsidyType: SubsidyType | null | undefined): SubsidyDocType[] {
  if (subsidyType === "company_assisted") {
    return [...COMPANY_ASSISTED_REQUIRED_DOC_TYPES];
  }
  return [];
}

export function missingRequiredDocs(
  subsidyType: SubsidyType | null | undefined,
  uploadedDocTypes: Array<string | null | undefined>,
): SubsidyDocType[] {
  const required = requiredDocTypesForSubsidy(subsidyType);
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
}): SubsidyDisplayStatus {
  if (!input.subsidyType || input.subsidyType === "none") return "not_applicable";
  if (input.pipeline === "applied") return "applied";
  if (input.pipeline === "link_not_sent" || !input.pipeline) return "link_not_sent";
  if (input.pipeline === "awaiting_upload") return "awaiting_upload";
  if (input.pipeline === "docs_complete" || input.pipeline === "pending_apply") {
    return "docs_complete";
  }
  // docs_incomplete (or unknown)
  if (input.needsManualReview && input.missingDocs.length === 0) {
    return "awaiting_manual_review";
  }
  return "docs_incomplete";
}

export function subsidyDisplayLabel(
  status: SubsidyDisplayStatus,
  pipeline?: SubsidyPipelineStatus | null,
): string {
  if (status === "docs_complete" && pipeline === "pending_apply") {
    return "補助資料完整（可申請）";
  }
  return SUBSIDY_DISPLAY_LABELS[status];
}

export function pipelineLabel(pipeline: SubsidyPipelineStatus | null | undefined): string {
  if (!pipeline) return "—";
  return SUBSIDY_PIPELINE_LABELS[pipeline] ?? pipeline;
}

export function typeLabel(t: SubsidyType | null | undefined): string {
  if (!t) return SUBSIDY_TYPE_LABELS.none;
  return SUBSIDY_TYPE_LABELS[t] ?? t;
}

/** Map pipeline → legacy receivables Chinese field (shared source of truth is pipeline). */
export function pipelineToReceivableSubsidyStatus(
  pipeline: SubsidyPipelineStatus | null | undefined,
): "未申請補助" | "已申請補助" {
  return pipeline === "applied" ? "已申請補助" : "未申請補助";
}

export const SUBSIDY_UPLOAD_TOKEN_TTL_DAYS = 30;
