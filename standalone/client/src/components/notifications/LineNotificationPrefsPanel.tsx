import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  getMyLineNotificationPrefs,
  updateMyLineNotificationPrefs,
  type UserLineNotificationPrefsDto,
} from "@/lib/reminderSettingsApi";

const LINE_PREFS_KEY = ["my-line-notification-preferences"];

type PrefItem = {
  key: keyof Omit<UserLineNotificationPrefsDto, "lineLinked" | "roleCategory">;
  label: string;
  desc: string;
  category: "management" | "engineer" | "shared";
};

const MANAGEMENT_PREFS: PrefItem[] = [
  { key: "receiveMorningBriefing", label: "AI 每日晨報", desc: "待派工、應收、報價追蹤摘要", category: "management" },
  { key: "receivePendingDispatch", label: "待派工提醒", desc: "晨報中的待派工區塊", category: "management" },
  { key: "receiveQuoteFollowUp", label: "報價追蹤", desc: "晨報中的報價追蹤", category: "management" },
  { key: "receiveEveningReminder", label: "AI 晚間摘要", desc: "未收款應收帳款摘要", category: "management" },
  { key: "receiveReceivableCollection", label: "收款／應收提醒", desc: "到期應收帳款排程提醒", category: "management" },
];

const ENGINEER_PREFS: PrefItem[] = [
  { key: "receiveWorkReminder60", label: "下一案件剩 1 小時", desc: "預約到場前 60 分鐘", category: "engineer" },
  { key: "receiveWorkReminder30", label: "下一案件剩 30 分鐘", desc: "預約到場前 30 分鐘", category: "engineer" },
  { key: "receiveWorkReminder15", label: "下一案件剩 15 分鐘", desc: "預約到場前 15 分鐘", category: "engineer" },
  { key: "receiveWorkReminder5", label: "下一案件剩 5 分鐘", desc: "預約到場前 5 分鐘", category: "engineer" },
  { key: "receivePastAppointment", label: "已超過預約時間", desc: "逾時未到場提醒", category: "engineer" },
  { key: "receivePreviousJobIncomplete", label: "上一案件尚未完成", desc: "下一案將開始但上一案未完工", category: "engineer" },
  { key: "receiveReadyForNextJob", label: "可前往下一案件", desc: "上一案已完成，可出發下一案", category: "engineer" },
  { key: "receiveOneTapNavigation", label: "一鍵導航", desc: "提醒訊息附帶案場導航連結", category: "engineer" },
];

const SHARED_PREFS: PrefItem[] = [
  { key: "receiveCompanyAnnouncement", label: "公司公告", desc: "晟風夥伴文化與公司公告", category: "shared" },
];

function visiblePrefs(roleCategory: UserLineNotificationPrefsDto["roleCategory"]): PrefItem[] {
  if (roleCategory === "manager") return [...MANAGEMENT_PREFS, ...SHARED_PREFS];
  if (roleCategory === "engineer") return [...ENGINEER_PREFS, ...SHARED_PREFS];
  return SHARED_PREFS;
}

export function LineNotificationPrefsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: linePrefs, isLoading } = useQuery({
    queryKey: LINE_PREFS_KEY,
    queryFn: getMyLineNotificationPrefs,
  });

  const saveMutation = useMutation({
    mutationFn: updateMyLineNotificationPrefs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LINE_PREFS_KEY });
      toast({ title: "LINE 通知偏好已儲存" });
    },
    onError: (err: Error) => toast({ title: "儲存失敗", description: err.message, variant: "destructive" }),
  });

  function handlePrefChange(
    key: keyof Omit<UserLineNotificationPrefsDto, "lineLinked" | "roleCategory">,
    checked: boolean,
  ) {
    saveMutation.mutate({ [key]: checked });
  }

  if (isLoading || !linePrefs) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />載入 LINE 通知偏好…
        </CardContent>
      </Card>
    );
  }

  if (!linePrefs.lineLinked) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            LINE 通知偏好
          </CardTitle>
          <CardDescription>完成上方 LINE 綁定後，可依角色設定可接收的通知類型。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const items = visiblePrefs(linePrefs.roleCategory);
  const sectionTitle =
    linePrefs.roleCategory === "manager"
      ? "管理通知"
      : linePrefs.roleCategory === "engineer"
        ? "工程師工作提醒"
        : "通知偏好";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          LINE 通知偏好 — {sectionTitle}
        </CardTitle>
        <CardDescription>
          {linePrefs.roleCategory === "manager"
            ? "管理者可訂閱 AI 晨報、晚報、財務與派工進度相關通知。"
            : linePrefs.roleCategory === "engineer"
              ? "工程師僅可訂閱工作提醒與公司公告，不含晨報或財務通知。"
              : "依您的角色顯示可訂閱項目。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(item => (
          <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <Switch
              checked={linePrefs[item.key]}
              disabled={saveMutation.isPending}
              onCheckedChange={checked => handlePrefChange(item.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
