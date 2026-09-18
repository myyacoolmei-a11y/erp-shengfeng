import { customFetch } from "../../../../shared/api-client/custom-fetch.ts";
import type { VoiceFormType, VoiceParseResponse, VoiceTranscribeResponse } from "../../../../shared/voice/types.ts";
import { mapVoiceApiError } from "./voiceErrors.ts";

export async function getVoiceProviders(): Promise<{
  speech: { id: string; available: boolean; label: string }[];
  parser: { id: string; available: boolean; label: string }[];
  activeSpeech: string;
  configuredSpeech?: string;
  speechAvailable?: boolean;
  activeParser: string;
}> {
  return customFetch("/api/voice/providers");
}

export async function parseVoiceText(
  text: string,
  formType: VoiceFormType,
  matchProducts = true,
): Promise<VoiceParseResponse> {
  try {
    return await customFetch<VoiceParseResponse>("/api/voice/parse", {
      method: "POST",
      body: JSON.stringify({ text, formType, matchProducts }),
    });
  } catch (err) {
    throw mapVoiceApiError(err);
  }
}

export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType: string,
): Promise<VoiceTranscribeResponse> {
  try {
    return await customFetch<VoiceTranscribeResponse>("/api/voice/transcribe", {
      method: "POST",
      body: JSON.stringify({ audioBase64, mimeType }),
    });
  } catch (err) {
    throw mapVoiceApiError(err);
  }
}

export async function processVoiceInput(opts: {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  formType: VoiceFormType;
  matchProducts?: boolean;
}): Promise<VoiceParseResponse> {
  try {
    return await customFetch<VoiceParseResponse>("/api/voice/process", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  } catch (err) {
    throw mapVoiceApiError(err);
  }
}

export type { VoiceFormType, VoiceParseResponse, ParsedVoiceResult } from "../../../../shared/voice/types.ts";
