import type { SpeechService } from "./types.ts";
import { SpeechServiceNotConfiguredError } from "./types.ts";
import type { VoiceTranscribeResponse } from "../../../../shared/voice/types.ts";

/** OpenAI Whisper — enabled when OPENAI_API_KEY is set. */
export class OpenAiWhisperSpeechService implements SpeechService {
  readonly name = "openai_whisper";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable() {
    return this.apiKey.length > 0;
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<VoiceTranscribeResponse> {
    if (!this.isAvailable()) {
      throw new SpeechServiceNotConfiguredError(this.name);
    }

    const form = new FormData();
    const blob = new Blob([new Uint8Array(audio)], { type: mimeType || "audio/webm" });
    form.append("file", blob, "voice.webm");
    form.append("model", "whisper-1");
    form.append("language", "zh");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Whisper API error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as { text?: string };
    return {
      text: (data.text ?? "").trim(),
      provider: this.name,
    };
  }
}
