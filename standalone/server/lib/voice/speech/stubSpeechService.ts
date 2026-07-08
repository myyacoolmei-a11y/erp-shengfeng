import type { SpeechService } from "./types.ts";
import { SpeechServiceNotConfiguredError } from "./types.ts";

/** Placeholder provider — returns passthrough when client sends pre-transcribed text. */
export class StubSpeechService implements SpeechService {
  readonly name = "stub";

  isAvailable() {
    return true;
  }

  async transcribe(): Promise<never> {
    throw new SpeechServiceNotConfiguredError(
      "Server speech transcription is not configured. Use client-side Web Speech or set VOICE_SPEECH_PROVIDER=openai_whisper with OPENAI_API_KEY.",
    );
  }
}
