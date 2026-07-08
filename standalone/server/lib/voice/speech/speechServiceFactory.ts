import type { SpeechService } from "./types.ts";
import { StubSpeechService } from "./stubSpeechService.ts";
import { OpenAiWhisperSpeechService } from "./openaiWhisperSpeechService.ts";

let cached: SpeechService | null = null;

function openAiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

/** Resolved runtime provider id (not just env default). */
export function resolveActiveSpeechProviderId(): string {
  const key = openAiKey();
  const configured = (process.env.VOICE_SPEECH_PROVIDER ?? "").trim().toLowerCase();

  if (key.length > 0) {
    if (
      !configured ||
      configured === "stub" ||
      configured === "openai_whisper" ||
      configured === "openai" ||
      configured === "whisper"
    ) {
      return "openai_whisper";
    }
  }

  if (configured) return configured;
  return key.length > 0 ? "openai_whisper" : "stub";
}

export function getSpeechService(): SpeechService {
  if (cached) return cached;

  const provider = resolveActiveSpeechProviderId();
  const key = openAiKey();

  switch (provider) {
    case "openai_whisper":
    case "openai":
    case "whisper":
      cached = key.length > 0 ? new OpenAiWhisperSpeechService(key) : new StubSpeechService();
      break;
    case "google":
    case "azure":
      cached = new StubSpeechService();
      break;
    default:
      cached = key.length > 0 ? new OpenAiWhisperSpeechService(key) : new StubSpeechService();
  }

  return cached;
}

export function listSpeechProviders(): { id: string; available: boolean; label: string }[] {
  const key = openAiKey();
  const active = resolveActiveSpeechProviderId();
  return [
    { id: "web_speech", available: true, label: "Browser Web Speech (client preview)" },
    {
      id: "openai_whisper",
      available: key.length > 0,
      label: active === "openai_whisper" && key.length > 0 ? "OpenAI Whisper (active)" : "OpenAI Whisper",
    },
    { id: "stub", available: key.length === 0, label: "Stub — set OPENAI_API_KEY for Whisper" },
    { id: "google", available: false, label: "Google Speech (planned)" },
    { id: "azure", available: false, label: "Azure Speech (planned)" },
  ];
}
