import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, AlertTriangle } from "lucide-react";
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
import {
  type FieldProgressRecord,
  UNABLE_REASONS,
  formatTaipeiDateTime,
  departFieldProgress,
  arriveFieldProgress,
  completeFieldProgress,
  reportUnableFieldProgress,
  listMyFieldProgress,
} from "@/lib/fieldProgressApi";

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

function phoneDisplay(order: WorkOrderCardData): string {
  return [order.mobilePhone, order.telephone].filter(Boolean).join(" / ") || "—";
}

interface Props {
  order: WorkOrderCardData;
  progress: FieldProgressRecord | null;
  onProgressUpdated?: () => void;
}

export function EngineerWorkOrderCard({ order, progress, onProgressUpdated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  const statusLabel = order.status === "已完成" || isCompleted ? "已完成" : "待施工";

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

      {!isCompleted && (
        <div className="grid grid-cols-1 gap-2 pt-1">
          <ProgressActionButton
            label="前往案場"
            done={hasDeparted}
            doneTime={progress?.departedAt}
            disabled={hasDeparted || departMut.isPending}
            loading={departMut.isPending}
            onClick={() => departMut.mutate()}
          />
          <ProgressActionButton
            label="到達施工"
            done={hasArrived}
            doneTime={progress?.arrivedAt}
            disabled={!hasDeparted || hasArrived || arriveMut.isPending}
            loading={arriveMut.isPending}
            onClick={() => arriveMut.mutate()}
          />
          <ProgressActionButton
            label="完工離場"
            done={isCompleted}
            doneTime={progress?.completedAt}
            disabled={!hasArrived || isCompleted || completeMut.isPending}
            loading={completeMut.isPending}
            variant="default"
            onClick={() => setConfirmComplete(true)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs text-amber-700 border-amber-300"
            disabled={(!hasDeparted && !hasArrived) || unableMut.isPending}
            onClick={() => setUnableOpen(true)}
          >
            {unableMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            無法完成
          </Button>
        </div>
      )}

      {isCompleted && progress && (
        <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-2">
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
            <AlertDialogCancel>取消</AlertDialogCancel>
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

function ProgressActionButton({
  label,
  done,
  doneTime,
  disabled,
  loading,
  onClick,
  variant = "outline",
}: {
  label: string;
  done: boolean;
  doneTime?: string | null;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  variant?: "default" | "outline";
}) {
  return (
    <Button
      type="button"
      variant={done ? "secondary" : variant}
      className="h-12 w-full text-base justify-between px-4"
      disabled={disabled || done}
      onClick={onClick}
    >
      <span className="flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : done ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : null}
        {label}
      </span>
      {done && doneTime && (
        <span className="text-xs font-normal text-muted-foreground">
          {formatTaipeiDateTime(doneTime)}
        </span>
      )}
    </Button>
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
