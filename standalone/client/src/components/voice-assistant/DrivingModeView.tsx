import { Mic, Square, Check, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VoiceAssistantStep } from "./types";

interface DrivingModeViewProps {
  step: VoiceAssistantStep;
  partialText: string;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onConfirm: () => void;
  onExitDriving: () => void;
  canConfirm: boolean;
  showManual?: boolean;
  manualText?: string;
  onManualTextChange?: (v: string) => void;
  onManualParse?: () => void;
}

export function DrivingModeView({
  step,
  partialText,
  error,
  onStart,
  onStop,
  onConfirm,
  onExitDriving,
  canConfirm,
  showManual,
  manualText = "",
  onManualTextChange,
  onManualParse,
}: DrivingModeViewProps) {
  const isRecording = step === "recording";
  const isProcessing = step === "processing";

  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] gap-6 py-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Car className="h-4 w-4" />
        <span>開車模式 — 大按鈕語音操作</span>
        <button type="button" className="text-xs underline ml-2" onClick={onExitDriving}>
          退出
        </button>
      </div>

      {partialText && !showManual && (
        <p className="text-center text-sm text-muted-foreground px-4 max-h-24 overflow-y-auto whitespace-pre-wrap">
          {partialText}
        </p>
      )}

      {showManual && (
        <div className="w-full max-w-sm space-y-2 px-2">
          {error && <p className="text-xs text-amber-700">{error}</p>}
          <Textarea
            value={manualText}
            onChange={e => onManualTextChange?.(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder="確認或修改語音內容…"
          />
          <Button type="button" className="w-full h-14 text-base rounded-2xl" onClick={onManualParse}>
            解析內容
          </Button>
        </div>
      )}

      {error && !showManual && (
        <p className="text-center text-sm text-destructive px-4">{error}</p>
      )}

      {!showManual && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          {!isRecording ? (
            <Button
              type="button"
              size="lg"
              className="w-full h-20 text-lg rounded-2xl"
              onClick={onStart}
              disabled={isProcessing}
            >
              <Mic className="h-8 w-8 mr-2" />
              開始錄音
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className="w-full h-20 text-lg rounded-2xl"
              onClick={onStop}
            >
              <Square className="h-7 w-7 mr-2 fill-current" />
              停止錄音
            </Button>
          )}

          {canConfirm && step === "confirm" && (
            <Button
              type="button"
              size="lg"
              className="w-full h-16 text-base rounded-2xl bg-emerald-600 hover:bg-emerald-700"
              onClick={onConfirm}
            >
              <Check className="h-6 w-6 mr-2" />
              確認填入
            </Button>
          )}
        </div>
      )}

      {isProcessing && (
        <p className="text-sm text-muted-foreground animate-pulse">語音辨識與 AI 解析中…</p>
      )}
    </div>
  );
}
