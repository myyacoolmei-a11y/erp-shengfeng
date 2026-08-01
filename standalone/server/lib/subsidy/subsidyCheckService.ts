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
import {
  runSubsidyAiDocumentCheck,
  type SubsidyAiCheckResult,
} from "./subsidyAiCheckService.ts";

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
  basicChecksPassed: boolean;
  aiAvailable: boolean;
  suggestedPipeline: SubsidyPipelineStatus;
  displayStatus: ReturnType<typeof resolveSubsidyDisplayStatus>;
};

function isAllowedDataUrl(fileUrl: string | null | undefined): boolean {
  if (!fileUrl) return false;
  if (fileUrl.startsWith("data:")) {
    const mime = fileUrl.slice(5, fileUrl.indexOf(";")).toLowerCase();
    return (ALLOWED_SUBSIDY_UPLOAD_MIME as readonly string[]).includes(mime);
  }
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

/** Deterministic completeness + format/size checks (no AI claims). */
export function runDeterministicSubsidyCheck(input: {
  subsidyType: SubsidyType;
  assistedProgram?: AssistedProgram | null;
  docs: UploadedDocLike[];
}): {
  missingDocs: SubsidyDocType[];
  missingLabels: string[];
  fileIssues: string[];
  allRequiredPresent: boolean;
  basicChecksPassed: boolean;
} {
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
  const seenNames = new Map<string, string>();

  for (const d of activeDocs) {
    const label =
      (d.docType && SUBSIDY_DOC_TYPE_LABELS[d.docType as SubsidyDocType]) ||
      d.docType ||
      d.fileName ||
      "文件";
    if (!d.fileUrl) {
      fileIssues.push(`${label}：缺少檔案內容`);
      continue;
    }
    if (fileLooksEmpty(d.fileUrl)) {
      fileIssues.push(`${label}：檔案大小為 0 或無法讀取`);
    }
    if (!isAllowedDataUrl(d.fileUrl) && !/^https?:\/\//i.test(d.fileUrl)) {
      fileIssues.push(`${label}：檔案格式不支援`);
    }
    const nameKey = String(d.fileName ?? "").trim().toLowerCase();
    if (nameKey) {
      const prev = seenNames.get(nameKey);
      if (prev && prev !== d.docType) {
        fileIssues.push(`${label}：與「${prev}」檔名相同，疑似重複附件`);
      } else {
        seenNames.set(nameKey, String(d.docType ?? label));
      }
    }
  }

  // Front/back pair: if either id side missing, already in missingDocs
  const allRequiredPresent = missingDocs.length === 0;
  const basicChecksPassed = allRequiredPresent && fileIssues.length === 0;

  return {
    missingDocs,
    missingLabels,
    fileIssues,
    allRequiredPresent,
    basicChecksPassed,
  };
}

/**
 * Full check: deterministic first, then AI interface.
 * AI unavailable / fail → 等待人工確認 (never auto green / fake pass).
 */
export async function runSubsidyCompletenessCheck(input: {
  subsidyType: SubsidyType;
  assistedProgram?: AssistedProgram | null;
  docs: UploadedDocLike[];
  prevMeta?: SubsidyMeta;
}): Promise<CompletenessResult> {
  const det = runDeterministicSubsidyCheck(input);
  let aiTips: string[] = [];
  let needsManualReview = false;
  let aiAvailable = false;
  let aiResult: SubsidyAiCheckResult | null = null;

  if (det.basicChecksPassed) {
    if (input.prevMeta?.manualConfirmedAt) {
      // Admin already confirmed — green path
      needsManualReview = false;
      aiTips = input.prevMeta.aiTips ?? [];
      aiAvailable = true; // treat prior manual confirm as clearance
    } else {
      try {
        aiResult = await runSubsidyAiDocumentCheck(
          input.docs
            .filter((d) => d.status !== "rejected" && d.fileUrl)
            .map((d) => ({
              docType: d.docType,
              fileName: d.fileName,
              fileUrl: d.fileUrl,
            })),
        );
      } catch {
        aiResult = {
          available: false,
          tips: ["AI 檢查失敗，請行政人工確認文件"],
          needsManualReview: true,
        };
      }
      aiAvailable = aiResult.available;
      aiTips = aiResult.tips ?? [];
      if (!aiResult.available) {
        needsManualReview = true;
      } else if (aiResult.needsManualReview || aiResult.passed === false) {
        needsManualReview = true;
      } else {
        needsManualReview = false;
      }
    }
  }

  let suggestedPipeline: SubsidyPipelineStatus;
  if (!det.allRequiredPresent || det.fileIssues.length > 0) {
    suggestedPipeline = "docs_incomplete";
  } else if (needsManualReview) {
    suggestedPipeline = "docs_incomplete";
  } else {
    suggestedPipeline = "docs_complete";
  }

  const displayStatus = resolveSubsidyDisplayStatus({
    subsidyType: input.subsidyType,
    pipeline: suggestedPipeline,
    missingDocs: det.missingDocs,
    needsManualReview,
    assistedProgram: input.assistedProgram,
  });

  return {
    missingDocs: det.missingDocs,
    missingLabels: det.missingLabels,
    fileIssues: det.fileIssues,
    aiTips,
    needsManualReview,
    allRequiredPresent: det.allRequiredPresent,
    basicChecksPassed: det.basicChecksPassed,
    aiAvailable,
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
    aiCheckedAt: check.aiAvailable ? new Date().toISOString() : null,
    lastCheckAt: new Date().toISOString(),
    manualConfirmedAt: check.needsManualReview ? null : prev.manualConfirmedAt,
    manualConfirmedBy: check.needsManualReview ? null : prev.manualConfirmedBy,
  };
  return serializeSubsidyMeta(freeNote, meta);
}

export { parseSubsidyMeta, serializeSubsidyMeta };
