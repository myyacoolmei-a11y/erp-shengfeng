import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Car, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  LiveSpeechPreview,
  AudioRecorder,
  blobToBase64,
  isMediaRecorderAvailable,
  normalizeMimeType,
  validateRecording,
  VOICE_MAX_RECORDING_MS,
} from "@/lib/voice/clientSpeech";
import { getVoiceProviders, parseVoiceText, processVoiceInput } from "@/lib/voice/voiceApi";
import type { VoiceFormType } from "@/lib/voice/voiceApi";
import type { ParsedVoiceResult } from "../../../../shared/voice/types.ts";
import { VOICE_FORM_LABELS, type VoiceAssistantStep, type VoiceAssistantApplyPayload } from "./types";
import { VoiceConfirmPanel } from "./VoiceConfirmPanel";
import { DrivingModeView } from "./DrivingModeView";
import { voiceLog, voiceWarn, voiceError } from "@/lib/voice/voiceDebug";
import {
  VOICE_ERROR_PAYLOAD_TOO_LARGE,
  VOICE_ERROR_TOO_LONG,
} from "@/lib/voice/voiceConstants";

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
  const [manualText, setManualText] = useState("");
  const [parsed, setParsed] = useState<ParsedVoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speechProviderLabel, setSpeechProviderLabel] = useState<string>("—");
  const [remainingSec, setRemainingSec] = useState(Math.ceil(VOICE_MAX_RECORDING_MS / 1000));

  const previewRef = useRef<LiveSpeechPreview | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const stoppingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    getVoiceProviders()
      .then(info => {
        const label = info.speechAvailable
          ? `${info.activeSpeech} (server)`
          : `${info.activeSpeech} — 請設定 OPENAI_API_KEY`;
        setSpeechProviderLabel(label);
        voiceLog("providers", info);
      })
      .catch(err => {
        voiceWarn("providers_fetch_failed", { message: err instanceof Error ? err.message : String(err) });
      });
  }, [open]);

  const reset = useCallback(() => {
    setStep("idle");
    setPartialText("");
    setTranscript("");
    setManualText("");
    setParsed(null);
    setError(null);
    previewRef.current = null;
    recorderRef.current = null;
    setRemainingSec(Math.ceil(VOICE_MAX_RECORDING_MS / 1000));
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function runParser(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("請輸入或錄製語音內容");
      setStep("manual_input");
      return;
    }

    setStep("processing");
    setTranscript(trimmed);
    voiceLog("parse_start", { chars: trimmed.length, formType });

    try {
      const result = await parseVoiceText(trimmed, formType, true);
      voiceLog("parse_ok", { parser: result.parser, provider: result.provider });
      if (!result.parsed) {
        throw new Error("解析結果為空");
      }
      setParsed(result.parsed);
      setStep("confirm");
    } catch (err) {
      voiceError("parse_failed", { message: err instanceof Error ? err.message : String(err) });
      setError(err instanceof Error ? err.message : "AI 解析失敗，請修改文字後重試");
      setStep("manual_input");
    }
  }

  async function startRecording() {
    setError(null);
    setParsed(null);
    setTranscript("");
    setPartialText("");
    setManualText("");

    if (!isMediaRecorderAvailable()) {
      setError("此瀏覽器不支援錄音，請改用 Chrome 或 Edge");
      setStep("error");
      return;
    }

    try {
      recorderRef.current = new AudioRecorder({
        maxDurationMs: VOICE_MAX_RECORDING_MS,
        onAutoStop: () => stopRecordingRef.current?.(),
        onTick: (_elapsed, remainingMs) => {
          setRemainingSec(Math.max(0, Math.ceil(remainingMs / 1000)));
        },
      });
      await recorderRef.current.start();

      previewRef.current = new LiveSpeechPreview();
      previewRef.current.start(t => setPartialText(t));

      setStep("recording");
      setRemainingSec(Math.ceil(VOICE_MAX_RECORDING_MS / 1000));
      voiceLog("recording_started", { formType, maxSec: VOICE_MAX_RECORDING_MS / 1000 });
    } catch (err) {
      voiceError("recording_start_failed", { message: err instanceof Error ? err.message : String(err) });
      setError(err instanceof Error ? err.message : "無法開始錄音，請允許麥克風權限");
      setStep("error");
    }
  }

  async function stopRecording() {
    if (stoppingRef.current) return;
    if (!recorderRef.current) return;

    stoppingRef.current = true;
    setStep("processing");
    voiceLog("recording_stop_requested");

    let previewText = "";
    if (previewRef.current) {
      previewText = previewRef.current.stop();
      previewRef.current = null;
    }

    try {
      const recorder = recorderRef.current;
      if (!recorder) {
        throw new Error("找不到錄音資料，請重新錄音");
      }

      const { blob, mimeType, durationMs, autoStopped } = await recorder.stop();
      recorderRef.current = null;

      const validationError = validateRecording({ blob, durationMs });
      if (validationError) {
        voiceWarn("recording_rejected", { bytes: blob.size, durationMs, autoStopped });
        setManualText(previewText);
        setError(validationError);
        setStep("manual_input");
        return;
      }

      if (blob.size < 512) {
        voiceWarn("recording_too_small", { bytes: blob.size, durationMs });
        setManualText(previewText);
        setError("錄音時間太短，請補充文字或重新錄音");
        setStep("manual_input");
        return;
      }

      const audioBase64 = await blobToBase64(blob);
      voiceLog("process_voice", {
        bytes: blob.size,
        durationMs,
        mimeType: normalizeMimeType(mimeType),
        previewChars: previewText.length,
      });

      const result = await processVoiceInput({
        audioBase64,
        mimeType: normalizeMimeType(mimeType),
        formType,
        matchProducts: true,
      });

      voiceLog("process_voice_result", {
        provider: result.provider,
        parser: result.parser,
        needsManualTranscript: result.needsManualTranscript,
        speechError: result.speechError ?? null,
        transcriptChars: result.transcript?.length ?? 0,
      });

      const mergedText = (result.transcript?.trim() || previewText.trim());
      setTranscript(mergedText);
      setManualText(mergedText);

      if (result.needsManualTranscript || !mergedText) {
        setError(
          result.speechError
            ? `自動轉文字未完成：${result.speechError}。請確認或修改下方文字後按「解析內容」。`
            : "自動轉文字未完成，請確認或修改下方文字後按「解析內容」。",
        );
        setStep("manual_input");
        return;
      }

      if (!result.parsed) {
        await runParser(mergedText);
        return;
      }

      setParsed(result.parsed);
      setStep("confirm");
    } catch (err) {
      const mapped = err instanceof Error ? err : new Error("語音處理失敗，請修改文字後重試");
      voiceError("process_voice_failed", { message: mapped.message });
      setManualText(previewText || manualText);

      const msg = mapped.message;
      if (msg === VOICE_ERROR_TOO_LONG || msg === VOICE_ERROR_PAYLOAD_TOO_LARGE) {
        setError(msg);
        setStep("manual_input");
        return;
      }

      setError(msg.includes("HTTP ") ? "語音處理失敗，請修改文字後重試" : msg);
      setStep("manual_input");
    } finally {
      stoppingRef.current = false;
    }
  }

  stopRecordingRef.current = () => {
    void stopRecording();
  };

  function handleConfirm() {
    if (!parsed) return;
    onApply({ formType, parsed, transcript: transcript || manualText });
    handleOpenChange(false);
    toast({
      title: "已填入表單",
      description: "請確認內容後再按儲存建立",
    });
  }

  const label = VOICE_FORM_LABELS[formType as VoiceFormType];

  const manualInputPanel = (
    <div className="space-y-3">
      {error && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">{error}</p>}
      <p className="text-xs text-muted-foreground">
        請確認語音轉換結果，可直接修改後解析（工地環境有背景音是正常的）。
      </p>
      <Textarea
        value={manualText}
        onChange={e => setManualText(e.target.value)}
        rows={5}
        placeholder="例：羽樂體育用品店，一台冰點 FI/FU-80HSG…"
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => { setStep("idle"); setError(null); }}>
          重新錄音
        </Button>
        <Button type="button" className="flex-1" onClick={() => runParser(manualText)}>
          解析內容
        </Button>
      </div>
    </div>
  );

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
            partialText={partialText || manualText || transcript}
            error={step === "error" ? error : null}
            remainingSec={remainingSec}
            onStart={startRecording}
            onStop={stopRecording}
            onConfirm={handleConfirm}
            onExitDriving={() => setDrivingMode(false)}
            canConfirm={!!parsed && step === "confirm"}
            onManualParse={() => runParser(manualText)}
            showManual={step === "manual_input"}
            manualText={manualText}
            onManualTextChange={setManualText}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground leading-snug">
                錄音 → Speech Provider → AI 解析 → 確認填入（Provider: {speechProviderLabel}）
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
                  ● 錄音中… 最多 {remainingSec} 秒（背景有噪音也可錄）
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
                語音辨識與 AI 解析中…
              </div>
            )}

            {step === "manual_input" && manualInputPanel}

            {step === "error" && (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button type="button" variant="outline" className="w-full" onClick={() => { setStep("idle"); setError(null); }}>
                  重新錄音
                </Button>
              </div>
            )}

            {step === "confirm" && parsed && (
              <VoiceConfirmPanel parsed={parsed} transcript={transcript || manualText} />
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
