/** Browser Web Speech API — primary MVP transcription provider. */

export interface ClientTranscriptionResult {
  text: string;
  provider: string;
  confidence?: number;
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0?: { transcript?: string } } } }) => void) | null;
  onerror: (() => void) | null;
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

export function isWebSpeechAvailable(): boolean {
  return typeof window !== "undefined" && getSpeechRecognitionCtor() != null;
}

export function isMediaRecorderAvailable(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

export class LiveSpeechRecognizer {
  private recognition: BrowserSpeechRecognition | null = null;
  private chunks: string[] = [];

  start(onPartial?: (text: string) => void): boolean {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return false;

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

    rec.onerror = () => { /* caller handles stop */ };
    rec.start();
    this.recognition = rec;
    return true;
  }

  stop(): ClientTranscriptionResult {
    const rec = this.recognition;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
    return {
      text: this.chunks.join("").trim(),
      provider: "web_speech",
    };
  }
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private parts: Blob[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.parts = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) this.parts.push(e.data);
    };
    this.mediaRecorder.start();
  }

  stop(): { blob: Blob; mimeType: string } {
    const mr = this.mediaRecorder;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    const mimeType = this.parts[0]?.type || "audio/webm";
    const blob = new Blob(this.parts, { type: mimeType });
    return { blob, mimeType };
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
