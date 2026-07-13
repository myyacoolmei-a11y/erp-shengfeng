import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Car, Save, Eye, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { APP_BRAND } from "@/lib/appBrand";
import { useAuth, hasRole } from "@/contexts/auth-context";
import {
  getCompanyAiWorkReminderSettings,
  updateCompanyAiWorkReminderSettings,
  previewCompanyAiWorkReminderSettings,
} from "@/lib/aiWorkReminderApi";
import {
  AI_REMINDER_PREVIEW_SAMPLE,
  AI_REMINDER_VARIABLES,
  WORK_REMINDER_SCENARIOS,
  defaultCompanyAiWorkReminderSettings,
  renderAiReminderMessage,
  type WorkReminderScenarioId,
  type CompanyAiWorkReminderSettings,
} from "@/lib/aiWorkReminderSettings";

const SETTINGS_KEY = ["company-ai-work-reminder-settings"];

export default function AiWorkRemindersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole(user, "super_admin", "owner", "admin");

  const [draft, setDraft] = useState<CompanyAiWorkReminderSettings>(() => defaultCompanyAiWorkReminderSettings());
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getCompanyAiWorkReminderSettings,
  });

  const { data: previewData, refetch: refetchPreview, isFetching: previewLoading } = useQuery({
    queryKey: ["company-ai-work-reminder-preview"],
    queryFn: previewCompanyAiWorkReminderSettings,
    enabled: false,
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `AI 工作提醒 — ${APP_BRAND.pwaName}`;
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: updateCompanyAiWorkReminderSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast({ title: "公司預設提醒規則已儲存" });
    },
    onError: (err: Error) => toast({ title: "儲存失敗", description: err.message, variant: "destructive" }),
  });

  const localPreviews = useMemo(() => {
    return WORK_REMINDER_SCENARIOS.map(scenario => {
      const message = draft.scenarios[scenario.id]?.message ?? scenario.defaultMessage;
      return {
        id: scenario.id,
        label: scenario.shortLabel,
        rendered: renderAiReminderMessage(message, {
          ...AI_REMINDER_PREVIEW_SAMPLE,
          remainingTime: scenario.defaultRemainingTime,
        }),
      };
    });
  }, [draft]);

  function updateScenario(id: WorkReminderScenarioId, patch: Partial<{ enabled: boolean; message: string }>) {
    setDraft(prev => ({
      scenarios: {
        ...prev.scenarios,
        [id]: { ...prev.scenarios[id], ...patch },
      },
    }));
  }

  async function handlePreview() {
    setShowPreview(true);
    await refetchPreview();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Car className="h-6 w-6" />
          AI 工作提醒
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          設定公司預設提醒規則與提醒文字。派工單可引用此預設，或針對單一案件自訂覆寫。
        </p>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="py-4 text-sm text-muted-foreground space-y-1">
          <p>此頁僅管理「提醒規則與提醒內容」，不設定個別案件。</p>
          <p>案件資料（預約到場時間、工程師等）請至「派工單」編輯。</p>
          <p>LINE、Web Push、排程發送將於下一階段串接。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">可用變數</CardTitle>
          <CardDescription>提醒文字中可插入以下變數，發送時系統自動替換</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {AI_REMINDER_VARIABLES.map(v => (
            <Badge key={v.token} variant="secondary" title={v.description}>
              {v.token}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />載入公司預設設定…
        </p>
      ) : (
        <div className="grid gap-4">
          {WORK_REMINDER_SCENARIOS.map(scenario => {
            const config = draft.scenarios[scenario.id];
            return (
              <Card key={scenario.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{scenario.shortLabel}</CardTitle>
                      <CardDescription>{scenario.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label htmlFor={`enabled-${scenario.id}`} className="text-xs text-muted-foreground">
                        {config.enabled ? "啟用" : "停用"}
                      </Label>
                      <Switch
                        id={`enabled-${scenario.id}`}
                        checked={config.enabled}
                        disabled={!isAdmin}
                        onCheckedChange={checked => updateScenario(scenario.id, { enabled: checked })}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label htmlFor={`message-${scenario.id}`}>提醒文字</Label>
                  <Textarea
                    id={`message-${scenario.id}`}
                    rows={5}
                    disabled={!isAdmin}
                    value={config.message}
                    onChange={e => updateScenario(scenario.id, { message: e.target.value })}
                  />
                  <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">即時預覽</p>
                    <pre className="text-sm whitespace-pre-wrap font-sans">
                      {renderAiReminderMessage(config.message, {
                        ...AI_REMINDER_PREVIEW_SAMPLE,
                        remainingTime: scenario.defaultRemainingTime,
                      })}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending || isLoading}>
            <Save className="h-4 w-4 mr-1" />
            儲存公司預設
          </Button>
        )}
        <Button variant="outline" onClick={() => void handlePreview()} disabled={previewLoading}>
          {previewLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
          預覽全部（伺服器）
        </Button>
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">僅管理員可修改公司預設。您仍可查看規則與預覽內容。</p>
      )}

      {showPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">伺服器預覽結果</CardTitle>
            <CardDescription>使用範例資料套入目前儲存的公司預設</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(previewData?.previews ?? localPreviews).map(item => (
              <div key={item.id} className="rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">{item.label}</p>
                <pre className="text-sm whitespace-pre-wrap font-sans">{item.rendered}</pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
