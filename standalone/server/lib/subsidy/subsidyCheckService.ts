import {
  ALLOWED_SUBSIDY_UPLOAD_MIME,
  SUBSIDY_DOC_TYPE_LABELS,
  missingRequiredDocs,
  parseSubsidyMeta,
  resolveSubsidyDisplayStatus,
  serializeSubsidyMeta,
  type SubsidyDocType,
  type SubsidyMeta,
} from "../../../shared/subsidyDocs.ts";
import type {
  AssistedProgram,
  SubsidyPipelineStatus,
  SubsidyType,
} from "../../../shared/adminWorkflowConstants.ts";

export type UploadedDocLike = {
  docType: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  status?: string | null;
  note?: string | null;
};

export type CompletenessResult = {
  missingDocs: SubsidyDocType[];
  missingLabels: string[];
  fileIssues: string[];
  aiTips: string[];
  needsManualReview: boolean;
  allRequiredPresent: boolean;
  suggestedPipeline: SubsidyPipelineStatus;
  displayStatus: ReturnType<typeof resolveSubsidyDisplayStatus>;
};

function isAllowedDataUrl(fileUrl: string | null | undefined): boolean {
  if (!fileUrl) return false;
  if (fileUrl.startsWith("data:")) {
    const mime = fileUrl.slice(5, fileUrl.indexOf(";")).toLowerCase();
    return (ALLOWED_SUBSIDY_UPLOAD_MIME as readonly string[]).includes(mime);
  }
  // http(s) urls accepted as present
  return /^https?:\/\//i.test(fileUrl);
}

function fileLooksEmpty(fileUrl: string | null | undefined): boolean {
  if (!fileUrl) return true;
  if (fileUrl.startsWith("data:")) {
    const b64 = fileUrl.split(",")[1] ?? "";
    return b64.length < 32;
  }
  return false;
}

/** Deterministic checks + lightweight heuristic "AI" tips (no external API required). */
export function runSubsidyCompletenessCheck(input: {
  subsidyType: SubsidyType;
  assistedProgram?: AssistedProgram | null;
  docs: UploadedDocLike[];
  prevMeta?: SubsidyMeta;
}): CompletenessResult {
  const activeDocs = input.docs.filter(
    (d) => d.status !== "rejected" && (d.fileUrl || d.fileName),
  );
  const missingDocs = missingRequiredDocs(
    input.subsidyType,
    activeDocs.map((d) => d.docType),
    input.assistedProgram,
  );
  const missingLabels = missingDocs.map((t) => SUBSIDY_DOC_TYPE_LABELS[t] ?? t);

  const fileIssues: string[] = [];
  const aiTips: string[] = [];

  for (const d of activeDocs) {
    const label = d.docType || d.fileName || "文件";
    if (!d.fileUrl) {
      fileIssues.push(`${label}：缺少檔案內容`);
      continue;
    }
    if (fileLooksEmpty(d.fileUrl)) {
      fileIssues.push(`${label}：檔案似乎為空`);
    }
    if (!isAllowedDataUrl(d.fileUrl) && !/^https?:\/\//i.test(d.fileUrl)) {
      fileIssues.push(`${label}：檔案格式不支援`);
    }
    // Heuristic readability tips (stand-in when external AI unavailable)
    if (d.fileUrl.startsWith("data:image/") && fileLooksEmpty(d.fileUrl) === false) {
      const b64 = d.fileUrl.split(",")[1] ?? "";
      if (b64.length < 8000) {
        aiTips.push(`${label}：檔案偏小，可能過於模糊或解析度不足，建議人工確認`);
      }
    }
    if (d.fileUrl.startsWith("data:application/pdf")) {
      const b64 = d.fileUrl.split(",")[1] ?? "";
      if (b64.length < 500) {
        aiTips.push(`${label}：PDF 內容異常偏短，建議人工確認`);
      }
    }
  }

  const allRequiredPresent = missingDocs.length === 0 && fileIssues.length === 0;
  let needsManualReview = false;

  if (allRequiredPresent && aiTips.length > 0) {
    needsManualReview = true;
  }

  // If previous manual confirm exists and docs still complete, clear review need
  if (allRequiredPresent && input.prevMeta?.manualConfirmedAt && aiTips.length === 0) {
    needsManualReview = false;
  }
  if (allRequiredPresent && input.prevMeta?.manualConfirmedAt && aiTips.length > 0) {
    // admin already confirmed after AI tips — treat as complete
    needsManualReview = false;
  }

  // External AI unavailable → never auto-mark complete when tips exist; already handled.
  // If somehow check throws upstream, caller sets needsManualReview.

  let suggestedPipeline: SubsidyPipelineStatus;
  if (!allRequiredPresent) {
    suggestedPipeline = "docs_incomplete";
  } else if (needsManualReview) {
    suggestedPipeline = "docs_incomplete";
  } else {
    suggestedPipeline = "docs_complete";
  }

  const displayStatus = resolveSubsidyDisplayStatus({
    subsidyType: input.subsidyType,
    pipeline: suggestedPipeline,
    missingDocs,
    needsManualReview,
    assistedProgram: input.assistedProgram,
  });

  return {
    missingDocs,
    missingLabels,
    fileIssues,
    aiTips,
    needsManualReview,
    allRequiredPresent,
    suggestedPipeline,
    displayStatus,
  };
}

export function mergeMetaAfterCheck(
  freeNote: string,
  prev: SubsidyMeta,
  check: CompletenessResult,
): string {
  const meta: SubsidyMeta = {
    ...prev,
    needsManualReview: check.needsManualReview,
    aiTips: check.aiTips,
    aiCheckedAt: new Date().toISOString(),
    lastCheckAt: new Date().toISOString(),
    // keep manualConfirmedAt if still valid
    manualConfirmedAt: check.needsManualReview ? null : prev.manualConfirmedAt,
    manualConfirmedBy: check.needsManualReview ? null : prev.manualConfirmedBy,
  };
  return serializeSubsidyMeta(freeNote, meta);
}

export { parseSubsidyMeta, serializeSubsidyMeta };
