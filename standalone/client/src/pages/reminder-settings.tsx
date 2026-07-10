import { useEffect, useRef, useState } from "react";
import { APP_BRAND } from "@/lib/appBrand";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, Send, Eye, Save, Link2, CheckCircle2, Sunrise, Moon, Users, Unlink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, hasRole } from "@/contexts/auth-context";
import {
  getReceivableReminderSettings,
  updateReceivableReminderSettings,
  previewReceivableReminder,
  testReceivableReminderPush,
  listReceivableReminderLogs,
  generateLineBindingCode,
  getLineBindingStatus,
  getDailyMorningBriefingSettings,
  updateDailyMorningBriefingSettings,
  previewDailyMorningBriefing,
  testDailyMorningBriefingPush,
  getEveningReceivableReminderSettings,
  updateEveningReceivableReminderSettings,
  previewEveningReceivableReminder,
  testEveningReceivableReminderPush,
  getMyLineNotificationPrefs,
  updateMyLineNotificationPrefs,
  listLineBindingOverview,
  unbindLineSubscription,
  adminRegenerateLineBindingCode,
  type UserLineNotificationPrefsDto,
} from "@/lib/reminderSettingsApi";

const SETTINGS_KEY = ["receivable-reminder-settings"];
const MORNING_SETTINGS_KEY = ["daily-morning-briefing-settings"];
const EVENING_SETTINGS_KEY = ["evening-receivable-reminder-settings"];
const BINDING_STATUS_KEY = ["receivable-line-binding-status"];
const LINE_PREFS_KEY = ["my-line-notification-prefs"];
const LINE_SUBSCRIPTIONS_KEY = ["line-subscriptions"];
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 10 * 60 * 1000;

function isDesktopBrowser(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

export default function ReminderSettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const pollStartedAtRef = useRef<number | null>(null);
  const isAdmin = hasRole(user, "super_admin", "owner", "admin");

  const [enabled, setEnabled] = useState(false);
  const [morningEnabled, setMorningEnabled] = useState(false);
  const [eveningEnabled, setEveningEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [appBaseUrl, setAppBaseUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [morningPreviewMessage, setMorningPreviewMessage] = useState("");
  const [eveningPreviewMessage, setEveningPreviewMessage] = useState("");
  const [previewSummary, setPreviewSummary] = useState<{ total: number; overdue: number; dueToday: number; dueSoon: number } | null>(null);
  const [lineLinkError, setLineLinkError] = useState<string | null>(null);
  const [lineLinkLoading, setLineLinkLoading] = useState(false);
  const [bindingInstruction, setBindingInstruction] = useState<string | null>(null);
  const [bindingCode, setBindingCode] = useState<string | null>(null);
  const [addFriendUrl, setAddFriendUrl] = useState<string | null>(null);
  const [isPollingBinding, setIsPollingBinding] = useState(false);
  const [bindingComplete, setBindingComplete] = useState(false);

  const { data, isLoading: adminSettingsLoading, isError: adminSettingsError, error: adminSettingsErrorObj } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getReceivableReminderSettings,
    enabled: isAdmin,
    retry: false,
  });

  const { data: morningData } = useQuery({
    queryKey: MORNING_SETTINGS_KEY,
    queryFn: getDailyMorningBriefingSettings,
    enabled: isAdmin,
    retry: false,
  });

  const { data: eveningData } = useQuery({
    queryKey: EVENING_SETTINGS_KEY,
    queryFn: getEveningReceivableReminderSettings,
    enabled: isAdmin,
    retry: false,
  });

  const { data: bindingStatus, isLoading: bindingLoading, isError: bindingError, error: bindingErrorObj } = useQuery({
    queryKey: BINDING_STATUS_KEY,
    queryFn: getLineBindingStatus,
    retry: 1,
    refetchInterval: query => {
      const status = query.state.data?.status;
      if (status === "bound") return false;
      if (isPollingBinding) {
        if (pollStartedAtRef.current && Date.now() - pollStartedAtRef.current > POLL_MAX_MS) {
          return false;
        }
        return POLL_INTERVAL_MS;
      }
      if (status === "pending") return POLL_INTERVAL_MS;
      return false;
    },
  });

  const lineLinked = bindingStatus?.status === "bound" || bindingComplete || Boolean(data?.lineLinked);

  const { data: linePrefs, isLoading: linePrefsLoading } = useQuery({
    queryKey: LINE_PREFS_KEY,
    queryFn: getMyLineNotificationPrefs,
    enabled: lineLinked,
  });

  const { data: lineBindingOverview = [], isLoading: overviewLoading, isError: overviewError, error: overviewErrorObj } = useQuery({
    queryKey: LINE_SUBSCRIPTIONS_KEY,
    queryFn: listLineBindingOverview,
    enabled: isAdmin,
    retry: false,
  });

  const boundSubscriberCount = lineBindingOverview.filter(row => row.bindingStatus === "bound").length;

  const { data: logs = [] } = useQuery({
    queryKey: ["receivable-reminder-logs"],
    queryFn: listReceivableReminderLogs,
    enabled: isAdmin,
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `AI 小秘書 — ${APP_BRAND.pwaName}`;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setReminderTime(data.reminderTime || "09:00");
    setAppBaseUrl(data.appBaseUrl || window.location.origin);
  }, [data]);

  useEffect(() => {
    if (morningData) setMorningEnabled(morningData.enabled);
  }, [morningData]);

  useEffect(() => {
    if (eveningData) setEveningEnabled(eveningData.enabled);
  }, [eveningData]);

  useEffect(() => {
    if (!bindingStatus) return;
    if (bindingStatus.status === "bound") {
      setBindingComplete(true);
      setBindingInstruction(null);
      setBindingCode(null);
      setIsPollingBinding(false);
      return;
    }
    if (bindingStatus.status === "pending" && bindingStatus.code) {
      setBindingCode(bindingStatus.code);
      setBindingInstruction(`請先加入「晟風小秘書」好友，然後在 LINE 對話輸入：綁定 ${bindingStatus.code}`);
      if (bindingStatus.addFriendUrl) {
        setAddFriendUrl(bindingStatus.addFriendUrl);
      }
    }
  }, [bindingStatus]);

  useEffect(() => {
    if (bindingStatus?.status === "bound") {
      if (isAdmin) {
        qc.invalidateQueries({ queryKey: SETTINGS_KEY });
        qc.invalidateQueries({ queryKey: LINE_SUBSCRIPTIONS_KEY });
      }
      qc.invalidateQueries({ queryKey: LINE_PREFS_KEY });
    }
  }, [bindingStatus?.status, qc, isAdmin]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateReceivableReminderSettings({
        enabled,
        reminderTime,
        appBaseUrl,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast({ title: "設定已儲存" });
    },
    onError: (err: Error) => {
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    },
  });

  async function handleLineLinkClick() {
    console.log("[LINE Link] button clicked");
    setLineLinkError(null);
    setLineLinkLoading(true);
    setBindingComplete(false);

    try {
      const result = await generateLineBindingCode();
      console.log("[LINE Link] addFriendUrl:", result.addFriendUrl);

      setBindingCode(result.code);
      setBindingInstruction(result.instruction);
      setAddFriendUrl(result.addFriendUrl);
      pollStartedAtRef.current = Date.now();
      setIsPollingBinding(true);
      qc.invalidateQueries({ queryKey: BINDING_STATUS_KEY });
      if (isAdmin) {
        qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      }

      if (isDesktopBrowser()) {
        window.open(result.addFriendUrl, "_blank", "noopener,noreferrer");
      } else {
        const opened = window.open(result.addFriendUrl, "_blank");
        if (!opened) {
          window.location.href = result.addFriendUrl;
        }
      }
    } catch (err) {
      console.error("[LINE Link] failed:", err);
      const message = err instanceof Error ? err.message : "無法取得 LINE 連結，請稍後再試";
      setLineLinkError(message);
    } finally {
      setLineLinkLoading(false);
    }
  }

  const previewMutation = useMutation({
    mutationFn: previewReceivableReminder,
    onSuccess: result => {
      setPreviewMessage(result.message);
      setPreviewSummary({
        total: result.summary.total,
        overdue: result.summary.overdue,
        dueToday: result.summary.dueToday,
        dueSoon: result.summary.dueSoon,
      });
    },
    onError: (err: Error) => {
      toast({ title: "預覽失敗", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: testReceivableReminderPush,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ["receivable-reminder-logs"] });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      if (result?.sent) {
        toast({ title: "測試訊息已成功送出" });
      } else {
        toast({
          title: "測試推播失敗",
          description: result?.error ?? "LINE 未回傳成功狀態",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "測試推播失敗", description: err.message, variant: "destructive" });
    },
  });

  const saveMorningMutation = useMutation({
    mutationFn: () => updateDailyMorningBriefingSettings({ enabled: morningEnabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MORNING_SETTINGS_KEY });
      toast({ title: "每日晨報設定已儲存" });
    },
    onError: (err: Error) => toast({ title: "儲存失敗", description: err.message, variant: "destructive" }),
  });

  const previewMorningMutation = useMutation({
    mutationFn: previewDailyMorningBriefing,
    onSuccess: result => setMorningPreviewMessage(result.message),
    onError: (err: Error) => toast({ title: "預覽失敗", description: err.message, variant: "destructive" }),
  });

  const testMorningMutation = useMutation({
    mutationFn: testDailyMorningBriefingPush,
    onSuccess: result => {
      if (result?.sent) {
        toast({ title: "測試訊息已成功送出" });
      } else {
        toast({
          title: "測試推播失敗",
          description: "LINE 未回傳成功狀態",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => toast({ title: "測試推播失敗", description: err.message, variant: "destructive" }),
  });

  const saveEveningMutation = useMutation({
    mutationFn: () => updateEveningReceivableReminderSettings({ enabled: eveningEnabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENING_SETTINGS_KEY });
      toast({ title: "晚間提醒設定已儲存" });
    },
    onError: (err: Error) => toast({ title: "儲存失敗", description: err.message, variant: "destructive" }),
  });

  const previewEveningMutation = useMutation({
    mutationFn: previewEveningReceivableReminder,
    onSuccess: result => setEveningPreviewMessage(result.message),
    onError: (err: Error) => toast({ title: "預覽失敗", description: err.message, variant: "destructive" }),
  });

  const testEveningMutation = useMutation({
    mutationFn: testEveningReceivableReminderPush,
    onSuccess: result => {
      if (result?.sent) {
        toast({ title: "測試訊息已成功送出" });
      } else {
        toast({
          title: "測試推播失敗",
          description: "LINE 未回傳成功狀態",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => toast({ title: "測試推播失敗", description: err.message, variant: "destructive" }),
  });

  const saveLinePrefsMutation = useMutation({
    mutationFn: updateMyLineNotificationPrefs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LINE_PREFS_KEY });
      toast({ title: "推播偏好已儲存" });
    },
    onError: (err: Error) => {
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    },
  });

  const unbindMutation = useMutation({
    mutationFn: unbindLineSubscription,
    onSuccess: (_data, userId) => {
      if (userId === user?.id) {
        setBindingComplete(false);
      }
      qc.invalidateQueries({ queryKey: LINE_SUBSCRIPTIONS_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: BINDING_STATUS_KEY });
      qc.invalidateQueries({ queryKey: LINE_PREFS_KEY });
      toast({ title: "已解除 LINE 綁定" });
    },
    onError: (err: Error) => {
      toast({ title: "解除綁定失敗", description: err.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: adminRegenerateLineBindingCode,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: LINE_SUBSCRIPTIONS_KEY });
      toast({
        title: "已重新產生綁定碼",
        description: `${result.instruction}（10 分鐘內有效）`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "產生綁定碼失敗", description: err.message, variant: "destructive" });
    },
  });

  function handlePrefChange(
    key: keyof Omit<UserLineNotificationPrefsDto, "lineLinked">,
    checked: boolean,
  ) {
    saveLinePrefsMutation.mutate({ [key]: checked });
  }

  function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : "載入失敗";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" />
          AI 小秘書
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI 小秘書可協助每日晨報、待派工提醒、應收帳款提醒、報價追蹤、晚間提醒等智慧通知。
        </p>
      </div>

      {bindingError && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">
            無法載入 LINE 綁定狀態：{errorMessage(bindingErrorObj)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>LINE Messaging API</CardTitle>
          <CardDescription>
            Token 與 Secret 請在 Railway 環境變數設定。加入好友後，請在 LINE 對話輸入綁定碼完成連結。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bindingLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />載入 LINE 綁定狀態…
            </p>
          ) : (
          <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={bindingStatus?.hasLineEnvConfig ?? data?.hasLineEnvConfig ? "default" : "destructive"}>
              {bindingStatus?.hasLineEnvConfig ?? data?.hasLineEnvConfig ? "LINE 環境變數已設定" : "LINE 環境變數未設定"}
            </Badge>
            {lineLinked ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                我的 LINE 已連結
                {bindingStatus?.linkedErpUserName ? `：${bindingStatus.linkedErpUserName}` : ""}
                {bindingStatus?.lineUserIdMasked ? ` (${bindingStatus.lineUserIdMasked})` : ""}
              </Badge>
            ) : (
              <Badge variant="outline">尚未連結 LINE</Badge>
            )}
            {isAdmin && boundSubscriberCount > 0 && (
              <Badge variant="secondary">
                <Users className="h-3 w-3 mr-1" />
                共 {boundSubscriberCount} 人已綁定
              </Badge>
            )}
            {isPollingBinding && bindingStatus?.status === "pending" && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">等待 LINE 輸入綁定碼…</Badge>
            )}
          </div>

          {isAdmin && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p><span className="font-medium">Webhook URL：</span>{data?.lineWebhookUrl ?? "—"}</p>
              <p className="text-muted-foreground">請在 LINE Developers Console 貼上此 URL，並啟用 Message 事件</p>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => void handleLineLinkClick()}
            disabled={lineLinkLoading || lineLinked}
          >
            {lineLinkLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-1" />
            )}
            立即綁定 LINE
          </Button>

          {lineLinkError && (
            <p className="text-sm text-destructive font-medium" role="alert">
              {lineLinkError}
            </p>
          )}

          {bindingInstruction && bindingCode && !lineLinked && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-medium text-primary">{bindingInstruction}</p>
              <p className="text-3xl font-bold tracking-widest font-mono">{bindingCode}</p>
              <p className="text-xs text-muted-foreground">綁定碼 10 分鐘內有效，請在 LINE 對話輸入「綁定 {bindingCode}」（5~8 位數字）</p>
            </div>
          )}

          {addFriendUrl && isDesktopBrowser() && !lineLinked && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3 max-w-xs">
              <p className="text-sm font-medium">用手機掃描 QR Code 加入「晟風小秘書」</p>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(addFriendUrl)}`}
                alt="LINE 加好友 QR Code"
                width={180}
                height={180}
                className="rounded-md border bg-white"
              />
              <a
                href={addFriendUrl}
                className="text-sm text-primary underline break-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                開啟 LINE 加好友頁面
              </a>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            按此按鈕會產生一次性綁定碼（5~8 位）並開啟 LINE 官方帳號。加入好友後，請在 LINE 對話輸入「綁定 XXXXX」完成連結。
          </p>
          </>
          )}
        </CardContent>
      </Card>

      {lineLinked && (
        <Card>
          <CardHeader>
            <CardTitle>我的 LINE 推播偏好</CardTitle>
            <CardDescription>
              依個人設定接收推播。系統排程啟用時，只會推播給有開啟對應項目的使用者。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {linePrefsLoading || !linePrefs ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />載入偏好設定…
              </p>
            ) : (
              <>
                {[
                  { key: "receiveMorningBriefing" as const, label: "AI 每日晨報（應收摘要）", desc: "晨報中的應收帳款區塊" },
                  { key: "receivePendingDispatch" as const, label: "待派工提醒", desc: "晨報中的待派工區塊" },
                  { key: "receiveQuoteFollowUp" as const, label: "報價追蹤", desc: "晨報中的報價追蹤區塊" },
                  { key: "receiveEveningReminder" as const, label: "晚間收款提醒", desc: "每天 21:00 未收款摘要" },
                  { key: "receiveReceivableCollection" as const, label: "收款提醒", desc: "依排程時間的到期應收提醒" },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      checked={linePrefs[item.key]}
                      disabled={saveLinePrefsMutation.isPending}
                      onCheckedChange={checked => handlePrefChange(item.key, checked)}
                    />
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              LINE 綁定管理
            </CardTitle>
            <CardDescription>查看所有 ERP 使用者的 LINE 綁定狀態，可解除綁定或重新產生綁定碼。</CardDescription>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />載入綁定列表…
              </p>
            ) : overviewError ? (
              <p className="text-sm text-destructive">無法載入綁定列表：{errorMessage(overviewErrorObj)}</p>
            ) : lineBindingOverview.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無使用者資料</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>使用者</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>LINE / 綁定碼</TableHead>
                    <TableHead>推播項目</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineBindingOverview.map(row => {
                    const activePrefs = row.prefs
                      ? [
                          row.prefs.receiveMorningBriefing && "晨報",
                          row.prefs.receivePendingDispatch && "待派工",
                          row.prefs.receiveQuoteFollowUp && "報價",
                          row.prefs.receiveEveningReminder && "晚間",
                          row.prefs.receiveReceivableCollection && "收款",
                        ].filter(Boolean).join("、")
                      : "—";

                    const statusLabel =
                      row.bindingStatus === "bound"
                        ? "已綁定"
                        : row.bindingStatus === "pending"
                          ? "待綁定"
                          : "未綁定";

                    return (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <div className="font-medium">{row.displayName}</div>
                          <div className="text-xs text-muted-foreground">{row.username}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.bindingStatus === "bound" ? "default" : "outline"}
                            className={
                              row.bindingStatus === "pending"
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                : undefined
                            }
                          >
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.bindingStatus === "bound" && row.lineUserIdMasked}
                          {row.bindingStatus === "pending" && (
                            <div>
                              <div>{row.pendingCode}</div>
                              {row.pendingExpiresAt && (
                                <div className="text-muted-foreground font-sans">
                                  至 {new Date(row.pendingExpiresAt).toLocaleString("zh-TW")}
                                </div>
                              )}
                            </div>
                          )}
                          {row.bindingStatus === "none" && "—"}
                        </TableCell>
                        <TableCell className="text-sm">{activePrefs}</TableCell>
                        <TableCell className="text-right space-x-2">
                          {row.bindingStatus === "bound" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={unbindMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`確定要解除「${row.displayName}」的 LINE 綁定？`)) {
                                  unbindMutation.mutate(row.userId);
                                }
                              }}
                            >
                              <Unlink className="h-3 w-3 mr-1" />
                              解除綁定
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={regenerateMutation.isPending}
                              onClick={() => regenerateMutation.mutate(row.userId)}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              重新產生綁定碼
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && adminSettingsError && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">
            無法載入收款提醒設定：{errorMessage(adminSettingsErrorObj)}
          </CardContent>
        </Card>
      )}

      {isAdmin && !adminSettingsError && (
      <>
      <Card>
        <CardHeader>
          <CardTitle>收款提醒設定</CardTitle>
          <CardDescription>
            條件：到期日 ≤ 今天、未全額收款、狀態 ≠ 已收款。若無符合項目，不發送 LINE。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {adminSettingsLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />載入設定…
            </p>
          ) : (
          <>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">啟用收款提醒</p>
              <p className="text-sm text-muted-foreground">關閉後排程仍運作，但不會推播 LINE</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reminderTime">提醒時間（HH:mm）</Label>
              <Input
                id="reminderTime"
                value={reminderTime}
                onChange={e => setReminderTime(e.target.value)}
                placeholder="09:00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appBaseUrl">ERP 網址（LINE 訊息連結用）</Label>
              <Input
                id="appBaseUrl"
                value={appBaseUrl}
                onChange={e => setAppBaseUrl(e.target.value)}
                placeholder="https://bountiful-vitality-production-76ab.up.railway.app"
              />
            </div>
          </div>

          {data?.lastSentDate && (
            <p className="text-xs text-muted-foreground">上次推播日期：{data.lastSentDate}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-1" />
              儲存設定
            </Button>
            <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
              <Eye className="h-4 w-4 mr-1" />
              預覽今日訊息
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !lineLinked}
            >
              <Send className="h-4 w-4 mr-1" />
              立即測試推播
            </Button>
          </div>
          </>
          )}
        </CardContent>
      </Card>

      {!adminSettingsLoading && (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sunrise className="h-5 w-5" />AI 每日晨報</CardTitle>
          <CardDescription>每天上午 09:00 自動推播：待派工、應收帳款、報價追蹤。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">啟用每日晨報</p>
              <p className="text-sm text-muted-foreground">固定 09:00 發送（Asia/Taipei）</p>
            </div>
            <Switch checked={morningEnabled} onCheckedChange={setMorningEnabled} />
          </div>
          {morningData?.lastSentDate && (
            <p className="text-xs text-muted-foreground">上次推播日期：{morningData.lastSentDate}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMorningMutation.mutate()} disabled={saveMorningMutation.isPending}>
              <Save className="h-4 w-4 mr-1" />儲存
            </Button>
            <Button variant="outline" onClick={() => previewMorningMutation.mutate()} disabled={previewMorningMutation.isPending}>
              <Eye className="h-4 w-4 mr-1" />預覽晨報
            </Button>
            <Button variant="outline" onClick={() => testMorningMutation.mutate()} disabled={testMorningMutation.isPending || !lineLinked}>
              <Send className="h-4 w-4 mr-1" />測試推播
            </Button>
          </div>
          {morningPreviewMessage && (
            <Textarea readOnly value={morningPreviewMessage} rows={18} className="font-mono text-xs" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Moon className="h-5 w-5" />AI 晚間提醒</CardTitle>
          <CardDescription>每天晚上 21:00 自動推播未收款應收帳款摘要。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">啟用晚間提醒</p>
              <p className="text-sm text-muted-foreground">固定 21:00 發送（Asia/Taipei）</p>
            </div>
            <Switch checked={eveningEnabled} onCheckedChange={setEveningEnabled} />
          </div>
          {eveningData?.lastSentDate && (
            <p className="text-xs text-muted-foreground">上次推播日期：{eveningData.lastSentDate}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveEveningMutation.mutate()} disabled={saveEveningMutation.isPending}>
              <Save className="h-4 w-4 mr-1" />儲存
            </Button>
            <Button variant="outline" onClick={() => previewEveningMutation.mutate()} disabled={previewEveningMutation.isPending}>
              <Eye className="h-4 w-4 mr-1" />預覽晚報
            </Button>
            <Button variant="outline" onClick={() => testEveningMutation.mutate()} disabled={testEveningMutation.isPending || !lineLinked}>
              <Send className="h-4 w-4 mr-1" />測試推播
            </Button>
          </div>
          {eveningPreviewMessage && (
            <Textarea readOnly value={eveningPreviewMessage} rows={14} className="font-mono text-xs" />
          )}
        </CardContent>
      </Card>

      {previewSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">今日預覽摘要</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">共 {previewSummary.total} 筆</Badge>
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">逾期 {previewSummary.overdue}</Badge>
              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">今日到期 {previewSummary.dueToday}</Badge>
            </div>
            {previewMessage ? (
              <Textarea readOnly value={previewMessage} rows={16} className="font-mono text-xs" />
            ) : (
              <p className="text-sm text-muted-foreground">今日無到期或逾期應收款，不會發送 LINE。</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">推播紀錄</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無推播紀錄</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {logs.map(log => (
                <li key={log.id} className="rounded border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={log.success ? "default" : "destructive"}>
                      {log.success ? "成功" : "失敗"}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(log.sentAt).toLocaleString("zh-TW")} · {log.itemCount} 筆
                    </span>
                  </div>
                  {log.errorMessage && (
                    <p className="text-destructive text-xs mt-1">{log.errorMessage}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </>
      )}
      </>
      )}
    </div>
  );
}
