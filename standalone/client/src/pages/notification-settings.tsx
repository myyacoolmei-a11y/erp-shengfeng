import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Smartphone, Loader2, RefreshCw, Send, Wrench, ShieldCheck } from "lucide-react";
import { LineBindingPanel } from "@/components/notifications/LineBindingPanel";
import { APP_BRAND } from "@/lib/appBrand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useAuth, hasRole } from "@/contexts/auth-context";
import {
  fetchNotificationPrefs,
  updateNotificationPrefs,
} from "@/lib/notificationsApi";
import {
  collectWebPushDiagnostics,
  runPushSubscribeFlow,
  reregisterServiceWorker,
  sendServerTestPush,
  derivePushSetupStatus,
  PUSH_STATUS_LABELS,
  isIosDevice,
  isPwaStandalone,
  type WebPushDiagnosticState,
  type WebPushTestResult,
  type PushSetupStatus,
} from "@/lib/webPushDiagnostics";

const PREFS_KEY = ["notification-prefs"];

function PushStatusBanner({
  status,
  testResult,
}: {
  status: PushSetupStatus;
  testResult: WebPushTestResult | null;
}) {
  const label = PUSH_STATUS_LABELS[status];
  const tone =
    status === "test_passed" || status === "subscribed"
      ? "bg-green-50 border-green-200 text-green-900"
      : status === "test_failed" || status === "permission_denied"
        ? "bg-red-50 border-red-200 text-red-900"
        : "bg-amber-50 border-amber-200 text-amber-900";

  const failedDetail = testResult?.results.find(r => !r.success);

  return (
    <div className={`rounded-lg border p-3 text-sm ${tone}`}>
      <p className="font-semibold">Web Push 狀態：{label}</p>
      {status === "test_failed" && failedDetail && (
        <p className="text-xs mt-1 break-all">
          HTTP {failedDetail.statusCode ?? "?"} · {failedDetail.errorMessage ?? "未知錯誤"}
        </p>
      )}
      {status === "test_passed" && testResult && (
        <p className="text-xs mt-1">
          伺服器 web-push 發送成功 {testResult.successCount}/{testResult.sentCount} 筆（與 LINE 分開記錄）
        </p>
      )}
      <p className="text-xs mt-1 text-muted-foreground">
        LINE 通知成功 ≠ Web Push 成功，請以本頁測試推播結果為準。
      </p>
    </div>
  );
}

function yn(v: boolean): string {
  return v ? "是" : "否";
}

function exists(v: boolean): string {
  return v ? "存在" : "不存在";
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}：</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}

function DiagnosticPanel({
  diag,
  testResult,
}: {
  diag: WebPushDiagnosticState | null;
  testResult: WebPushTestResult | null;
}) {
  if (!diag) return <p className="text-sm text-muted-foreground">診斷載入中…</p>;

  const browserSubLabel = diag.browserSubscriptionComplete
    ? "存在（含 endpoint / p256dh / auth）"
    : diag.browserSubscriptionExists
      ? "存在但不完整"
      : "不存在";

  const dbSubLabel = diag.dbEnabledCount === 0
    ? "此手機尚未完成推播訂閱"
    : diag.dbSubscriptionForCurrentDevice
      ? "已綁定目前裝置"
      : "資料庫有記錄，但非此裝置 endpoint";

  const httpStatusCodes = testResult?.results.length
    ? testResult.results.map(r => `#${r.subscriptionId}→${r.statusCode ?? "?"}`).join("、")
    : "—";

  const errorMessages = testResult?.results.filter(r => !r.success).length
    ? testResult.results
      .filter(r => !r.success)
      .map(r => `#${r.subscriptionId} ${r.errorMessage ?? "未知錯誤"}`)
      .join("；")
    : testResult?.foundCount === 0
      ? "此手機尚未完成推播訂閱"
      : "—";

  const needsResubscribe = testResult?.results.some(r => r.deleted || r.requiresResubscribe);

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
      <p className="font-semibold text-sm mb-2">Web Push 即時診斷</p>
      <DiagRow label="PWA 主畫面模式" value={yn(diag.pwaStandalone)} />
      <DiagRow label="HTTPS" value={yn(diag.isHttps)} />
      <DiagRow label="通知權限" value={String(diag.notificationPermission)} />
      <DiagRow label="Service Worker 註冊" value={yn(diag.serviceWorkerRegistered)} />
      <DiagRow label="Service Worker 狀態" value={diag.serviceWorkerActivated ? "activated" : diag.serviceWorkerState} />
      <DiagRow label="Service Worker Controller" value={exists(diag.serviceWorkerController)} />
      <DiagRow label="Service Worker Scope" value={diag.serviceWorkerScope ?? "—"} />
      <DiagRow label="push-sw.js 監聽 push" value={yn(diag.pushSwHasPushListener)} />
      <DiagRow label="瀏覽器 Subscription" value={browserSubLabel} />
      <DiagRow label="資料庫 Subscription" value={dbSubLabel} />
      <DiagRow label="有效裝置數" value={String(diag.dbEnabledCount)} />
      <DiagRow label="後端實際發送數" value={testResult ? String(testResult.sentCount) : "—"} />
      <DiagRow label="成功數" value={testResult ? String(testResult.successCount) : "—"} />
      <DiagRow label="失敗數" value={testResult ? String(testResult.failCount) : "—"} />
      <DiagRow label="HTTP 狀態碼" value={httpStatusCodes} />
      <DiagRow label="錯誤訊息" value={errorMessages} />
      {diag.vapidKeyMismatch && (
        <p className="text-xs text-amber-800 pt-2">VAPID 公鑰不一致，請按「訂閱並儲存推播」重新訂閱</p>
      )}
      {needsResubscribe && (
        <p className="text-xs text-amber-800">部分訂閱已失效或被刪除，請重新訂閱推播</p>
      )}
      {testResult && testResult.results.length > 0 && (
        <div className="mt-3 pt-2 border-t text-xs space-y-1">
          <p className="font-medium">每筆 Web Push 明細</p>
          {testResult.results.map(r => (
            <p key={r.subscriptionId} className="text-muted-foreground break-all">
              #{r.subscriptionId} {r.deviceName ?? "裝置"} — HTTP {r.statusCode ?? "?"} — {r.success ? "成功" : "失敗"}
              {r.deleted ? " [已刪除失效訂閱]" : ""}
              {r.errorMessage ? ` · ${r.errorMessage}` : ""}
            </p>
          ))}
        </div>
      )}
      {diag.errors.length > 0 && (
        <div className="mt-2 pt-2 border-t text-xs text-amber-800 space-y-0.5">
          {diag.errors.map(e => <p key={e}>⚠ {e}</p>)}
        </div>
      )}
      {diag.serviceWorkerScriptUrl && (
        <p className="text-[10px] text-muted-foreground mt-2 break-all">SW script: {diag.serviceWorkerScriptUrl}</p>
      )}
    </div>
  );
}

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isIOS } = usePwaInstall();
  const isAdmin = hasRole(user, "super_admin", "owner", "admin");
  const isIphone = isIosDevice();
  const canShowEnableButton = !isIphone || isPwaStandalone();
  const [diag, setDiag] = useState<WebPushDiagnosticState | null>(null);
  const [testResult, setTestResult] = useState<WebPushTestResult | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [swBusy, setSwBusy] = useState(false);

  const refreshDiagnostics = useCallback(async () => {
    const d = await collectWebPushDiagnostics();
    setDiag(d);
    return d;
  }, []);

  useEffect(() => {
    void refreshDiagnostics();
  }, [refreshDiagnostics]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `通知中心 — ${APP_BRAND.pwaName}`;
    return () => { document.title = previousTitle; };
  }, []);

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
    setTestResult(null);
    try {
      const result = await runPushSubscribeFlow(isIOS ? "iPhone" : undefined);
      setDiag(result.diagnostics);
      if (result.ok) {
        toast({ title: result.message });
        qc.invalidateQueries({ queryKey: PREFS_KEY });
      } else {
        toast({ title: result.message, variant: "destructive" });
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleTestPush() {
    setTestBusy(true);
    try {
      await refreshDiagnostics();
      const result = await sendServerTestPush();
      setTestResult(result);
      await refreshDiagnostics();
      qc.invalidateQueries({ queryKey: PREFS_KEY });

      if (result.foundCount === 0) {
        toast({
          title: "此手機尚未完成推播訂閱",
          description: "請先按「訂閱並儲存推播」",
          variant: "destructive",
        });
      } else if (result.overallSuccess) {
        toast({
          title: "測試推播已從伺服器發送",
          description: `HTTP 201 · 成功 ${result.successCount}/${result.sentCount} 筆。請完全關閉 ERP 後查看鎖定畫面。`,
        });
      } else {
        const failed = result.results.find(r => !r.success);
        toast({
          title: "測試推播失敗",
          description: `HTTP ${failed?.statusCode ?? "?"} · ${failed?.errorMessage ?? result.message}`,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "測試推播失敗",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setTestBusy(false);
    }
  }

  async function handleReregisterSw() {
    setSwBusy(true);
    toast({ title: "正在重新註冊 Service Worker…", description: "頁面將重新載入" });
    await reregisterServiceWorker();
  }

  const permission = typeof Notification !== "undefined" ? Notification.permission : "default";
  const pushStatus = diag ? derivePushSetupStatus(diag, testResult) : "permission_pending";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6" />
          通知中心
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          LINE API 與綁定、Web Push、ERP 站內小鈴鐺與通知測試
        </p>
      </div>

      <LineBindingPanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Web Push 即時診斷
          </CardTitle>
          <CardDescription>
            測試推播由伺服器 web-push 發送；關閉 ERP 後在鎖定畫面確認系統通知
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {diag && <PushStatusBanner status={pushStatus} testResult={testResult} />}
          <DiagnosticPanel diag={diag} testResult={testResult} />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void refreshDiagnostics()}>
              <RefreshCw className="h-4 w-4 mr-1" />重新診斷
            </Button>
            {canShowEnableButton && (
              <Button
                size="sm"
                onClick={handleEnablePush}
                disabled={pushBusy || !prefs?.webPushConfigured}
              >
                {pushBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
                開啟通知
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleTestPush}
              disabled={testBusy || !prefs?.webPushConfigured || !canShowEnableButton}
            >
              {testBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              測試推播（伺服器 web-push）
            </Button>
            <Button size="sm" variant="outline" onClick={handleReregisterSw} disabled={swBusy}>
              {swBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              重載 Service Worker
            </Button>
          </div>

          {!prefs?.webPushConfigured && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              伺服器尚未設定 VAPID 金鑰（VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT）
            </p>
          )}

          {(isIOS || isIphone) && !diag?.pwaStandalone && (
            <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-blue-900">
              <p className="font-semibold">尚未安裝 PWA —「開啟通知」按鈕已隱藏</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>使用 Safari 開啟 ERP</li>
                <li>分享 → 加入主畫面</li>
                <li>從主畫面圖示開啟（display: standalone）</li>
                <li>再按「開啟通知」→ 允許通知</li>
                <li>按「測試推播」後完全關閉 ERP 查看鎖定畫面</li>
              </ol>
            </div>
          )}

          {permission === "denied" && (
            <div className="text-sm bg-red-50 border border-red-200 rounded-lg p-3 text-red-900">
              <p className="font-semibold">通知權限已被拒絕</p>
              <p className="text-xs mt-1">
                iPhone：設定 → 通知 → 晟風 ERP → 允許通知<br />
                Android：設定 → 應用程式 → Chrome / PWA → 通知
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              管理員 — 手機 Web Push 測試
            </CardTitle>
            <CardDescription>
              從伺服器 web-push 發送測試通知至本帳號已訂閱的手機（不含 LINE、不含站內小鈴鐺）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              請先在本機 iPhone PWA 完成「開啟通知」訂閱，再按下方按鈕。測試後請完全關閉 ERP 確認鎖定畫面通知。
            </p>
            <Button
              onClick={handleTestPush}
              disabled={testBusy || !prefs?.webPushConfigured || !canShowEnableButton}
            >
              {testBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              發送手機測試通知
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ERP 小鈴鐺與通知管道</CardTitle>
          <CardDescription>站內通知、手機推播與 LINE 通知的個人開關</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">載入中…</p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><Label>ERP 站內通知</Label></div>
                <Switch checked={prefs?.notifyInApp ?? true} onCheckedChange={v => updateMut.mutate({ notifyInApp: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><Label>手機系統推播</Label></div>
                <Switch checked={prefs?.notifyWebPush ?? true} onCheckedChange={v => updateMut.mutate({ notifyWebPush: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>LINE 通知</Label>
                  <p className="text-xs text-muted-foreground">{prefs?.lineBound ? "已綁定" : "未綁定"}</p>
                </div>
                <Switch checked={prefs?.notifyLine ?? true} disabled={!prefs?.lineBound} onCheckedChange={v => updateMut.mutate({ notifyLine: v })} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            已訂閱裝置（資料庫）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {prefs?.pushDevices && prefs.pushDevices.length > 0 ? (
            <ul className="text-sm space-y-1">
              {prefs.pushDevices.map(d => (
                <li key={d.id}>• {d.deviceName ?? "裝置"} — {d.enabled ? "啟用" : "停用"}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">此手機尚未完成推播訂閱</p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
