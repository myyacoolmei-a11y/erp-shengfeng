import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Send, Eye, Save, Sunrise, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { APP_BRAND } from "@/lib/appBrand";
import { useAuth, hasRole } from "@/contexts/auth-context";
import {
  getReceivableReminderSettings,
  updateReceivableReminderSettings,
  previewReceivableReminder,
  testReceivableReminderPush,
  listReceivableReminderLogs,
  getDailyMorningBriefingSettings,
  updateDailyMorningBriefingSettings,
  previewDailyMorningBriefing,
  testDailyMorningBriefingPush,
  getEveningReceivableReminderSettings,
  updateEveningReceivableReminderSettings,
  previewEveningReceivableReminder,
  testEveningReceivableReminderPush,
  getLineBindingStatus,
  getMyLineNotificationPrefs,
  updateMyLineNotificationPrefs,
  type UserLineNotificationPrefsDto,
} from "@/lib/reminderSettingsApi";

const SETTINGS_KEY = ["receivable-reminder-settings"];
const MORNING_SETTINGS_KEY = ["daily-morning-briefing-settings"];
const EVENING_SETTINGS_KEY = ["evening-receivable-reminder-settings"];
const BINDING_STATUS_KEY = ["receivable-line-binding-status"];
const LINE_PREFS_KEY = ["my-line-notification-prefs"];

export default function AiAssistantPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole(user, "super_admin", "owner", "admin");

  const [enabled, setEnabled] = useState(false);
  const [morningEnabled, setMorningEnabled] = useState(false);
  const [eveningEnabled, setEveningEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [appBaseUrl, setAppBaseUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [morningPreviewMessage, setMorningPreviewMessage] = useState("");
  const [eveningPreviewMessage, setEveningPreviewMessage] = useState("");
  const [previewSummary, setPreviewSummary] = useState<{
    total: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
  } | null>(null);

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

  const { data: bindingStatus } = useQuery({
    queryKey: BINDING_STATUS_KEY,
    queryFn: getLineBindingStatus,
    retry: 1,
  });

  const lineLinked = bindingStatus?.status === "bound";

  const { data: linePrefs, isLoading: linePrefsLoading } = useQuery({
    queryKey: LINE_PREFS_KEY,
    queryFn: getMyLineNotificationPrefs,
    enabled: lineLinked,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["receivable-reminder-logs"],
    queryFn: listReceivableReminderLogs,
    enabled: isAdmin,
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `AI 小秘書 — ${APP_BRAND.pwaName}`;
    return () => { document.title = previousTitle; };
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

  const saveMutation = useMutation({
    mutationFn: () =>
      updateReceivableReminderSettings({ enabled, reminderTime, appBaseUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast({ title: "收款提醒設定已儲存" });
    },
    onError: (err: Error) => toast({ title: "儲存失敗", description: err.message, variant: "destructive" }),
  });

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
    onError: (err: Error) => toast({ title: "預覽失敗", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: testReceivableReminderPush,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ["receivable-reminder-logs"] });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      if (result?.sent) {
        toast({ title: "測試訊息已成功送出" });
      } else {
        toast({ title: "測試推播失敗", description: result?.error ?? "LINE 未回傳成功狀態", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "測試推播失敗", description: err.message, variant: "destructive" }),
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
      if (result?.sent) toast({ title: "測試訊息已成功送出" });
      else toast({ title: "測試推播失敗", description: "LINE 未回傳成功狀態", variant: "destructive" });
    },
    onError: (err: Error) => toast({ title: "測試推播失敗", description: err.message, variant: "destructive" }),
  });

  const saveEveningMutation = useMutation({
    mutationFn: () => updateEveningReceivableReminderSettings({ enabled: eveningEnabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENING_SETTINGS_KEY });
      toast({ title: "晚間摘要設定已儲存" });
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
      if (result?.sent) toast({ title: "測試訊息已成功送出" });
      else toast({ title: "測試推播失敗", description: "LINE 未回傳成功狀態", variant: "destructive" });
    },
    onError: (err: Error) => toast({ title: "測試推播失敗", description: err.message, variant: "destructive" }),
  });

  const saveLinePrefsMutation = useMutation({
    mutationFn: updateMyLineNotificationPrefs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LINE_PREFS_KEY });
      toast({ title: "AI 推播偏好已儲存" });
    },
    onError: (err: Error) => toast({ title: "儲存失敗", description: err.message, variant: "destructive" }),
  });

  function handlePrefChange(key: keyof Omit<UserLineNotificationPrefsDto, "lineLinked">, checked: boolean) {
    saveLinePrefsMutation.mutate({ [key]: checked });
  }

  function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : "載入失敗";
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          AI 小秘書
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          每日晨報、晚間摘要、待派工、報價追蹤與收款提醒。LINE 綁定與 Web Push 請至
          {" "}
          <Link href="/notification-settings" className="text-primary underline">通知中心</Link>。
        </p>
      </div>

      {lineLinked && (
        <Card>
          <CardHeader>
            <CardTitle>我的 AI 推播項目</CardTitle>
            <CardDescription>選擇要透過 LINE 接收的 AI 小秘書內容（需先在通知中心完成 LINE 綁定）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {linePrefsLoading || !linePrefs ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />載入偏好設定…
              </p>
            ) : (
              <>
                {[
                  { key: "receiveMorningBriefing" as const, label: "AI 每日晨報", desc: "待派工、應收、報價追蹤摘要" },
                  { key: "receivePendingDispatch" as const, label: "待派工提醒", desc: "晨報中的待派工區塊" },
                  { key: "receiveQuoteFollowUp" as const, label: "報價追蹤", desc: "晨報中的報價追蹤區塊" },
                  { key: "receiveEveningReminder" as const, label: "AI 晚間摘要", desc: "每天 21:00 未收款摘要" },
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

      {!lineLinked && !isAdmin && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-sm text-muted-foreground">
            請先至
            {" "}
            <Link href="/notification-settings" className="text-primary underline">通知中心</Link>
            {" "}
            完成 LINE 綁定，才能設定 AI 推播項目。
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
              <CardTitle className="flex items-center gap-2"><Sunrise className="h-5 w-5" />AI 每日晨報</CardTitle>
              <CardDescription>每天 09:00 自動推播：待派工、應收帳款、報價追蹤。</CardDescription>
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
              <CardTitle className="flex items-center gap-2"><Moon className="h-5 w-5" />AI 晚間摘要</CardTitle>
              <CardDescription>每天晚上 21:00 自動推播未收款應收帳款摘要。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">啟用晚間摘要</p>
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

          <Card>
            <CardHeader>
              <CardTitle>收款提醒</CardTitle>
              <CardDescription>到期應收帳款排程推播。ERP 網址請與通知中心 LINE 設定一致。</CardDescription>
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
                      <Input id="reminderTime" value={reminderTime} onChange={e => setReminderTime(e.target.value)} placeholder="09:00" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="appBaseUrl">ERP 網址（LINE 訊息連結用）</Label>
                      <Input id="appBaseUrl" value={appBaseUrl} onChange={e => setAppBaseUrl(e.target.value)} />
                    </div>
                  </div>
                  {data?.lastSentDate && (
                    <p className="text-xs text-muted-foreground">上次推播日期：{data.lastSentDate}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                      <Save className="h-4 w-4 mr-1" />儲存
                    </Button>
                    <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                      <Eye className="h-4 w-4 mr-1" />預覽今日訊息
                    </Button>
                    <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !lineLinked}>
                      <Send className="h-4 w-4 mr-1" />測試推播
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {previewSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">收款提醒預覽摘要</CardTitle>
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
              <CardDescription>AI 小秘書相關 LINE 推播紀錄</CardDescription>
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
    </div>
  );
}
