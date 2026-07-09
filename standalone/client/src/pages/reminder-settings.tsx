import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, Send, Eye, Save } from "lucide-react";
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
} from "@/lib/reminderSettingsApi";

const SETTINGS_KEY = ["receivable-reminder-settings"];

export default function ReminderSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getReceivableReminderSettings,
  });

  const [enabled, setEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [lineToken, setLineToken] = useState("");
  const [lineUserId, setLineUserId] = useState("");
  const [appBaseUrl, setAppBaseUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewSummary, setPreviewSummary] = useState<{ total: number; overdue: number; dueToday: number; dueSoon: number } | null>(null);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setReminderTime(data.reminderTime || "09:00");
    setLineUserId(data.lineUserId || "");
    setAppBaseUrl(data.appBaseUrl || window.location.origin);
    setLineToken("");
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateReceivableReminderSettings({
        enabled,
        reminderTime,
        lineUserId,
        appBaseUrl,
        ...(lineToken.trim() ? { lineChannelAccessToken: lineToken.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      setLineToken("");
      toast({ title: "設定已儲存" });
    },
    onError: (err: Error) => {
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    },
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
    onError: (err: Error) => {
      toast({ title: "預覽失敗", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: testReceivableReminderPush,
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["receivable-reminder-logs"] });
      if (result?.sent) {
        toast({ title: "測試推播已送出" });
      } else if (result?.reason === "no_items") {
        toast({ title: "今日無需追蹤的款項", description: "未發送 LINE" });
      } else {
        toast({ title: "未發送", description: result?.reason ?? result?.error ?? "請檢查設定" });
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
          每天自動檢查應收款並透過 LINE 推播提醒，老闆無需登入 ERP。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>收款提醒設定</CardTitle>
          <CardDescription>
            預設每天 09:00（台北時間）執行。若今日無需追蹤款項，不會發送 LINE。
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
              <Label htmlFor="appBaseUrl">ERP 網址（LINE 連結用）</Label>
              <Input
                id="appBaseUrl"
                value={appBaseUrl}
                onChange={e => setAppBaseUrl(e.target.value)}
                placeholder="https://your-erp.example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lineToken">LINE Channel Access Token</Label>
            <Input
              id="lineToken"
              type="password"
              value={lineToken}
              onChange={e => setLineToken(e.target.value)}
              placeholder={data?.hasLineToken ? `已設定（${data.lineChannelAccessToken}）— 留空表示不變更` : "請貼上 Messaging API Token"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lineUserId">LINE User ID（推播對象）</Label>
            <Input
              id="lineUserId"
              value={lineUserId}
              onChange={e => setLineUserId(e.target.value)}
              placeholder="Uxxxxxxxx..."
            />
            <p className="text-xs text-muted-foreground">通常是老闆或主管的 LINE User ID</p>
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
            <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
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
              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">今日 {previewSummary.dueToday}</Badge>
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">三天內 {previewSummary.dueSoon}</Badge>
            </div>
            {previewMessage ? (
              <Textarea readOnly value={previewMessage} rows={16} className="font-mono text-xs" />
            ) : (
              <p className="text-sm text-muted-foreground">今日無需追蹤的款項，不會發送 LINE。</p>
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
