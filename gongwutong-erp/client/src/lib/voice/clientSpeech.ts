/**
 * Client audio capture — record raw audio and send to server Speech Provider.
 * Web Speech may run in parallel for live preview only; it never blocks the pipeline.
 */

import {
  VOICE_MAX_AUDIO_BYTES,
  VOICE_MAX_RECORDING_MS,
} from "./voiceConstants.ts";
import { voiceLog, voiceWarn } from "./voiceDebug.ts";

export { VOICE_MAX_RECORDING_MS, VOICE_MAX_AUDIO_BYTES } from "./voiceConstants.ts";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  autoStopped: boolean;
}

export interface AudioRecorderOptions {
  maxDurationMs?: number;
  onAutoStop?: () => void;
  onTick?: (elapsedMs: number, remainingMs: number) => void;
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0?: { transcript?: string } } } }) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickRecorderMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function isMediaRecorderAvailable(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

/** Optional live preview — errors are logged only, never shown as noise warnings. */
export class LiveSpeechPreview {
  private recognition: BrowserSpeechRecognition | null = null;
  private chunks: string[] = [];

  start(onPartial?: (text: string) => void): boolean {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      voiceLog("web_speech_preview_unavailable");
      return false;
    }

    this.chunks = [];
    const rec = new Ctor();
    rec.lang = "zh-TW";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          this.chunks.push(t);
        } else {
          interim += t;
        }
      }
      onPartial?.([...this.chunks, interim].join("").trim());
    };

    rec.onerror = (event) => {
      voiceWarn("web_speech_preview_error", {
        error: event.error ?? "unknown",
        message: event.message ?? null,
        note: "Preview only — does not block recording pipeline",
      });
    };

    rec.onend = () => {
      voiceLog("web_speech_preview_ended", { chars: this.chunks.join("").length });
    };

    try {
      rec.start();
      this.recognition = rec;
      voiceLog("web_speech_preview_started");
      return true;
    } catch (err) {
      voiceWarn("web_speech_preview_start_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  stop(): string {
    const rec = this.recognition;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
    const text = this.chunks.join("").trim();
    voiceLog("web_speech_preview_stop", { chars: text.length });
    return text;
  }
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private parts: Blob[] = [];
  private startedAt = 0;
  private maxDurationMs: number;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autoStopped = false;
  private onAutoStop?: () => void;
  private onTick?: (elapsedMs: number, remainingMs: number) => void;

  constructor(options: AudioRecorderOptions = {}) {
    this.maxDurationMs = options.maxDurationMs ?? VOICE_MAX_RECORDING_MS;
    this.onAutoStop = options.onAutoStop;
    this.onTick = options.onTick;
  }

  async start(): Promise<void> {
    if (!isMediaRecorderAvailable()) {
      throw new Error("此瀏覽器不支援錄音，請改用 Chrome 或 Edge");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    this.parts = [];
    this.startedAt = Date.now();
    this.autoStopped = false;

    const mimeType = pickRecorderMimeType();
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) this.parts.push(e.data);
    };
    this.mediaRecorder.start(250);

    this.autoStopTimer = setTimeout(() => {
      this.autoStopped = true;
      voiceLog("recorder_auto_stop", { maxDurationMs: this.maxDurationMs });
      this.onAutoStop?.();
    }, this.maxDurationMs);

    this.tickTimer = setInterval(() => {
      const elapsedMs = Date.now() - this.startedAt;
      const remainingMs = Math.max(0, this.maxDurationMs - elapsedMs);
      this.onTick?.(elapsedMs, remainingMs);
    }, 250);

    voiceLog("recorder_started", {
      mimeType: this.mediaRecorder.mimeType || mimeType || "browser-default",
      maxDurationMs: this.maxDurationMs,
    });
  }

  private clearTimers() {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder;
      if (!mr || mr.state === "inactive") {
        reject(new Error("錄音尚未開始"));
        return;
      }

      this.clearTimers();

      const mimeType = mr.mimeType || this.parts[0]?.type || pickRecorderMimeType() || "audio/webm";
      const durationMs = Date.now() - this.startedAt;
      const autoStopped = this.autoStopped;

      mr.onstop = () => {
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;
        this.mediaRecorder = null;
        const blob = new Blob(this.parts, { type: mimeType });
        voiceLog("recorder_stopped", {
          mimeType,
          durationMs,
          bytes: blob.size,
          chunks: this.parts.length,
          autoStopped,
        });
        resolve({ blob, mimeType, durationMs, autoStopped });
      };

      mr.onerror = () => {
        voiceWarn("recorder_error");
        reject(new Error("錄音失敗，請重試"));
      };

      try {
        mr.requestData();
        mr.stop();
      } catch (err) {
        reject(err instanceof Error ? err : new Error("停止錄音失敗"));
      }
    });
  }
}

export function validateRecording(result: Pick<RecordingResult, "blob" | "durationMs">): string | null {
  if (result.durationMs > VOICE_MAX_RECORDING_MS + 500) {
    return "錄音太長，請重新錄製";
  }
  if (result.blob.size > VOICE_MAX_AUDIO_BYTES) {
    return "錄音太長，請重新錄製";
  }
  return null;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Best MIME type for server transcription. */
export function normalizeMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return "audio/webm";
  if (mimeType.includes("mp4") || mimeType.includes("aac") || mimeType.includes("m4a")) {
    return "audio/mp4";
  }
  if (mimeType.includes("ogg")) return "audio/ogg";
  return mimeType || "audio/webm";
}

export function voiceFileName(mimeType: string): string {
  return `voice.${extensionForMime(mimeType)}`;
}
