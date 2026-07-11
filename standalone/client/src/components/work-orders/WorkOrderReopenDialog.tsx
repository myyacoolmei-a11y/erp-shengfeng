import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const RETURN_REASONS = [
  "照片錯誤",
  "照片不足",
  "資料填寫錯誤",
  "尚未完成施工",
  "其他",
] as const;

interface Props {
  open: boolean;
  workOrderLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string, note: string) => void;
  pending?: boolean;
}

export function WorkOrderReopenDialog({ open, workOrderLabel, onCancel, onConfirm, pending }: Props) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  function handleConfirm() {
    if (!reason) return;
    if (reason === "其他" && !note.trim()) return;
    onConfirm(reason, note.trim());
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>退回重拍 — {workOrderLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          將派工單及所有工程師施工狀態重設為「待施工」，並保留工時、照片與操作歷程。
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>退回原因 *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="請選擇原因" /></SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>補充說明{reason === "其他" ? " *" : ""}</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="可輸入詳細說明"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
          <Button
            onClick={handleConfirm}
            disabled={pending || !reason || (reason === "其他" && !note.trim())}
          >
            確認退回
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
