import type { VoiceParser } from "./heuristicVoiceParser.ts";
import { HeuristicVoiceParser } from "./heuristicVoiceParser.ts";

let cached: VoiceParser | null = null;

export function getVoiceParser(technicianNames: string[] = []): VoiceParser {
  const provider = (process.env.VOICE_PARSER_PROVIDER ?? "heuristic").toLowerCase();

  // Future: openai, azure — for now always heuristic
  if (provider === "heuristic" || provider === "openai") {
    return new HeuristicVoiceParser(technicianNames);
  }

  if (!cached) cached = new HeuristicVoiceParser(technicianNames);
  return cached;
}

export function listVoiceParsers(): { id: string; available: boolean; label: string }[] {
  return [
    { id: "heuristic", available: true, label: "Rule-based parser (built-in)" },
    { id: "openai", available: Boolean(process.env.OPENAI_API_KEY), label: "OpenAI LLM parser (planned)" },
  ];
}
