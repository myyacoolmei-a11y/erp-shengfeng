import { useEffect, useState } from "react";
import { Car, Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { APP_BRAND } from "@/lib/appBrand";
import {
  WORK_REMINDER_SCENARIOS,
  loadWorkReminderSettings,
  saveWorkReminderSettings,
  defaultWorkReminderSettings,
  type WorkReminderSettings,
  type WorkReminderScenarioId,
} from "@/lib/aiWorkReminderSettings";

export default function AiWorkRemindersPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<WorkReminderSettings>(() => loadWorkReminderSettings());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `AI 工作提醒 — ${APP_BRAND.pwaName}`;
    return () => { document.title = previousTitle; };
  }, []);

  function updateScenario(id: WorkReminderScenarioId, patch: Partial<{ enabled: boolean; message: string }>) {
    setSettings(prev => ({
      scenarios: {
        ...prev.scenarios,
        [id]: { ...prev.scenarios[id], ...patch },
      },
    }));
    setDirty(true);
  }

  function handleSave() {
    saveWorkReminderSettings(settings);
    setDirty(false);
    toast({ title: "工程師行程提醒設定已儲存", description: "設定已存於本機，排程串接尚未啟用。" });
  }

  function handleReset() {
    const defaults = defaultWorkReminderSettings();
    setSettings(defaults);
    saveWorkReminderSettings(defaults);
    setDirty(false);
    toast({ title: "已還原預設提醒文字" });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Car className="h-6 w-6" />
          AI 工作提醒
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          工程師行程提醒設定。可先調整各情境的提醒文字與啟用狀態；排程與實際推播將於後續串接。
        </p>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="py-4 text-sm text-muted-foreground">
          此頁僅提供設定介面，尚未連動排程或通知發送邏輯。儲存後設定保留於瀏覽器本機。
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {WORK_REMINDER_SCENARIOS.map(scenario => {
          const config = settings.scenarios[scenario.id];
          return (
            <Card key={scenario.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">{scenario.label}</CardTitle>
                    <CardDescription>{scenario.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor={`enabled-${scenario.id}`} className="text-sm text-muted-foreground">
                      {config.enabled ? "啟用" : "停用"}
                    </Label>
                    <Switch
                      id={`enabled-${scenario.id}`}
                      checked={config.enabled}
                      onCheckedChange={checked => updateScenario(scenario.id, { enabled: checked })}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor={`message-${scenario.id}`}>提醒文字</Label>
                <Textarea
                  id={`message-${scenario.id}`}
                  rows={3}
                  value={config.message}
                  disabled={!config.enabled}
                  onChange={e => updateScenario(scenario.id, { message: e.target.value })}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={!dirty}>
          <Save className="h-4 w-4 mr-1" />
          儲存設定
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          還原預設
        </Button>
      </div>
    </div>
  );
}
