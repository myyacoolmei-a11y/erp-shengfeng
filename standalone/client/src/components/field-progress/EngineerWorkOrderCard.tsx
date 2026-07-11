import { useState, type ElementType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Loader2,
  AlertTriangle,
  Car,
  MapPin,
  Flag,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  type FieldProgressRecord,
  UNABLE_REASONS,
  formatTaipeiDateTime,
  departFieldProgress,
  arriveFieldProgress,
  completeFieldProgress,
  reportUnableFieldProgress,
} from "@/lib/fieldProgressApi";
import { fetchWorkOrderReopenInfo } from "@/lib/notificationsApi";

interface WorkOrderCardData {
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
  status?: string | null;
}

type StepVisualState = "done" | "active" | "pending";

interface StepConfig {
  key: "depart" | "arrive" | "complete";
  stepNum: 1 | 2 | 3;
  label: string;
  doneLabel: string;
  icon: ElementType;
  done: boolean;
  active: boolean;
  doneTime?: string | null;
  loading: boolean;
  onClick: () => void;
}

function phoneDisplay(order: WorkOrderCardData): string {
  return [order.mobilePhone, order.telephone].filter(Boolean).join(" / ") || "—";
}

function nextStepHint(hasDeparted: boolean, hasArrived: boolean, isCompleted: boolean): string {
  if (isCompleted) return "施工流程已完成";
  if (!hasDeparted) return "下一步：請按「前往案場」";
  if (!hasArrived) return "下一步：請按「到達施工」";
  return "下一步：請按「完工離場」";
}

interface Props {
  order: WorkOrderCardData;
  progress: FieldProgressRecord | null;
  onProgressUpdated?: () => void;
}

export function EngineerWorkOrderCard({ order, progress, onProgressUpdated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reopenInfo } = useQuery({
    queryKey: ["work-order-reopen", order.id],
    queryFn: () => fetchWorkOrderReopenInfo(order.id),
    enabled: order.status === "待施工",
  });
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [unableOpen, setUnableOpen] = useState(false);
  const [unableReason, setUnableReason] = useState<string>("");
  const [unableNote, setUnableNote] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["field-progress", "mine"] });
    queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    onProgressUpdated?.();
  };

  const mutationOpts = (successMsg: string) => ({
    onSuccess: () => {
      toast({ title: successMsg });
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "操作失敗";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const departMut = useMutation({
    mutationFn: () => departFieldProgress(order.id),
    ...mutationOpts("已記錄前往案場"),
  });

  const arriveMut = useMutation({
    mutationFn: () => arriveFieldProgress(order.id),
    ...mutationOpts("已記錄到達施工"),
  });

  const completeMut = useMutation({
    mutationFn: () => completeFieldProgress(order.id),
    onSuccess: () => {
      toast({ title: "已完工離場" });
      setConfirmComplete(false);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "操作失敗";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const unableMut = useMutation({
    mutationFn: () => reportUnableFieldProgress(order.id, {
      reason: unableReason,
      note: unableNote || undefined,
    }),
    onSuccess: () => {
      toast({ title: "已回報無法完成" });
      setUnableOpen(false);
      setUnableReason("");
      setUnableNote("");
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "操作失敗";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const isCompleted = !!progress?.completedAt;
  const hasDeparted = !!progress?.departedAt;
  const hasArrived = !!progress?.arrivedAt;
  const hasUnable = !!progress?.unableToCompleteAt;

  const flowBusy = departMut.isPending || arriveMut.isPending || completeMut.isPending;

  const statusLabel = order.status === "已完成" || isCompleted ? "已完成" : "待施工";

  const steps: StepConfig[] = [
    {
      key: "depart",
      stepNum: 1,
      label: "前往案場",
      doneLabel: "已前往案場",
      icon: Car,
      done: hasDeparted,
      active: !hasDeparted && !isCompleted,
      doneTime: progress?.departedAt,
      loading: departMut.isPending,
      onClick: () => departMut.mutate(),
    },
    {
      key: "arrive",
      stepNum: 2,
      label: "到達施工",
      doneLabel: "已到達施工",
      icon: MapPin,
      done: hasArrived,
      active: hasDeparted && !hasArrived && !isCompleted,
      doneTime: progress?.arrivedAt,
      loading: arriveMut.isPending,
      onClick: () => arriveMut.mutate(),
    },
    {
      key: "complete",
      stepNum: 3,
      label: "完工離場",
      doneLabel: "已完工離場",
      icon: Flag,
      done: isCompleted,
      active: hasArrived && !isCompleted,
      doneTime: progress?.completedAt,
      loading: completeMut.isPending,
      onClick: () => setConfirmComplete(true),
    },
  ];

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-muted-foreground">{order.workOrderNumber || `#${order.id}`}</p>
          <p className="text-base font-semibold mt-0.5">{order.customerName || "—"}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
          statusLabel === "已完成" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}>
          {statusLabel}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <p><span className="text-muted-foreground">預定施工：</span>
          {order.scheduledDate || "—"}{order.scheduledTime ? ` ${order.scheduledTime}` : ""}
        </p>
        <p><span className="text-muted-foreground">電話：</span>{phoneDisplay(order)}</p>
        <p><span className="text-muted-foreground">地址：</span>{order.installAddress || "—"}</p>
        <p><span className="text-muted-foreground">工程項目：</span>{order.title || "—"}</p>
        {order.description && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{order.description}</p>
        )}
      </div>

      {reopenInfo && order.status === "待施工" && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2.5 text-sm text-red-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            案件退回重拍
          </p>
          <p><span className="text-red-700/80">原因：</span>{reopenInfo.returnReason}</p>
          {reopenInfo.returnNote && (
            <p><span className="text-red-700/80">說明：</span>{reopenInfo.returnNote}</p>
          )}
          <p className="text-xs text-red-700/70">
            {reopenInfo.reopenedByName ? `${reopenInfo.reopenedByName} · ` : ""}
            {new Date(reopenInfo.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
          </p>
        </div>
      )}

      {hasUnable && progress && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-0.5">
          <p className="font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            異常：{progress.unableReason}
            {progress.unableReason === "其他" && progress.unableNote ? `（${progress.unableNote}）` : ""}
          </p>
          <p>回報人：{progress.engineerName}</p>
          <p>回報時間：{formatTaipeiDateTime(progress.unableToCompleteAt)}</p>
        </div>
      )}

      <div className="pt-1 space-y-3">
        <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5 text-sm text-foreground/80">
          {nextStepHint(hasDeparted, hasArrived, isCompleted)}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            施工流程
          </p>
          <div className="space-y-0">
            {steps.map((step, index) => (
              <div key={step.key}>
                <ProgressStepCard
                  step={step}
                  flowBusy={flowBusy}
                />
                {index < steps.length - 1 && (
                  <div className="flex pl-[1.375rem] py-1" aria-hidden>
                    <div className="flex flex-col items-center w-6">
                      <div className="w-0.5 h-2 bg-border" />
                      <ChevronDown className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                      <div className="w-0.5 h-2 bg-border" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {!isCompleted && (
          <div className="pt-4 mt-4 border-t space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              特殊狀況
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base font-medium bg-white border-2 border-orange-400 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-500"
              disabled={(!hasDeparted && !hasArrived) || unableMut.isPending || flowBusy}
              onClick={() => setUnableOpen(true)}
            >
              {unableMut.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : null}
              無法完成
            </Button>
          </div>
        )}
      </div>

      {isCompleted && progress && (
        <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-3">
          <p>前往：{formatTaipeiDateTime(progress.departedAt)}</p>
          <p>到達：{formatTaipeiDateTime(progress.arrivedAt)}</p>
          <p>完工：{formatTaipeiDateTime(progress.completedAt)}</p>
          <p>總耗時：{progress.totalDurationLabel}</p>
        </div>
      )}

      <AlertDialog open={confirmComplete} onOpenChange={setConfirmComplete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認完工離場</AlertDialogTitle>
            <AlertDialogDescription>
              確認此案件已完工並離開案場？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completeMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => completeMut.mutate()} disabled={completeMut.isPending}>
              {completeMut.isPending ? "處理中…" : "確認完工"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={unableOpen} onOpenChange={setUnableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>回報無法完成</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>原因</Label>
              <Select value={unableReason} onValueChange={setUnableReason}>
                <SelectTrigger><SelectValue placeholder="請選擇原因" /></SelectTrigger>
                <SelectContent>
                  {UNABLE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
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
            <Button variant="outline" onClick={() => setUnableOpen(false)}>取消</Button>
            <Button
              disabled={!unableReason || (unableReason === "其他" && !unableNote.trim()) || unableMut.isPending}
              onClick={() => unableMut.mutate()}
            >
              {unableMut.isPending ? "送出中…" : "送出"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgressStepCard({
  step,
  flowBusy,
}: {
  step: StepConfig;
  flowBusy: boolean;
}) {
  const visual: StepVisualState = step.done ? "done" : step.active ? "active" : "pending";
  const Icon = step.icon;
  const clickable = visual === "active" && !flowBusy;

  const ballClass =
    visual === "done"
      ? "bg-green-600 text-white border-green-600"
      : visual === "active"
        ? "bg-lime-400 text-gray-900 border-lime-500"
        : "bg-white text-muted-foreground border-gray-300";

  const cardClass =
    visual === "done"
      ? "bg-green-50 border-green-200 text-green-800 cursor-default"
      : visual === "active"
        ? "bg-lime-400 border-lime-500 text-gray-900 cursor-pointer hover:bg-lime-300 active:bg-lime-500 shadow-sm"
        : "bg-white border-gray-200 text-muted-foreground cursor-not-allowed";

  const titleClass =
    visual === "done"
      ? "font-semibold text-green-800"
      : visual === "active"
        ? "font-bold text-gray-900"
        : "font-medium text-muted-foreground";

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? step.onClick : undefined}
      className={`w-full min-h-[60px] rounded-xl border-2 px-3 py-3 flex items-center gap-3 text-left transition-colors ${cardClass}`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-base font-bold ${ballClass}`}
        aria-hidden
      >
        {visual === "done" ? (
          <Check className="h-5 w-5" strokeWidth={3} />
        ) : (
          step.stepNum
        )}
      </span>

      <span className="flex-1 min-w-0">
        <span className={`flex items-center gap-2 text-lg leading-tight ${titleClass}`}>
          {step.loading ? (
            <Loader2 className="h-5 w-5 animate-spin shrink-0" />
          ) : visual === "active" ? (
            <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} />
          ) : null}
          {visual === "done" ? step.doneLabel : step.label}
        </span>
        {visual === "done" && step.doneTime && (
          <span className="block mt-1 text-sm font-normal text-green-700/80">
            {formatTaipeiDateTime(step.doneTime)}
          </span>
        )}
      </span>
    </button>
  );
}

export function useMyFieldProgressMap() {
  const queryClient = useQueryClient();
  return {
    queryKey: ["field-progress", "mine"] as const,
    queryFn: listMyFieldProgress,
    select: (rows: FieldProgressRecord[]) => {
      const map = new Map<number, FieldProgressRecord>();
      for (const r of rows) map.set(r.workOrderId, r);
      return map;
    },
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["field-progress", "mine"] }),
  };
}
