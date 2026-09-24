"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { FileDropzone } from "@/components/create/FileDropzone";

interface AudioRecorderProps {
  file: File | null;
  onFileSelected: (file: File | null) => void;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function AudioRecorder({ file, onFileSelected }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setRecordingError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError("此瀏覽器不支援錄音功能，請改用上傳語音檔。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const recordedFile = new File([blob], `語音錄製-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        onFileSelected(recordedFile);
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setElapsedSeconds(0);
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((previous) => previous + 1);
      }, 1000);
    } catch {
      setRecordingError("無法取得麥克風權限，請確認瀏覽器設定或改用上傳語音檔。");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function handleRemove() {
    onFileSelected(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setElapsedSeconds(0);
  }

  if (file) {
    return (
      <div className="space-y-2 rounded-2xl border border-warm-600/20 bg-ink-900/60 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-warm-100">{file.name}</p>
          <button
            type="button"
            onClick={handleRemove}
            aria-label="移除語音"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-warm-400 hover:bg-ink-800 hover:text-blush-400"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        {previewUrl ? (
          <audio controls src={previewUrl} className="w-full">
            <track kind="captions" />
          </audio>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-warm-600/25 px-4 py-8 text-center">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
            isRecording ? "bg-blush-500 text-ink-950" : "bg-champagne-500 text-ink-950"
          }`}
          aria-label={isRecording ? "停止錄音" : "開始錄音"}
        >
          {isRecording ? (
            <Square className="h-6 w-6" strokeWidth={2} />
          ) : (
            <Mic className="h-6 w-6" strokeWidth={2} />
          )}
        </button>
        <p className="text-sm text-warm-400">
          {isRecording ? `錄音中… ${formatDuration(elapsedSeconds)}` : "點擊開始錄音"}
        </p>
        {recordingError ? <p className="text-xs text-blush-400">{recordingError}</p> : null}
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-warm-600/15" />
        <span className="text-xs text-warm-600">或</span>
        <span className="h-px flex-1 bg-warm-600/15" />
      </div>

      <FileDropzone accept="audio/*" hint="支援 MP3、WAV、M4A 等音訊格式" file={null} onFileSelected={onFileSelected} />
    </div>
  );
}
