import { useState, useRef, useCallback } from "react";
import { Mic, Car, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  LiveSpeechRecognizer,
  AudioRecorder,
  blobToBase64,
  isWebSpeechAvailable,
  isMediaRecorderAvailable,
} from "@/lib/voice/clientSpeech";
import { parseVoiceText, transcribeVoiceAudio } from "@/lib/voice/voiceApi";
import type { VoiceFormType } from "@/lib/voice/voiceApi";
import type { ParsedVoiceResult } from "../../../../shared/voice/types.ts";
import { VOICE_FORM_LABELS, type VoiceAssistantStep, type VoiceAssistantApplyPayload } from "./types";
import { VoiceConfirmPanel } from "./VoiceConfirmPanel";
import { DrivingModeView } from "./DrivingModeView";

interface VoiceAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formType: VoiceFormType;
  onApply: (payload: VoiceAssistantApplyPayload) => void;
}

export function VoiceAssistantDialog({
  open,
  onOpenChange,
  formType,
  onApply,
}: VoiceAssistantDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<VoiceAssistantStep>("idle");
  const [drivingMode, setDrivingMode] = useState(false);
  const [partialText, setPartialText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedVoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognizerRef = useRef<LiveSpeechRecognizer | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setPartialText("");
    setTranscript("");
    setParsed(null);
    setError(null);
    recognizerRef.current = null;
    recorderRef.current = null;
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function resolveTranscript(liveText: string, audioBlob?: Blob, mimeType?: string): Promise<string> {
    if (liveText.trim()) return liveText.trim();

    if (audioBlob && mimeType) {
      try {
        const b64 = await blobToBase64(audioBlob);
        const result = await transcribeVoiceAudio(b64, mimeType);
        if (result.text?.trim()) return result.text.trim();
      } catch {
        /* try web speech only path */
      }
    }

    return "";
  }

  async function startRecording() {
    setError(null);
    setParsed(null);
    setTranscript("");
    setPartialText("");

    if (!isWebSpeechAvailable() && !isMediaRecorderAvailable()) {
      setError("此瀏覽器不支援語音錄製，請改用 Chrome 或 Edge");
      setStep("error");
      return;
    }

    try {
      recognizerRef.current = new LiveSpeechRecognizer();
      const speechStarted = recognizerRef.current.start(t => setPartialText(t));

      if (isMediaRecorderAvailable()) {
        recorderRef.current = new AudioRecorder();
        await recorderRef.current.start();
      }

      if (!speechStarted && !recorderRef.current) {
        setError("無法啟動語音辨識，請允許麥克風權限");
        setStep("error");
        return;
      }

      setStep("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法開始錄音");
      setStep("error");
    }
  }

  async function stopRecording() {
    setStep("processing");

    let liveText = "";
    if (recognizerRef.current) {
      liveText = recognizerRef.current.stop().text;
    }

    let audioBlob: Blob | undefined;
    let mimeType: string | undefined;
    if (recorderRef.current) {
      const rec = recorderRef.current.stop();
      audioBlob = rec.blob;
      mimeType = rec.mimeType;
    }

    const finalText = await resolveTranscript(liveText || partialText, audioBlob, mimeType);

    if (!finalText) {
      setError("聽不清楚，請再試一次或使用較安靜的環境");
      setStep("error");
      return;
    }

    setTranscript(finalText);
    setPartialText(finalText);

    try {
      const result = await parseVoiceText(finalText, formType, true);
      setParsed(result.parsed);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 解析失敗");
      setStep("error");
    }
  }

  function handleConfirm() {
    if (!parsed) return;
    onApply({ formType, parsed, transcript });
    handleOpenChange(false);
    toast({
      title: "已填入表單",
      description: "請確認內容後再按儲存建立",
    });
  }

  const label = VOICE_FORM_LABELS[formType as VoiceFormType];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={drivingMode ? "max-w-md" : "max-w-lg max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            AI 語音建立 — {label}
          </DialogTitle>
        </DialogHeader>

        {drivingMode ? (
          <DrivingModeView
            step={step}
            partialText={partialText || transcript}
            error={error}
            onStart={startRecording}
            onStop={stopRecording}
            onConfirm={handleConfirm}
            onExitDriving={() => setDrivingMode(false)}
            canConfirm={!!parsed && step === "confirm"}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                錄音 → 轉文字 → AI 解析 → 確認後填入表單（不會直接建立）
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-7 text-xs"
                onClick={() => setDrivingMode(true)}
              >
                <Car className="h-3.5 w-3.5 mr-1" />
                開車模式
              </Button>
            </div>

            {step === "idle" && (
              <Button type="button" className="w-full" onClick={startRecording}>
                <Mic className="h-4 w-4 mr-2" />
                開始錄音
              </Button>
            )}

            {step === "recording" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-pulse">
                  ● 錄音中… 請說出客戶、商品、數量、施工內容
                </div>
                {partialText && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{partialText}</p>
                )}
                <Button type="button" variant="destructive" className="w-full" onClick={stopRecording}>
                  停止錄音
                </Button>
              </div>
            )}

            {step === "processing" && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                AI 轉文字與解析中…
              </div>
            )}

            {step === "error" && (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button type="button" variant="outline" className="w-full" onClick={() => { setStep("idle"); setError(null); }}>
                  重新錄音
                </Button>
              </div>
            )}

            {step === "confirm" && parsed && (
              <VoiceConfirmPanel parsed={parsed} transcript={transcript} />
            )}
          </div>
        )}

        {!drivingMode && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            {step === "confirm" && parsed && (
              <Button type="button" onClick={handleConfirm}>
                確認填入表單
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface VoiceAssistantButtonProps {
  formType: VoiceFormType;
  onApply: (payload: VoiceAssistantApplyPayload) => void;
  className?: string;
}

export function VoiceAssistantButton({ formType, onApply, className }: VoiceAssistantButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <Mic className="h-4 w-4 mr-1" />
        AI 語音建立
      </Button>
      <VoiceAssistantDialog
        open={open}
        onOpenChange={setOpen}
        formType={formType}
        onApply={onApply}
      />
    </>
  );
}
