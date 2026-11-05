import { useQuery } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMyLineNotificationPrefs } from "@/lib/reminderSettingsApi";
import { formatEnabledNotificationLabels, NOTIFICATION_PREF_ITEMS } from "@/lib/notificationUserPrefs";

const LINE_PREFS_KEY = ["my-line-notification-preferences"];

export function LineNotificationPrefsPanel() {
  const { data: linePrefs, isLoading } = useQuery({
    queryKey: LINE_PREFS_KEY,
    queryFn: getMyLineNotificationPrefs,
  });

  if (isLoading || !linePrefs) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />載入通知權限…
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
            可接收通知
          </CardTitle>
          <CardDescription>完成上方 LINE 綁定後，可在此查看管理員為您設定的通知項目。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const enabledLabels = formatEnabledNotificationLabels(linePrefs);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          可接收通知（僅供查看）
        </CardTitle>
        <CardDescription>
          通知權限由管理員依個人設定。如需調整請聯絡 super_admin、owner 或 admin。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          目前已啟用：
          <span className="font-medium ml-1">{enabledLabels}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {NOTIFICATION_PREF_ITEMS.map(item => (
            <Badge
              key={item.key}
              variant={linePrefs[item.key] ? "default" : "outline"}
              className={linePrefs[item.key] ? undefined : "text-muted-foreground"}
            >
              {item.label}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
