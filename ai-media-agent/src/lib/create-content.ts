import type { ContentFormValues } from "@/lib/validation/content-form";
import type { CreateMediaSource } from "@/components/create/MediaSourceTabs";

export interface ContentSubmissionPayload extends ContentFormValues {
  mediaSource: CreateMediaSource;
  fileName: string | null;
}

export type ContentSubmissionAction = "draft" | "process";

const SIMULATED_DELAY_MS = 900;

/**
 * 第一階段先以模擬延遲代表送出流程，尚未串接真正的 AI 處理或後端 API。
 * 之後可將這個函式改為呼叫 Supabase 或後端服務，呼叫端（表單元件）不需修改。
 */
export async function submitContent(
  payload: ContentSubmissionPayload,
  action: ContentSubmissionAction
): Promise<void> {
  void payload;
  void action;
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));
}
