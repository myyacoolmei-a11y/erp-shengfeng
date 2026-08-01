/**
 * AI document-check interface for subsidy uploads.
 *
 * Phase-2 MVP: no OpenAI Vision wiring. Never fake a "pass".
 * When unavailable, callers must route to 等待人工確認.
 */

export type SubsidyAiDocInput = {
  docType: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  mimeHint?: string | null;
};

export type SubsidyAiCheckResult = {
  /** false → do not treat as AI-reviewed; require admin manual confirm */
  available: boolean;
  /** only meaningful when available === true */
  passed?: boolean;
  tips: string[];
  needsManualReview: boolean;
};

export interface SubsidyAiDocumentChecker {
  readonly name: string;
  checkDocuments(docs: SubsidyAiDocInput[]): Promise<SubsidyAiCheckResult>;
}

/** Stub — Vision not enabled this phase. Never returns available/passed. */
export class UnavailableSubsidyAiChecker implements SubsidyAiDocumentChecker {
  readonly name = "unavailable";

  async checkDocuments(_docs: SubsidyAiDocInput[]): Promise<SubsidyAiCheckResult> {
    return {
      available: false,
      tips: ["AI 影像檢查尚未啟用，請行政人工確認文件"],
      needsManualReview: true,
    };
  }
}

let cached: SubsidyAiDocumentChecker | null = null;

/** Factory — swap to OpenAI Vision checker later without changing callers. */
export function getSubsidyAiDocumentChecker(): SubsidyAiDocumentChecker {
  if (!cached) cached = new UnavailableSubsidyAiChecker();
  return cached;
}

export async function runSubsidyAiDocumentCheck(
  docs: SubsidyAiDocInput[],
): Promise<SubsidyAiCheckResult> {
  return getSubsidyAiDocumentChecker().checkDocuments(docs);
}
