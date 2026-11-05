import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { adminUpdateUserNotificationPrefs } from "@/lib/reminderSettingsApi";
import {
  NOTIFICATION_PREF_ITEMS,
  defaultUserNotificationPrefs,
  type UserNotificationPrefs,
} from "@/lib/notificationUserPrefs";

interface UserNotificationPrefsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  displayName: string;
  initialPrefs: UserNotificationPrefs | null;
  onSaved: () => void;
}

export function UserNotificationPrefsDialog({
  open,
  onOpenChange,
  userId,
  displayName,
  initialPrefs,
  onSaved,
}: UserNotificationPrefsDialogProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<UserNotificationPrefs>(() => defaultUserNotificationPrefs());

  useEffect(() => {
    if (initialPrefs) setDraft(initialPrefs);
    else setDraft(defaultUserNotificationPrefs());
  }, [initialPrefs, open]);

  const saveMutation = useMutation({
    mutationFn: (prefs: Partial<UserNotificationPrefs>) =>
      adminUpdateUserNotificationPrefs(userId, prefs),
    onSuccess: () => {
      toast({ title: "通知權限已儲存" });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>可接收通知 — {displayName}</DialogTitle>
          <DialogDescription>
            依個人設定決定是否接收各類通知。僅管理員可修改。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {NOTIFICATION_PREF_ITEMS.map(item => (
            <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Switch
                checked={draft[item.key]}
                disabled={saveMutation.isPending}
                onCheckedChange={checked => setDraft(prev => ({ ...prev, [item.key]: checked }))}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
