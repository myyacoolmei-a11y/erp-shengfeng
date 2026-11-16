import type { VoiceTranscribeResponse } from "../../../../shared/voice/types.ts";

export interface SpeechService {
  readonly name: string;
  isAvailable(): boolean;
  transcribe(audio: Buffer, mimeType: string): Promise<VoiceTranscribeResponse>;
}

export class SpeechServiceNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Speech provider "${provider}" is not configured`);
    this.name = "SpeechServiceNotConfiguredError";
  }
}
