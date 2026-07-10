import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, Send, Eye, Save, Link2, CheckCircle2, Sunrise, Moon, Users, Unlink } from "lucide-react";
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
  generateReceivableLineBindingCode,
  getReceivableLineBindingStatus,
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
  listLineSubscriptions,
  unbindLineSubscription,
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

  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getReceivableReminderSettings,
  });

  const { data: morningData } = useQuery({
    queryKey: MORNING_SETTINGS_KEY,
    queryFn: getDailyMorningBriefingSettings,
  });

  const { data: eveningData } = useQuery({
    queryKey: EVENING_SETTINGS_KEY,
    queryFn: getEveningReceivableReminderSettings,
  });

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

  const { data: bindingStatus } = useQuery({
    queryKey: BINDING_STATUS_KEY,
    queryFn: getReceivableLineBindingStatus,
    enabled: isPollingBinding,
    refetchInterval: query => {
      if (!isPollingBinding) return false;
      if (query.state.data?.status === "bound") return false;
      if (pollStartedAtRef.current && Date.now() - pollStartedAtRef.current > POLL_MAX_MS) {
        return false;
      }
      return POLL_INTERVAL_MS;
    },
  });

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
    void getReceivableLineBindingStatus()
      .then(status => {
        if (status.status === "bound") {
          setBindingComplete(true);
          return;
        }
        if (status.status === "pending" && status.code) {
          setBindingCode(status.code);
          setBindingInstruction(`請先加入「晟風小秘書」好友，然後在 LINE 對話輸入：綁定 ${status.code}`);
          pollStartedAtRef.current = Date.now();
          setIsPollingBinding(true);
        }
      })
      .catch(() => {
        // ignore initial status load errors
      });
  }, []);

  useEffect(() => {
    if (bindingStatus?.status === "bound") {
      setIsPollingBinding(false);
      setBindingComplete(true);
      setBindingInstruction(null);
      setBindingCode(null);
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: LINE_PREFS_KEY });
    }
  }, [bindingStatus, qc]);

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
      const result = await generateReceivableLineBindingCode();
      console.log("[LINE Link] addFriendUrl:", result.addFriendUrl);

      setBindingCode(result.code);
      setBindingInstruction(result.instruction);
      setAddFriendUrl(result.addFriendUrl);
      pollStartedAtRef.current = Date.now();
      setIsPollingBinding(true);
      qc.invalidateQueries({ queryKey: BINDING_STATUS_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });

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
        toast({ title: "測試推播已透過 LINE Messaging API 送出" });
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
    onSuccess: () => toast({ title: "每日晨報測試推播已送出" }),
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
    onSuccess: () => toast({ title: "晚間提醒測試推播已送出" }),
    onError: (err: Error) => toast({ title: "測試推播失敗", description: err.message, variant: "destructive" }),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["receivable-reminder-logs"],
    queryFn: listReceivableReminderLogs,
  });

  const lineLinked = bindingComplete || bindingStatus?.status === "bound" || Boolean(data?.lineLinked);

  const { data: linePrefs, isLoading: linePrefsLoading } = useQuery({
    queryKey: LINE_PREFS_KEY,
    queryFn: getMyLineNotificationPrefs,
    enabled: lineLinked,
  });

  const { data: lineSubscriptions = [] } = useQuery({
    queryKey: LINE_SUBSCRIPTIONS_KEY,
    queryFn: listLineSubscriptions,
    enabled: isAdmin,
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

  function handlePrefChange(
    key: keyof Omit<UserLineNotificationPrefsDto, "lineLinked">,
    checked: boolean,
  ) {
    saveLinePrefsMutation.mutate({ [key]: checked });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />載入中…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" />
          AI 收款秘書
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          晟風小秘書 LINE 推播：每日晨報、收款提醒、晚間提醒。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LINE Messaging API</CardTitle>
          <CardDescription>
            Token 與 Secret 請在 Railway 環境變數設定。加入好友後，請在 LINE 對話輸入綁定碼完成連結。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={data?.hasLineEnvConfig ? "default" : "destructive"}>
              {data?.hasLineEnvConfig ? "LINE 環境變數已設定" : "LINE 環境變數未設定"}
            </Badge>
            {lineLinked ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                我的 LINE 已連結
                {data?.linkedErpUserName ? `：${data.linkedErpUserName}` : ""}
                {data?.lineUserIdMasked ? ` (${data.lineUserIdMasked})` : ""}
              </Badge>
            ) : (
              <Badge variant="outline">尚未連結 LINE</Badge>
            )}
            {(data?.boundSubscriberCount ?? 0) > 0 && (
              <Badge variant="secondary">
                <Users className="h-3 w-3 mr-1" />
                共 {data?.boundSubscriberCount} 人已綁定
              </Badge>
            )}
            {isPollingBinding && bindingStatus?.status === "pending" && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">等待 LINE 輸入綁定碼…</Badge>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <p><span className="font-medium">Webhook URL：</span>{data?.lineWebhookUrl ?? "—"}</p>
            <p className="text-muted-foreground">請在 LINE Developers Console 貼上此 URL，並啟用 Message 事件</p>
          </div>

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
            連結我的 LINE
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
              <p className="text-xs text-muted-foreground">綁定碼 10 分鐘內有效，請在 LINE 對話輸入「綁定 {bindingCode}」</p>
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
            按此按鈕會產生綁定碼並開啟 LINE 官方帳號。加入好友後，請在 LINE 對話輸入「綁定 XXXXXX」完成連結。
          </p>
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
            <CardDescription>查看所有已綁定 LINE 的 ERP 使用者，必要時可解除綁定。</CardDescription>
          </CardHeader>
          <CardContent>
            {lineSubscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">目前沒有使用者綁定 LINE</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>使用者</TableHead>
                    <TableHead>LINE ID</TableHead>
                    <TableHead>推播項目</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineSubscriptions.map(sub => {
                    const activePrefs = [
                      sub.prefs.receiveMorningBriefing && "晨報",
                      sub.prefs.receivePendingDispatch && "待派工",
                      sub.prefs.receiveQuoteFollowUp && "報價",
                      sub.prefs.receiveEveningReminder && "晚間",
                      sub.prefs.receiveReceivableCollection && "收款",
                    ].filter(Boolean).join("、");

                    return (
                      <TableRow key={sub.userId}>
                        <TableCell>
                          <div className="font-medium">{sub.displayName}</div>
                          <div className="text-xs text-muted-foreground">{sub.username}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{sub.lineUserIdMasked}</TableCell>
                        <TableCell className="text-sm">{activePrefs || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={unbindMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`確定要解除「${sub.displayName}」的 LINE 綁定？`)) {
                                unbindMutation.mutate(sub.userId);
                              }
                            }}
                          >
                            <Unlink className="h-3 w-3 mr-1" />
                            解除綁定
                          </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>收款提醒設定</CardTitle>
          <CardDescription>
            條件：到期日 ≤ 今天、未全額收款、狀態 ≠ 已收款。若無符合項目，不發送 LINE。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
        </CardContent>
      </Card>

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
    </div>
  );
}
