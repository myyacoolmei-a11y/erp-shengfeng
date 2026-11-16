import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { PLAN_PRESETS, type ModuleKey } from "../../../shared/companyModules.ts";

type FeatureRow = { featureKey: ModuleKey; label: string; enabled: boolean };

async function authJson(path: string, init?: RequestInit) {
  const token = localStorage.getItem("erp_auth_token");
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export default function CompanyModulesPage() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["company-features"],
    queryFn: () => authJson("/api/company/features"),
  });

  const patchMut = useMutation({
    mutationFn: (body: { featureKey: string; enabled: boolean }) =>
      authJson("/api/company/features", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["company-features"] });
      const me = await authJson("/api/auth/me");
      updateUser(me);
      toast({ title: "已更新功能模組" });
    },
    onError: (err: Error) => toast({ title: "更新失敗", description: err.message, variant: "destructive" }),
  });

  const planMut = useMutation({
    mutationFn: () =>
      authJson("/api/company/plans/apply", {
        method: "POST",
        body: JSON.stringify({ planKey: "sales_trial" }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["company-features"] });
      const me = await authJson("/api/auth/me");
      updateUser(me);
      toast({ title: "已套用業務試用版" });
    },
    onError: (err: Error) => toast({ title: "套用失敗", description: err.message, variant: "destructive" }),
  });

  const features: FeatureRow[] = q.data?.features ?? [];
  const planName = PLAN_PRESETS[q.data?.planKey ?? "sales_trial"]?.name ?? "業務試用版";

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">功能模組開關</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user?.companyName ? `${user.companyName}　` : ""}
          目前方案：{planName}。關閉後導覽列不顯示，頁面與 API 也會拒絕存取。原本功能不會刪除。
        </p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">業務試用版預設組合</CardTitle>
          <CardDescription>
            開啟：客戶、報價、發票、收款、應收帳款。關閉：派工、保養、補助、批發。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            disabled={planMut.isPending}
            onClick={() => planMut.mutate()}
          >
            {planMut.isPending ? "套用中…" : "套用業務試用版"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">模組清單</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {q.isLoading && <p className="text-sm text-muted-foreground py-2">載入中…</p>}
          {features.map((f) => (
            <div key={f.featureKey} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.featureKey}</p>
              </div>
              <Switch
                checked={f.enabled}
                disabled={patchMut.isPending}
                onCheckedChange={(enabled) => patchMut.mutate({ featureKey: f.featureKey, enabled })}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
