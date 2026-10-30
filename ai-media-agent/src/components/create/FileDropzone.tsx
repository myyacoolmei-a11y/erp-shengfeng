"use client";

import { useRef, useState, type DragEvent } from "react";
import { UploadCloud, X } from "lucide-react";

interface FileDropzoneProps {
  accept: string;
  hint: string;
  file: File | null;
  onFileSelected: (file: File | null) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({ accept, hint, file, onFileSelected }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      onFileSelected(droppedFile);
    }
  }

  if (file) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-warm-600/20 bg-ink-900/60 px-4 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-warm-100">{file.name}</p>
          <p className="text-xs text-warm-500">{formatFileSize(file.size)}</p>
        </div>
        <button
          type="button"
          onClick={() => onFileSelected(null)}
          aria-label="移除檔案"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-warm-400 hover:bg-ink-800 hover:text-blush-400"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          inputRef.current?.click();
        }
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
        isDraggingOver ? "border-champagne-400/70 bg-champagne-500/5" : "border-warm-600/25 hover:border-warm-600/40"
      }`}
    >
      <UploadCloud className="h-8 w-8 text-warm-500" strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium text-warm-200">點擊或拖曳檔案到這裡上傳</p>
      <p className="mt-1 text-xs text-warm-500">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
