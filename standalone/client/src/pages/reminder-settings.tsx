import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, Send, Eye, Save, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getReceivableReminderSettings,
  updateReceivableReminderSettings,
  previewReceivableReminder,
  testReceivableReminderPush,
  listReceivableReminderLogs,
  prepareReceivableLineLink,
  getLinePublicConfig,
} from "@/lib/reminderSettingsApi";

const SETTINGS_KEY = ["receivable-reminder-settings"];

export default function ReminderSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getReceivableReminderSettings,
    refetchInterval: query =>
      query.state.data?.pendingLineLink ? 5000 : false,
  });

  const [enabled, setEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [appBaseUrl, setAppBaseUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewSummary, setPreviewSummary] = useState<{ total: number; overdue: number; dueToday: number; dueSoon: number } | null>(null);
  const [lineLinkError, setLineLinkError] = useState<string | null>(null);
  const [lineLinkLoading, setLineLinkLoading] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setReminderTime(data.reminderTime || "09:00");
    setAppBaseUrl(data.appBaseUrl || window.location.origin);
  }, [data]);

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

  const linkMutation = useMutation({
    mutationFn: prepareReceivableLineLink,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });

  async function handleLineLinkClick() {
    console.log("[LINE Link] button clicked");
    setLineLinkError(null);
    setLineLinkLoading(true);

    try {
      const config = await getLinePublicConfig();
      const addFriendUrl = config.addFriendUrl?.trim() || null;
      console.log("[LINE Link] addFriendUrl:", addFriendUrl);

      if (!addFriendUrl) {
        setLineLinkError("尚未設定 LINE 官方帳號 ID");
        return;
      }

      if (data?.hasLineEnvConfig) {
        try {
          await linkMutation.mutateAsync();
        } catch (prepareErr) {
          console.warn("[LINE Link] prepare binding failed (continuing to add-friend):", prepareErr);
        }
      }

      window.location.href = addFriendUrl;
    } catch (err) {
      console.error("[LINE Link] failed:", err);
      setLineLinkError("無法取得 LINE 連結，請稍後再試");
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

  const { data: logs = [] } = useQuery({
    queryKey: ["receivable-reminder-logs"],
    queryFn: listReceivableReminderLogs,
  });

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
          每天 09:00 自動檢查到期/逾期應收款，透過 LINE 推播提醒老闆，無需登入 ERP。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LINE Messaging API</CardTitle>
          <CardDescription>
            Token 與 Secret 請在 Railway 環境變數設定。Webhook 由後端自動接收 Follow 事件完成綁定。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={data?.hasLineEnvConfig ? "default" : "destructive"}>
              {data?.hasLineEnvConfig ? "LINE 環境變數已設定" : "LINE 環境變數未設定"}
            </Badge>
            <Badge variant={data?.lineLinked ? "default" : "outline"}>
              {data?.lineLinked
                ? `已連結：${data.linkedErpUserName ?? "ERP 使用者"} (${data.lineUserIdMasked})`
                : "尚未連結 LINE"}
            </Badge>
            {data?.pendingLineLink && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">等待加入好友…</Badge>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <p><span className="font-medium">Webhook URL：</span>{data?.lineWebhookUrl ?? "—"}</p>
            <p className="text-muted-foreground">請在 LINE Developers Console 貼上此 URL 並按 Verify</p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void handleLineLinkClick()}
            disabled={lineLinkLoading}
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

          <p className="text-xs text-muted-foreground">
            按此按鈕後，用手機加入 LINE 官方帳號為好友，系統會自動綁定您的 User ID（無需手動輸入）。
          </p>
        </CardContent>
      </Card>

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
              disabled={testMutation.isPending || !data?.lineLinked}
            >
              <Send className="h-4 w-4 mr-1" />
              立即測試推播
            </Button>
          </div>
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
