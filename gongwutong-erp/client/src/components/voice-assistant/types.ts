import type { ParsedVoiceResult, VoiceFormType } from "../../../../shared/voice/types.ts";

export const VOICE_FORM_LABELS: Record<VoiceFormType, string> = {
  quote: "報價單",
  work_order: "派工單",
  repair_case: "維修案件",
};

export type VoiceAssistantStep =
  | "idle"
  | "recording"
  | "processing"
  | "manual_input"
  | "confirm"
  | "error";

export interface VoiceAssistantApplyPayload {
  formType: VoiceFormType;
  parsed: ParsedVoiceResult;
  transcript: string;
}
