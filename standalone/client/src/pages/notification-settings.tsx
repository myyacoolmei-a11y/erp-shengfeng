import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell, Smartphone, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import {
  fetchNotificationPrefs,
  updateNotificationPrefs,
  subscribeWebPush,
} from "@/lib/notificationsApi";

const PREFS_KEY = ["notification-prefs"];

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isStandalonePwa(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isIos } = usePwaInstall();
  const [pushBusy, setPushBusy] = useState(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: fetchNotificationPrefs,
  });

  const updateMut = useMutation({
    mutationFn: updateNotificationPrefs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PREFS_KEY });
      toast({ title: "通知設定已更新" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  async function handleEnablePush() {
    setPushBusy(true);
    try {
      const result = await subscribeWebPush();
      if (result.ok) {
        toast({ title: "手機推播已開啟" });
        qc.invalidateQueries({ queryKey: PREFS_KEY });
      } else if (result.reason === "denied") {
        toast({
          title: "無法開啟通知",
          description: result.message,
          variant: "destructive",
        });
      } else {
        toast({ title: result.message ?? "推播設定失敗", variant: "destructive" });
      }
    } finally {
      setPushBusy(false);
    }
  }

  const permission = typeof Notification !== "undefined" ? Notification.permission : "default";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">通知設定</h1>
        <p className="text-muted-foreground text-sm mt-1">管理站內通知、手機推播與 LINE 通知偏好</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">通知管道</CardTitle>
          <CardDescription>依需求開啟或關閉各管道（不影響派工操作）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">載入中…</p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>ERP 站內通知</Label>
                  <p className="text-xs text-muted-foreground">右上角鈴鐺顯示</p>
                </div>
                <Switch
                  checked={prefs?.notifyInApp ?? true}
                  onCheckedChange={v => updateMut.mutate({ notifyInApp: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>手機系統推播</Label>
                  <p className="text-xs text-muted-foreground">鎖定畫面推播（需先訂閱）</p>
                </div>
                <Switch
                  checked={prefs?.notifyWebPush ?? true}
                  onCheckedChange={v => updateMut.mutate({ notifyWebPush: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>LINE 通知</Label>
                  <p className="text-xs text-muted-foreground">
                    {prefs?.lineBound ? `已綁定：${prefs.lineDisplayName ?? "LINE"}` : "尚未綁定 LINE"}
                  </p>
                </div>
                <Switch
                  checked={prefs?.notifyLine ?? true}
                  disabled={!prefs?.lineBound}
                  onCheckedChange={v => updateMut.mutate({ notifyLine: v })}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            手機系統推播
          </CardTitle>
          <CardDescription>點擊下方按鈕才會要求通知權限，不會自動跳出</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!prefs?.webPushConfigured && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              伺服器尚未設定 VAPID 金鑰，無法使用 Web Push。
            </p>
          )}

          {(isIos || isIosSafari()) && !isStandalonePwa() && (
            <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-blue-900">
              <p className="font-semibold">iPhone 設定步驟：</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>使用 Safari 開啟 ERP</li>
                <li>點「分享」→「加入主畫面」</li>
                <li>從主畫面圖示開啟 ERP</li>
                <li>再按下方「開啟手機通知」並允許</li>
              </ol>
            </div>
          )}

          {permission === "denied" && (
            <div className="text-sm bg-red-50 border border-red-200 rounded-lg p-3 text-red-900">
              <p className="font-semibold">通知權限已被拒絕</p>
              <p className="text-xs mt-1">
                iPhone：設定 → 通知 → 找到「晟風 ERP」→ 允許通知<br />
                Android：設定 → 應用程式 → Chrome / PWA → 通知 → 允許
              </p>
            </div>
          )}

          <Button onClick={handleEnablePush} disabled={pushBusy || !prefs?.webPushConfigured}>
            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
            開啟手機通知
          </Button>

          {prefs?.pushDevices && prefs.pushDevices.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">已訂閱裝置：</p>
              {prefs.pushDevices.map(d => (
                <p key={d.id}>• {d.deviceName ?? "裝置"}（{d.enabled ? "啟用" : "停用"}）</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LINE 綁定</CardTitle>
          <CardDescription>綁定 LINE 官方帳號以接收個人推播</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/reminder-settings">前往 LINE 綁定設定</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
