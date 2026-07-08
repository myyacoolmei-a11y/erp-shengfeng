/**
 * Client audio capture — record raw audio and send to server Speech Provider.
 * Web Speech may run in parallel for live preview only; it never blocks the pipeline.
 */

import { voiceLog, voiceWarn } from "./voiceDebug.ts";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
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

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) this.parts.push(e.data);
    };
    this.mediaRecorder.start(250);
    voiceLog("recorder_started", { mimeType });
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder;
      if (!mr || mr.state === "inactive") {
        reject(new Error("錄音尚未開始"));
        return;
      }

      const mimeType = mr.mimeType || this.parts[0]?.type || "audio/webm";
      const durationMs = Date.now() - this.startedAt;

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
        });
        resolve({ blob, mimeType, durationMs });
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
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "audio/mp4";
  if (mimeType.includes("ogg")) return "audio/ogg";
  return mimeType || "audio/webm";
}
