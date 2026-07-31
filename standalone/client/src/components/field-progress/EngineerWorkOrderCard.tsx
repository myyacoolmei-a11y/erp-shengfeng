import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  AlertTriangle,
  Car,
  MapPin,
  Pause,
  Play,
  Flag,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  type FieldProgressRecord,
  type FieldStatus,
  type CompletionChecklist,
  type BackfillStep,
  UNABLE_REASONS,
  PAUSE_REASONS,
  BACKFILL_STEPS,
  BACKFILL_STEP_LABELS,
  COMPLETION_CHECKLIST_KEYS,
  COMPLETION_CHECKLIST_LABELS,
  FIELD_STATUS_LABELS,
  emptyCompletionChecklist,
  isChecklistComplete,
  formatTaipeiDateTime,
  computeFieldReminder,
  daysOverdue,
  departFieldProgress,
  arriveFieldProgress,
  pauseFieldProgress,
  resumeFieldProgress,
  completeFieldProgress,
  reportUnableFieldProgress,
  requestFieldProgressBackfill,
  taipeiToday,
} from "@/lib/fieldProgressApi";
import { fetchWorkOrderReopenInfo } from "@/lib/notificationsApi";

export interface WorkOrderCardData {
  id: number;
  workOrderNumber?: string | null;
  customerName?: string | null;
  mobilePhone?: string | null;
  telephone?: string | null;
  installAddress?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: string | null;
}

type BtnVisual = "done" | "active" | "pending" | "paused" | "overdue";

function phoneDisplay(order: WorkOrderCardData): string {
  return [order.mobilePhone, order.telephone].filter(Boolean).join(" / ") || "—";
}

function statusBadgeClass(status: FieldStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800";
    case "paused":
      return "bg-orange-100 text-orange-800";
    case "en_route":
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function btnClass(visual: BtnVisual): string {
  switch (visual) {
    case "done":
      return "bg-green-600 hover:bg-green-600 text-white border-green-600 cursor-default";
    case "active":
      return "bg-blue-600 hover:bg-blue-700 text-white border-blue-600";
    case "paused":
      return "bg-orange-500 hover:bg-orange-600 text-white border-orange-500";
    case "overdue":
      return "bg-red-600 hover:bg-red-700 text-white border-red-600";
    default:
      return "bg-slate-200 text-slate-500 border-slate-200 cursor-not-allowed";
  }
}

interface Props {
  order: WorkOrderCardData;
  progress: FieldProgressRecord | null;
  onProgressUpdated?: () => void;
  /** Hide action buttons (e.g. completed section) */
  readOnly?: boolean;
}

export function EngineerWorkOrderCard({ order, progress, onProgressUpdated, readOnly }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = taipeiToday();
  const overdue = daysOverdue(order.scheduledDate, today);
  const fieldStatus: FieldStatus = progress?.fieldStatus ?? "pending";
  const reminder = computeFieldReminder({
    scheduledDate: order.scheduledDate,
    scheduledTime: order.scheduledTime,
    progress,
  });

  const { data: reopenInfo } = useQuery({
    queryKey: ["work-order-reopen", order.id],
    queryFn: () => fetchWorkOrderReopenInfo(order.id),
    enabled: order.status === "待施工" || order.status === "待處理",
  });

  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseNote, setPauseNote] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [checklist, setChecklist] = useState<CompletionChecklist>(emptyCompletionChecklist());
  const [unableOpen, setUnableOpen] = useState(false);
  const [unableReason, setUnableReason] = useState("");
  const [unableNote, setUnableNote] = useState("");
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillStep, setBackfillStep] = useState<BackfillStep | "">("");
  const [backfillTime, setBackfillTime] = useState("");
  const [backfillReason, setBackfillReason] = useState("");
  const [backfillNote, setBackfillNote] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["field-progress", "mine"] });
    queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    onProgressUpdated?.();
  };

  const errToast = (err: unknown) => {
    const msg =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "操作失敗";
    toast({ title: msg, variant: "destructive" });
  };

  const departMut = useMutation({
    mutationFn: () => departFieldProgress(order.id),
    onSuccess: () => {
      toast({ title: "已記錄出發" });
      invalidate();
    },
    onError: errToast,
  });
  const arriveMut = useMutation({
    mutationFn: () => arriveFieldProgress(order.id),
    onSuccess: () => {
      toast({ title: "已記錄到場" });
      invalidate();
    },
    onError: errToast,
  });
  const pauseMut = useMutation({
    mutationFn: () =>
      pauseFieldProgress(order.id, {
        reason: pauseReason,
        note: pauseNote || undefined,
      }),
    onSuccess: () => {
      toast({ title: "已暫停施工" });
      setPauseOpen(false);
      setPauseReason("");
      setPauseNote("");
      invalidate();
    },
    onError: errToast,
  });
  const resumeMut = useMutation({
    mutationFn: () => resumeFieldProgress(order.id),
    onSuccess: () => {
      toast({ title: "已恢復施工" });
      invalidate();
    },
    onError: errToast,
  });
  const completeMut = useMutation({
    mutationFn: () => completeFieldProgress(order.id, checklist),
    onSuccess: () => {
      toast({ title: "施工完成，已送行政待辦" });
      setCompleteOpen(false);
      setChecklist(emptyCompletionChecklist());
      invalidate();
    },
    onError: errToast,
  });
  const unableMut = useMutation({
    mutationFn: () =>
      reportUnableFieldProgress(order.id, {
        reason: unableReason,
        note: unableNote || undefined,
      }),
    onSuccess: () => {
      toast({ title: "已回報無法完成" });
      setUnableOpen(false);
      invalidate();
    },
    onError: errToast,
  });
  const backfillMut = useMutation({
    mutationFn: () =>
      requestFieldProgressBackfill(order.id, {
        missedStep: backfillStep as BackfillStep,
        requestedTime: new Date(backfillTime).toISOString(),
        reason: backfillReason,
        note: backfillNote || undefined,
      }),
    onSuccess: () => {
      toast({ title: "補登申請已送出，待審核" });
      setBackfillOpen(false);
      setBackfillStep("");
      setBackfillTime("");
      setBackfillReason("");
      setBackfillNote("");
    },
    onError: errToast,
  });

  const busy =
    departMut.isPending ||
    arriveMut.isPending ||
    pauseMut.isPending ||
    resumeMut.isPending ||
    completeMut.isPending;

  const canDepart = fieldStatus === "pending" && !readOnly;
  const canArrive = fieldStatus === "en_route" && !readOnly;
  const canPause = fieldStatus === "in_progress" && !readOnly;
  const canResume = fieldStatus === "paused" && !readOnly;
  const canComplete = fieldStatus === "in_progress" && !readOnly;

  const departVisual: BtnVisual =
    fieldStatus !== "pending"
      ? "done"
      : reminder.kind === "not_departed"
        ? "overdue"
        : canDepart
          ? "active"
          : "pending";
  const arriveVisual: BtnVisual =
    progress?.arrivedAt || ["in_progress", "paused", "completed"].includes(fieldStatus)
      ? "done"
      : canArrive
        ? "active"
        : "pending";
  const pauseVisual: BtnVisual =
    fieldStatus === "paused" ? "paused" : canPause ? "active" : "pending";
  const resumeVisual: BtnVisual = canResume ? "paused" : "pending";
  const completeVisual: BtnVisual =
    fieldStatus === "completed" ? "done" : canComplete ? "active" : "pending";

  const cardBorder =
    reminder.severity === "red"
      ? "border-red-400 bg-red-50/40"
      : reminder.severity === "yellow"
        ? "border-amber-300 bg-amber-50/30"
        : "border-border bg-card";

  return (
    <div className={`rounded-xl border-2 p-4 shadow-sm space-y-3 ${cardBorder}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-muted-foreground">
            {order.workOrderNumber || `#${order.id}`}
          </p>
          <p className="text-base font-semibold mt-0.5">{order.customerName || "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusBadgeClass(fieldStatus)}`}>
            {FIELD_STATUS_LABELS[fieldStatus]}
          </span>
          {overdue > 0 && fieldStatus !== "completed" && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-600 text-white">
              逾期 {overdue} 天
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">預定施工：</span>
          {order.scheduledDate || "—"}
          {order.scheduledTime ? ` ${order.scheduledTime}` : ""}
        </p>
        <p>
          <span className="text-muted-foreground">電話：</span>
          {phoneDisplay(order)}
        </p>
        <p>
          <span className="text-muted-foreground">地址：</span>
          {order.installAddress || "—"}
        </p>
        <p>
          <span className="text-muted-foreground">工作內容：</span>
          {order.title || order.description || order.notes || "—"}
        </p>
      </div>

      {reminder.message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            reminder.severity === "red"
              ? "bg-red-100 text-red-800 border border-red-300"
              : "bg-amber-100 text-amber-900 border border-amber-300"
          }`}
        >
          {reminder.message}
        </div>
      )}

      {reopenInfo && (order.status === "待施工" || order.status === "待處理") && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2.5 text-sm text-red-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            案件退回重拍
          </p>
          <p>
            <span className="text-red-700/80">原因：</span>
            {reopenInfo.returnReason}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs border-t pt-2">
        <p>出發：{formatTaipeiDateTime(progress?.departedAt)}</p>
        <p>到場：{formatTaipeiDateTime(progress?.arrivedAt)}</p>
        <p>暫停：{formatTaipeiDateTime(progress?.pausedAt)}</p>
        <p>恢復：{formatTaipeiDateTime(progress?.resumedAt)}</p>
        <p>完工：{formatTaipeiDateTime(progress?.completedAt)}</p>
        <p>
          暫停累計：
          {progress?.pauseTotalMinutes != null && progress.pauseTotalMinutes > 0
            ? `${progress.pauseTotalMinutes} 分鐘`
            : "—"}
        </p>
      </div>

      {fieldStatus === "completed" && progress && (
        <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
          <p>交通時間：{progress.travelDurationLabel}</p>
          <p>現場工時：{progress.workDurationLabel}</p>
          <p>案件總時間：{progress.totalDurationLabel}</p>
        </div>
      )}

      {!readOnly && fieldStatus !== "completed" && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-muted-foreground">施工流程</p>
          <div className="grid grid-cols-1 gap-2">
            <FlowButton
              icon={Car}
              label={progress?.departedAt ? "已出發" : "出發中"}
              visual={departVisual}
              loading={departMut.isPending}
              disabled={!canDepart || busy}
              onClick={() => departMut.mutate()}
            />
            <FlowButton
              icon={MapPin}
              label={progress?.arrivedAt ? "已到場" : "已到場"}
              visual={arriveVisual}
              loading={arriveMut.isPending}
              disabled={!canArrive || busy}
              onClick={() => arriveMut.mutate()}
            />
            {fieldStatus === "paused" ? (
              <FlowButton
                icon={Play}
                label="恢復施工"
                visual={resumeVisual}
                loading={resumeMut.isPending}
                disabled={!canResume || busy}
                onClick={() => resumeMut.mutate()}
              />
            ) : (
              <FlowButton
                icon={Pause}
                label="暫停施工"
                visual={pauseVisual}
                loading={pauseMut.isPending}
                disabled={!canPause || busy}
                onClick={() => setPauseOpen(true)}
              />
            )}
            <FlowButton
              icon={Flag}
              label={fieldStatus === "completed" ? "已完成" : "施工完成"}
              visual={completeVisual}
              loading={completeMut.isPending}
              disabled={!canComplete || busy}
              onClick={() => {
                setChecklist(emptyCompletionChecklist());
                setCompleteOpen(true);
              }}
            />
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 border-orange-400 text-orange-700"
              disabled={(!progress?.departedAt && !progress?.arrivedAt) || busy}
              onClick={() => setUnableOpen(true)}
            >
              無法完成
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => setBackfillOpen(true)}
            >
              <ClipboardList className="h-3.5 w-3.5 mr-1" />
              申請補登
            </Button>
          </div>
        </div>
      )}

      {/* Pause dialog */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>暫停施工</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>原因（必選）</Label>
              <Select value={pauseReason} onValueChange={setPauseReason}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇原因" />
                </SelectTrigger>
                <SelectContent>
                  {PAUSE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(pauseReason === "其他" || pauseReason) && (
              <div className="space-y-1.5">
                <Label>{pauseReason === "其他" ? "備註（必填）" : "備註"}</Label>
                <Textarea value={pauseNote} onChange={(e) => setPauseNote(e.target.value)} rows={3} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                !pauseReason ||
                (pauseReason === "其他" && !pauseNote.trim()) ||
                pauseMut.isPending
              }
              onClick={() => pauseMut.mutate()}
            >
              {pauseMut.isPending ? "處理中…" : "確認暫停"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete checklist */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>確認施工完成</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {COMPLETION_CHECKLIST_KEYS.map((key) => (
              <label key={key} className="flex items-start gap-3 text-sm cursor-pointer">
                <Checkbox
                  checked={checklist[key]}
                  onCheckedChange={(v) =>
                    setChecklist((c) => ({ ...c, [key]: v === true }))
                  }
                />
                <span>{COMPLETION_CHECKLIST_LABELS[key]}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!isChecklistComplete(checklist) || completeMut.isPending}
              onClick={() => completeMut.mutate()}
            >
              {completeMut.isPending ? "處理中…" : "確認施工完成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unable */}
      <Dialog open={unableOpen} onOpenChange={setUnableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>回報無法完成</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>原因</Label>
              <Select value={unableReason} onValueChange={setUnableReason}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇原因" />
                </SelectTrigger>
                <SelectContent>
                  {UNABLE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {unableReason === "其他" && (
              <div className="space-y-1.5">
                <Label>備註（必填）</Label>
                <Textarea value={unableNote} onChange={(e) => setUnableNote(e.target.value)} rows={3} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnableOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                !unableReason ||
                (unableReason === "其他" && !unableNote.trim()) ||
                unableMut.isPending
              }
              onClick={() => unableMut.mutate()}
            >
              {unableMut.isPending ? "送出中…" : "送出"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backfill */}
      <Dialog open={backfillOpen} onOpenChange={setBackfillOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>申請補登</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            補登不會直接覆蓋原始紀錄，送出後待審核。
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>漏按步驟</Label>
              <Select
                value={backfillStep}
                onValueChange={(v) => setBackfillStep(v as BackfillStep)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="請選擇" />
                </SelectTrigger>
                <SelectContent>
                  {BACKFILL_STEPS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {BACKFILL_STEP_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>實際時間</Label>
              <Input
                type="datetime-local"
                value={backfillTime}
                onChange={(e) => setBackfillTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>原因</Label>
              <Input value={backfillReason} onChange={(e) => setBackfillReason(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea value={backfillNote} onChange={(e) => setBackfillNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackfillOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                !backfillStep || !backfillTime || !backfillReason.trim() || backfillMut.isPending
              }
              onClick={() => backfillMut.mutate()}
            >
              {backfillMut.isPending ? "送出中…" : "送出申請"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowButton({
  icon: Icon,
  label,
  visual,
  loading,
  disabled,
  onClick,
}: {
  icon: typeof Car;
  label: string;
  visual: BtnVisual;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || visual === "done" || visual === "pending"}
      onClick={onClick}
      className={`w-full min-h-[48px] rounded-xl border-2 px-3 py-2.5 flex items-center justify-center gap-2 text-base font-semibold transition-colors ${btnClass(visual)} ${
        disabled && visual !== "done" ? "opacity-70" : ""
      }`}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      {label}
    </button>
  );
}
