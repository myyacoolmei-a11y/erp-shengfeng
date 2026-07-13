import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Car, Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WOForm } from "@/components/work-order-form";
import { getCompanyAiWorkReminderSettings } from "@/lib/aiWorkReminderApi";
import {
  AI_REMINDER_VARIABLES,
  WORK_REMINDER_SCENARIOS,
  type WorkReminderScenarioId,
  type AiReminderRuleSource,
  buildWorkOrderPreviewContext,
  renderAiReminderMessage,
  resolveWorkOrderReminderMessage,
  parseCompanyAiWorkReminderSettings,
} from "@/lib/aiWorkReminderSettings";

const COMPANY_SETTINGS_KEY = ["company-ai-work-reminder-settings"];

interface WorkOrderAiReminderSectionProps {
  form: WOForm;
  setForm: React.Dispatch<React.SetStateAction<WOForm>>;
  workOrderNumber?: string | null;
  customerDisplayName?: string;
}

export function validateWorkOrderAiReminder(form: WOForm): string | null {
  if (!form.aiReminderEnabled) return null;
  if (!form.scheduledDate?.trim()) return "啟用 AI 工作提醒時，請填寫預約到場日期";
  if (!form.scheduledTime?.trim()) return "啟用 AI 工作提醒時，請填寫預約到場時間";
  if (!form.aiReminderScenarioIds.length) return "請至少選擇一項提醒時間";
  return null;
}

export function WorkOrderAiReminderSection({
  form,
  setForm,
  workOrderNumber,
  customerDisplayName,
}: WorkOrderAiReminderSectionProps) {
  const { data: companySettingsRaw } = useQuery({
    queryKey: COMPANY_SETTINGS_KEY,
    queryFn: getCompanyAiWorkReminderSettings,
  });

  const companySettings = useMemo(
    () => parseCompanyAiWorkReminderSettings(companySettingsRaw),
    [companySettingsRaw],
  );

  const engineerName = form.technicians[0] || "—";
  const customerName = customerDisplayName || form.customerName || "—";

  const previewItems = useMemo(() => {
    return form.aiReminderScenarioIds.map(scenarioId => {
      const scenario = WORK_REMINDER_SCENARIOS.find(s => s.id === scenarioId);
      const template = resolveWorkOrderReminderMessage({
        scenarioId,
        ruleSource: form.aiReminderRuleSource,
        companySettings,
        customConfig: form.aiReminderCustomConfig,
      });
      const ctx = buildWorkOrderPreviewContext({
        customerName,
        installAddress: form.installAddress,
        workOrderNumber: workOrderNumber ?? undefined,
        engineerName,
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime,
        scenarioId,
      });
      return {
        id: scenarioId,
        label: scenario?.label ?? scenarioId,
        rendered: renderAiReminderMessage(template, ctx),
      };
    });
  }, [form, companySettings, customerName, engineerName, workOrderNumber]);

  function toggleScenario(id: WorkReminderScenarioId, checked: boolean) {
    setForm(f => ({
      ...f,
      aiReminderScenarioIds: checked
        ? Array.from(new Set([...f.aiReminderScenarioIds, id]))
        : f.aiReminderScenarioIds.filter(s => s !== id),
    }));
  }

  function updateCustomMessage(id: WorkReminderScenarioId, message: string) {
    setForm(f => ({
      ...f,
      aiReminderCustomConfig: {
        scenarios: {
          ...f.aiReminderCustomConfig.scenarios,
          [id]: { ...f.aiReminderCustomConfig.scenarios[id], message },
        },
      },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Car className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI 工作提醒</p>
      </div>
      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>預約到場日期 <span className="text-destructive">*</span></Label>
          <Input
            type="date"
            value={form.scheduledDate}
            onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>預約到場時間 <span className="text-destructive">*</span></Label>
          <Input
            type="time"
            value={form.scheduledTime}
            onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>預估施工時間（分鐘）</Label>
          <Input
            type="number"
            min={0}
            placeholder="例：120"
            value={form.estimatedWorkMinutes ?? ""}
            onChange={e => setForm(f => ({
              ...f,
              estimatedWorkMinutes: e.target.value ? parseInt(e.target.value, 10) : undefined,
            }))}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">是否啟用 AI 工作提醒</p>
          <p className="text-xs text-muted-foreground">僅儲存設定，尚未串接推播排程</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{form.aiReminderEnabled ? "啟用" : "停用"}</span>
          <Switch
            checked={form.aiReminderEnabled}
            onCheckedChange={checked => setForm(f => ({ ...f, aiReminderEnabled: checked }))}
          />
        </div>
      </div>

      {form.aiReminderEnabled && (
        <>
          <div className="space-y-2">
            <Label>提醒時間（可複選）</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {WORK_REMINDER_SCENARIOS.map(scenario => (
                <label
                  key={scenario.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={form.aiReminderScenarioIds.includes(scenario.id)}
                    onCheckedChange={checked => toggleScenario(scenario.id, checked === true)}
                  />
                  {scenario.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">是否通知主管（若可能延誤）</p>
              <p className="text-xs text-muted-foreground">逾時或行程衝突時通知主管（下一階段串接）</p>
            </div>
            <Switch
              checked={form.aiNotifySupervisorOnDelay}
              onCheckedChange={checked => setForm(f => ({ ...f, aiNotifySupervisorOnDelay: checked }))}
            />
          </div>

          <div className="space-y-3">
            <Label>提醒規則</Label>
            <RadioGroup
              value={form.aiReminderRuleSource}
              onValueChange={v => setForm(f => ({ ...f, aiReminderRuleSource: v as AiReminderRuleSource }))}
              className="space-y-2"
            >
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer">
                <RadioGroupItem value="company_default" />
                使用公司預設
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer">
                <RadioGroupItem value="custom" />
                使用本案件自訂提醒
              </label>
            </RadioGroup>
          </div>

          {form.aiReminderRuleSource === "custom" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                可修改本案件提醒文字，不影響其他案件。支援變數：
                {AI_REMINDER_VARIABLES.map(v => (
                  <Badge key={v.token} variant="outline" className="ml-1 text-[10px]">{v.token}</Badge>
                ))}
              </p>
              {form.aiReminderScenarioIds.map(scenarioId => {
                const scenario = WORK_REMINDER_SCENARIOS.find(s => s.id === scenarioId);
                const customMessage = form.aiReminderCustomConfig.scenarios[scenarioId]?.message
                  ?? companySettings.scenarios[scenarioId]?.message
                  ?? scenario?.defaultMessage
                  ?? "";
                return (
                  <div key={scenarioId} className="space-y-1">
                    <Label className="text-xs">{scenario?.label}</Label>
                    <Textarea
                      rows={4}
                      value={customMessage}
                      onChange={e => updateCustomMessage(scenarioId, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" />
                提醒預覽
              </CardTitle>
              <CardDescription>依目前案件資料與提醒規則產生的預覽（尚未實際發送）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {previewItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">請選擇至少一項提醒時間</p>
              ) : (
                previewItems.map(item => (
                  <div key={item.id} className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{item.label}</p>
                    <pre className="text-sm whitespace-pre-wrap font-sans">{item.rendered}</pre>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
