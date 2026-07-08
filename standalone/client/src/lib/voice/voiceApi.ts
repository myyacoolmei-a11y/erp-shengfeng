import { customFetch } from "../../../../shared/api-client/custom-fetch.ts";
import type { VoiceFormType, VoiceParseResponse, VoiceTranscribeResponse } from "../../../../shared/voice/types.ts";

export async function getVoiceProviders(): Promise<{
  speech: { id: string; available: boolean; label: string }[];
  parser: { id: string; available: boolean; label: string }[];
  activeSpeech: string;
  activeParser: string;
}> {
  return customFetch("/api/voice/providers");
}

export async function parseVoiceText(
  text: string,
  formType: VoiceFormType,
  matchProducts = true,
): Promise<VoiceParseResponse> {
  return customFetch<VoiceParseResponse>("/api/voice/parse", {
    method: "POST",
    body: JSON.stringify({ text, formType, matchProducts }),
  });
}

export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType: string,
): Promise<VoiceTranscribeResponse> {
  return customFetch<VoiceTranscribeResponse>("/api/voice/transcribe", {
    method: "POST",
    body: JSON.stringify({ audioBase64, mimeType }),
  });
}

export async function processVoiceInput(opts: {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  formType: VoiceFormType;
  matchProducts?: boolean;
}): Promise<VoiceParseResponse> {
  return customFetch<VoiceParseResponse>("/api/voice/process", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export type { VoiceFormType, VoiceParseResponse, ParsedVoiceResult } from "../../../../shared/voice/types.ts";
