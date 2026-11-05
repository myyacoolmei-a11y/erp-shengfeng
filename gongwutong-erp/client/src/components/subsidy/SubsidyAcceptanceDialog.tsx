import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  confirmSubsidyAcceptance,
  fetchCaseTimeline,
  updateSubsidyProcessFlags,
} from "@/lib/operationCenterApi";
import {
  emptySubsidyAcceptanceChecklist,
  requiredSubsidyAcceptanceKeys,
  SUBSIDY_ACCEPTANCE_LABELS,
  type SubsidyAcceptanceChecklist,
  type SubsidyAcceptanceKey,
} from "../../../../shared/operationCenterConstants.ts";

export function SubsidyAcceptanceDialog({
  workOrderId,
  open,
  onOpenChange,
  moeaRequired: moeaRequiredProp,
}: {
  workOrderId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moeaRequired?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["operation-center-case", workOrderId],
    queryFn: () => fetchCaseTimeline(workOrderId),
    enabled: open && !!workOrderId,
  });

  const moeaRequired = moeaRequiredProp ?? data?.acceptance.moeaRequired ?? false;
  const [moeaToggle, setMoeaToggle] = useState(moeaRequired);
  const [checklist, setChecklist] = useState<SubsidyAcceptanceChecklist>(
    emptySubsidyAcceptanceChecklist(),
  );

  useEffect(() => {
    if (!open) return;
    const flags = data?.acceptance.flags;
    setMoeaToggle(data?.acceptance.moeaRequired ?? moeaRequiredProp ?? false);
    setChecklist({
      mofCompleted: !!flags?.mofCompleted,
      moeaCompleted: !!flags?.moeaCompleted,
      lFolderCreated: !!flags?.lFolderCreated,
      adminLineAlbumCreated: !!flags?.adminLineAlbumCreated,
      mofScreenshotSaved: !!flags?.mofScreenshotSaved,
      moeaScreenshotSaved: !!flags?.moeaScreenshotSaved,
      arAmountConfirmed: !!flags?.arAmountConfirmed,
    });
  }, [open, data, moeaRequiredProp]);

  const visibleKeys = useMemo(
    () => requiredSubsidyAcceptanceKeys(moeaToggle),
    [moeaToggle],
  );

  const allChecked = visibleKeys.every(k => checklist[k]);
  const nowText = new Date().toLocaleString("zh-TW");

  const mute = useMutation({
    mutationFn: async () => {
      if (moeaToggle !== (data?.acceptance.moeaRequired ?? false)) {
        await updateSubsidyProcessFlags(workOrderId, { moeaRequired: moeaToggle });
      }
      return confirmSubsidyAcceptance(workOrderId, {
        ...checklist,
        moeaCompleted: moeaToggle ? checklist.moeaCompleted : true,
        moeaScreenshotSaved: moeaToggle ? checklist.moeaScreenshotSaved : true,
      });
    },
    onSuccess: (res: any) => {
      toast({
        title: "已確認完成補助",
        description: res?.lineNotify?.sent
          ? `已通知業務 ${res.lineNotify.salesName || ""}`
          : res?.lineNotify?.reason
            ? `補助已完成（LINE：${res.lineNotify.reason}）`
            : "若已收款，系統會自動結案",
      });
      void qc.invalidateQueries({ queryKey: ["admin-workbench"] });
      void qc.invalidateQueries({ queryKey: ["/api/admin-workbench"] });
      void qc.invalidateQueries({ queryKey: ["operation-center"] });
      void qc.invalidateQueries({ queryKey: ["admin-case-detail", workOrderId] });
      void qc.invalidateQueries({ queryKey: ["/api/work-orders"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "確認失敗",
        description: err?.message || "請稍後再試",
        variant: "destructive",
      });
    },
  });

  function toggle(key: SubsidyAcceptanceKey) {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>補助完成確認</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">請確認以下項目：</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={moeaToggle}
              onChange={e => setMoeaToggle(e.target.checked)}
            />
            本案需經濟部補助
          </label>

          <ul className="space-y-2">
            {visibleKeys.map(key => (
              <li key={key}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!!checklist[key]}
                    onChange={() => toggle(key)}
                  />
                  <span>{SUBSIDY_ACCEPTANCE_LABELS[key]}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">承辦行政：</span>
              {user?.displayName || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">完成時間：</span>
              {nowText}
            </p>
          </div>

          {!allChecked && (
            <p className="text-xs text-amber-800">全部勾選完成後才能送出</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="bg-green-700 hover:bg-green-800"
            disabled={!allChecked || mute.isPending}
            onClick={() => mute.mutate()}
          >
            確認完成補助
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
