import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import { getSpeechService, listSpeechProviders } from "../lib/voice/speech/speechServiceFactory.ts";
import { getVoiceParser, listVoiceParsers } from "../lib/voice/parser/voiceParserFactory.ts";
import { matchVoiceItems } from "../lib/voice/productMatcher.ts";
import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ParsedVoiceResult, VoiceFormType } from "../../shared/voice/types.ts";

const router: IRouter = Router();

const VOICE_ROLES = ["super_admin", "owner", "admin", "sales", "engineer", "technician"];

const TranscribeBody = z.object({
  text: z.string().optional(),
  audioBase64: z.string().optional(),
  mimeType: z.string().optional(),
});

const ParseBody = z.object({
  text: z.string().min(1),
  formType: z.enum(["quote", "work_order", "repair_case"]),
  matchProducts: z.boolean().optional().default(true),
});

async function loadTechnicianNames(): Promise<string[]> {
  const rows = await db
    .select({ name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.status, "在職"));
  return rows.map(r => r.name).filter(Boolean);
}

async function enrichParsed(
  parsed: ParsedVoiceResult,
  matchProducts: boolean,
): Promise<ParsedVoiceResult> {
  if (!matchProducts || !parsed.items?.length) return parsed;
  const items = await matchVoiceItems(parsed.items);
  return { ...parsed, items };
}

router.get("/voice/providers", requireRole(...VOICE_ROLES), (_req, res) => {
  res.json({
    speech: listSpeechProviders(),
    parser: listVoiceParsers(),
    activeSpeech: process.env.VOICE_SPEECH_PROVIDER ?? "stub",
    activeParser: process.env.VOICE_PARSER_PROVIDER ?? "heuristic",
  });
});

router.post("/voice/transcribe", requireRole(...VOICE_ROLES), async (req, res): Promise<void> => {
  const parsed = TranscribeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, audioBase64, mimeType } = parsed.data;

  if (text?.trim()) {
    res.json({ text: text.trim(), provider: "client_text" });
    return;
  }

  if (!audioBase64) {
    res.status(400).json({
      error: "請提供 text（客戶端轉錄）或 audioBase64（伺服器轉錄）",
      fallback: "web_speech",
    });
    return;
  }

  try {
    const speech = getSpeechService();
    if (!speech.isAvailable()) {
      res.status(503).json({
        error: "伺服器語音轉換尚未設定",
        fallback: "web_speech",
        providers: listSpeechProviders(),
      });
      return;
    }
    const audio = Buffer.from(audioBase64, "base64");
    const result = await speech.transcribe(audio, mimeType ?? "audio/webm");
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "語音轉換失敗";
    res.status(503).json({ error: message, fallback: "web_speech" });
  }
});

router.post("/voice/parse", requireRole(...VOICE_ROLES), async (req, res): Promise<void> => {
  const parsedBody = ParseBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const { text, formType, matchProducts } = parsedBody.data;
  const technicianNames = formType === "work_order" ? await loadTechnicianNames() : [];
  const parser = getVoiceParser(technicianNames);
  const parsed = await parser.parse(text, formType as VoiceFormType);
  const enriched = await enrichParsed(parsed, matchProducts);

  res.json({
    transcript: text,
    provider: "speech_client",
    parser: parser.name,
    parsed: enriched,
  });
});

router.post("/voice/process", requireRole(...VOICE_ROLES), async (req, res): Promise<void> => {
  const parsedBody = ParseBody.extend({
    audioBase64: z.string().optional(),
    mimeType: z.string().optional(),
  }).safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  let transcript = parsedBody.data.text?.trim() ?? "";
  let speechProvider = transcript ? "client_text" : "none";
  let speechError: string | null = null;

  if (!transcript && parsedBody.data.audioBase64) {
    const speech = getSpeechService();
    console.log("[voice/process] transcribe", {
      speechProvider: speech.name,
      available: speech.isAvailable(),
      mimeType: parsedBody.data.mimeType ?? "audio/webm",
      audioBytes: Buffer.from(parsedBody.data.audioBase64, "base64").length,
    });

    if (!speech.isAvailable()) {
      speechError = "伺服器 Speech Provider 尚未設定（請設定 OPENAI_API_KEY 或 VOICE_SPEECH_PROVIDER=openai_whisper）";
    } else {
      try {
        const audio = Buffer.from(parsedBody.data.audioBase64, "base64");
        const result = await speech.transcribe(audio, parsedBody.data.mimeType ?? "audio/webm");
        transcript = result.text?.trim() ?? "";
        speechProvider = result.provider;
        console.log("[voice/process] transcribe_ok", { provider: speechProvider, chars: transcript.length });
      } catch (err) {
        speechError = err instanceof Error ? err.message : "語音轉換失敗";
        console.error("[voice/process] transcribe_failed", speechError);
      }
    }
  }

  if (!transcript) {
    res.json({
      transcript: "",
      provider: speechProvider,
      parser: null,
      needsManualTranscript: true,
      speechError,
      parsed: null,
    });
    return;
  }

  const { formType, matchProducts } = parsedBody.data;
  const technicianNames = formType === "work_order" ? await loadTechnicianNames() : [];
  const parser = getVoiceParser(technicianNames);
  const parsed = await parser.parse(transcript, formType as VoiceFormType);
  const enriched = await enrichParsed(parsed, matchProducts);

  res.json({
    transcript,
    provider: speechProvider,
    parser: parser.name,
    needsManualTranscript: false,
    speechError,
    parsed: enriched,
  });
});

export default router;
