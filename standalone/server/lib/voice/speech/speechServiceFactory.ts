import type { SpeechService } from "./types.ts";
import { StubSpeechService } from "./stubSpeechService.ts";
import { OpenAiWhisperSpeechService } from "./openaiWhisperSpeechService.ts";

let cached: SpeechService | null = null;

export function getSpeechService(): SpeechService {
  if (cached) return cached;

  const provider = (process.env.VOICE_SPEECH_PROVIDER ?? "stub").toLowerCase();
  const openAiKey = process.env.OPENAI_API_KEY ?? "";

  // Prefer Whisper when API key is configured, even if provider is still "stub".
  if (openAiKey.length > 0 && (provider === "stub" || provider === "openai_whisper" || provider === "openai" || provider === "whisper")) {
    cached = new OpenAiWhisperSpeechService(openAiKey);
    return cached;
  }

  switch (provider) {
    case "openai_whisper":
    case "openai":
    case "whisper":
      cached = new OpenAiWhisperSpeechService(openAiKey);
      break;
    case "google":
    case "azure":
      // Future providers — fall back to stub with clear message
      cached = new StubSpeechService();
      break;
    default:
      cached = new StubSpeechService();
  }

  return cached;
}

export function listSpeechProviders(): { id: string; available: boolean; label: string }[] {
  const openAiKey = process.env.OPENAI_API_KEY ?? "";
  return [
    { id: "web_speech", available: true, label: "Browser Web Speech (client)" },
    { id: "openai_whisper", available: openAiKey.length > 0, label: "OpenAI Whisper" },
    { id: "google", available: false, label: "Google Speech (planned)" },
    { id: "azure", available: false, label: "Azure Speech (planned)" },
  ];
}
