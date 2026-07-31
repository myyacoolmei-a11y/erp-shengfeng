import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, ClipboardList, Phone } from "lucide-react";
import { useAuth, hasRole } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { SubsidyPipelineStatus } from "../../../shared/adminWorkflowConstants.ts";
import {
  advanceAdminSubsidyPipeline,
  approveAdminCloseOverride,
  completeAdminClose,
  confirmAdminCompletion,
  fetchAdminWorkbench,
  markAdminBilled,
  markAdminPaid,
  recordAdminPayment,
  setAdminSubsidyType,
  type AdminWorkbenchItem,
} from "@/lib/adminWorkbenchApi";

function money(v?: string | null) {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n.toLocaleString("zh-TW") : "0";
}

function StatusRow({ item }: { item: AdminWorkbenchItem }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-xs">
      <p>
        <span className="text-muted-foreground">工程資料：</span>
        {item.engineeringStatusLabel ?? "—"}
      </p>
      <p>
        <span className="text-muted-foreground">應收帳款：</span>
        {item.receivableStatusLabel ?? "—"}
      </p>
      <p>
        <span className="text-muted-foreground">補助：</span>
        {item.subsidyStatusLabel ?? "不適用補助"}
      </p>
      <p>
        <span className="text-muted-foreground">可結案：</span>
        <span className={item.canClose ? "text-green-700" : "text-amber-700"}>
          {item.canClose ? "是" : "否"}
        </span>
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent?: "red" | "orange" | "normal";
  children: React.ReactNode;
}) {
  const border =
    accent === "red"
      ? "border-red-300"
      : accent === "orange"
        ? "border-orange-300"
        : "border-border";
  return (
    <Card className={border}>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          {title}
        </CardTitle>
        <Badge variant={count > 0 ? "default" : "secondary"}>{count}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function ItemShell({
  item,
  children,
}: {
  item: AdminWorkbenchItem;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{item.customerName ?? "未命名客戶"}</p>
          <p className="text-muted-foreground text-xs">
            {item.workOrderNumber ?? `#${item.workOrderId}`} · {item.installAddress ?? "—"}
          </p>
          <p className="text-xs mt-0.5">工程師／師傅：{item.engineerName ?? "—"}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/work-orders?highlight=${item.workOrderId}`}>查看案件</Link>
        </Button>
      </div>
      <StatusRow item={item} />
      {children}
    </div>
  );
}

const SUBSIDY_NEXT: Partial<Record<SubsidyPipelineStatus, SubsidyPipelineStatus>> = {
  link_not_sent: "awaiting_upload",
  awaiting_upload: "docs_incomplete",
  docs_incomplete: "docs_complete",
  docs_complete: "pending_apply",
  pending_apply: "applied",
};

const SUBSIDY_NEXT_LABEL: Partial<Record<SubsidyPipelineStatus, string>> = {
  link_not_sent: "傳送資料連結",
  awaiting_upload: "標記資料待補",
  docs_incomplete: "標記資料已齊",
  docs_complete: "進入待申請",
  pending_apply: "標記已申請",
};

export default function AdminWorkbench() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canOperate = hasRole(user, "super_admin", "owner", "admin");
  const canFinance = canOperate || hasRole(user, "accountant");
  const canOverride = hasRole(user, "super_admin", "owner");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-workbench"],
    queryFn: fetchAdminWorkbench,
    enabled: !!user && canFinance,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin-workbench"] });
  const onErr = (err: unknown) => {
    toast({
      title: "無法完成操作",
      description: err instanceof Error ? err.message : "操作失敗",
      variant: "destructive",
    });
  };

  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmAdminCompletion(id),
    onSuccess: () => {
      toast({ title: "已確認施工資料" });
      invalidate();
    },
    onError: onErr,
  });

  const billMut = useMutation({
    mutationFn: (p: { id: number; body: Parameters<typeof markAdminBilled>[1] }) =>
      markAdminBilled(p.id, p.body),
    onSuccess: () => {
      toast({ title: "已建立應收帳款" });
      invalidate();
    },
    onError: onErr,
  });

  const subsidyPipeMut = useMutation({
    mutationFn: (p: { id: number; status: SubsidyPipelineStatus }) =>
      advanceAdminSubsidyPipeline(p.id, p.status),
    onSuccess: () => {
      toast({ title: "補助狀態已更新" });
      invalidate();
    },
    onError: onErr,
  });

  const subsidyTypeMut = useMutation({
    mutationFn: (p: { id: number; enabled: boolean }) =>
      setAdminSubsidyType(p.id, p.enabled ? "company_assisted" : "none"),
    onSuccess: () => {
      toast({ title: "補助類型已更新" });
      invalidate();
    },
    onError: onErr,
  });

  const payMut = useMutation({
    mutationFn: (p: { id: number; amount: number; paymentDate: string }) =>
      recordAdminPayment(p.id, p),
    onSuccess: () => {
      toast({ title: "已登記收款" });
      invalidate();
    },
    onError: onErr,
  });

  const markPaidMut = useMutation({
    mutationFn: (id: number) => markAdminPaid(id),
    onSuccess: () => {
      toast({ title: "已標記收款" });
      invalidate();
    },
    onError: onErr,
  });

  const closeMut = useMutation({
    mutationFn: (id: number) => completeAdminClose(id),
    onSuccess: () => {
      toast({ title: "案件已結案" });
      invalidate();
    },
    onError: onErr,
  });

  const overrideMut = useMutation({
    mutationFn: (id: number) => approveAdminCloseOverride(id, "核准補助未完成先結案"),
    onSuccess: () => {
      toast({ title: "已核准先結案" });
      invalidate();
    },
    onError: onErr,
  });

  const [payDraft, setPayDraft] = useState<Record<number, string>>({});
  const [billDraft, setBillDraft] = useState<
    Record<number, { extra: string; discount: string; due: string; billTo: string; subsidy: boolean }>
  >({});

  const sectionOrder = useMemo(() => {
    if (!data) return [];
    const s = data.sections;
    const c = data.counts;
    return [
      { key: "confirm", title: "待確認施工資料", accent: "normal" as const, items: s.pendingConstructionConfirm, count: c.pendingConstructionConfirm ?? 0 },
      { key: "createAr", title: "待建立應收帳款", accent: "normal" as const, items: s.pendingCreateReceivable, count: c.pendingCreateReceivable ?? 0 },
      { key: "noDue", title: "未設定收款日", accent: "normal" as const, items: s.noDueDate, count: c.noDueDate ?? 0 },
      { key: "overdue", title: "已逾期", accent: "red" as const, items: s.collectionOverdue, count: c.collectionOverdue ?? 0 },
      { key: "today", title: "今日到期", accent: "orange" as const, items: s.collectionToday, count: c.collectionToday ?? 0 },
      { key: "soon", title: "即將到期", accent: "normal" as const, items: s.collectionSoon, count: c.collectionSoon ?? 0 },
      { key: "partial", title: "部分收款", accent: "normal" as const, items: s.collectionPartial, count: c.collectionPartial ?? 0 },
      { key: "subLink", title: "待傳送補助資料連結", accent: "normal" as const, items: s.subsidyLinkNotSent, count: c.subsidyLinkNotSent ?? 0 },
      { key: "subWait", title: "等待客戶上傳", accent: "normal" as const, items: s.subsidyAwaitingUpload, count: c.subsidyAwaitingUpload ?? 0 },
      { key: "subInc", title: "客戶資料待補件", accent: "normal" as const, items: s.subsidyDocsIncomplete, count: c.subsidyDocsIncomplete ?? 0 },
      { key: "subOk", title: "補助資料已齊", accent: "normal" as const, items: s.subsidyDocsComplete, count: c.subsidyDocsComplete ?? 0 },
      { key: "subApply", title: "待申請補助", accent: "normal" as const, items: s.subsidyPendingApply, count: c.subsidyPendingApply ?? 0 },
      { key: "close", title: "已收款／待結案", accent: "normal" as const, items: s.pendingClose, count: c.pendingClose ?? 0 },
      { key: "closed", title: "已結案", accent: "normal" as const, items: s.closed, count: c.closed ?? 0 },
    ];
  }, [data]);

  if (!user || !canFinance) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-muted-foreground">
        您沒有行政工作台權限
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="max-w-3xl mx-auto border-destructive/40">
        <CardContent className="py-8 text-center space-y-3">
          <AlertCircle className="h-7 w-7 text-destructive mx-auto" />
          <p className="font-medium text-destructive">行政工作台載入失敗</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "請稍後再試"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            重新整理
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold tracking-tight">今日必做事項</h1>
        <p className="text-sm text-muted-foreground mt-1">
          行政每日工作台 · {data.today} · 未完成待辦 {data.counts.openTodos ?? 0} 件
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          核心：施工資料確認 → 應收帳款與收款 → 補助申請 → 案件結案（不含保固）
        </p>
      </div>

      {(data.alerts.hasOverdue || data.alerts.hasDueToday) && (
        <div className="space-y-2">
          {data.alerts.hasOverdue && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              有 {data.alerts.overdueCount} 件逾期收款，請優先處理
            </div>
          )}
          {data.alerts.hasDueToday && (
            <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
              今日有 {data.alerts.dueTodayCount} 件到期收款
            </div>
          )}
        </div>
      )}

      {sectionOrder.map((sec) => (
        <Section key={sec.key} title={sec.title} count={sec.count} accent={sec.accent}>
          {sec.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">目前無待辦</p>
          ) : (
            sec.items.map((item) => {
              if (sec.key === "confirm") {
                return (
                  <ItemShell key={item.workOrderId} item={item}>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className={item.hasPhotos ? "text-green-700" : "text-destructive"}>
                        {item.hasPhotos ? "✓" : "✗"} 完工照片
                      </span>
                      <span className={item.hasSignature ? "text-green-700" : "text-destructive"}>
                        {item.hasSignature ? "✓" : "✗"} 客戶簽名
                      </span>
                      <span className={item.hasMaterials ? "text-green-700" : "text-destructive"}>
                        {item.hasMaterials ? "✓" : "✗"} 材料紀錄
                      </span>
                    </div>
                    {canOperate && (
                      <Button
                        size="sm"
                        disabled={confirmMut.isPending}
                        onClick={() => confirmMut.mutate(item.workOrderId)}
                      >
                        確認施工資料
                      </Button>
                    )}
                  </ItemShell>
                );
              }

              if (sec.key === "createAr" || sec.key === "noDue") {
                const draft = billDraft[item.workOrderId] ?? {
                  extra: item.extraAmount ?? "0",
                  discount: item.discountAmount ?? "0",
                  due: item.expectedPaymentDate ?? "",
                  billTo: item.billTo ?? item.customerName ?? "",
                  subsidy: item.subsidyType === "company_assisted",
                };
                return (
                  <ItemShell key={`${sec.key}-${item.workOrderId}`} item={item}>
                    <p className="text-xs">原報價：${money(item.quoteOriginalAmount)}</p>
                    {canOperate && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">追加</Label>
                          <Input
                            value={draft.extra}
                            onChange={(e) =>
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: { ...draft, extra: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">折讓</Label>
                          <Input
                            value={draft.discount}
                            onChange={(e) =>
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: { ...draft, discount: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">預計收款日</Label>
                          <Input
                            type="date"
                            value={draft.due}
                            onChange={(e) =>
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: { ...draft, due: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">請款對象</Label>
                          <Input
                            value={draft.billTo}
                            onChange={(e) =>
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: { ...draft, billTo: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs col-span-2">
                          <Checkbox
                            checked={draft.subsidy}
                            onCheckedChange={(v) =>
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: { ...draft, subsidy: !!v },
                              }))
                            }
                          />
                          公司協助補助（可與收款並行）
                        </label>
                      </div>
                    )}
                    {canOperate && (
                      <Button
                        size="sm"
                        disabled={billMut.isPending}
                        onClick={() =>
                          billMut.mutate({
                            id: item.workOrderId,
                            body: {
                              extraAmount: draft.extra,
                              discountAmount: draft.discount,
                              billTo: draft.billTo,
                              expectedPaymentDate: draft.due || undefined,
                              needsSubsidy: draft.subsidy,
                              subsidyType: draft.subsidy ? "company_assisted" : "none",
                            },
                          })
                        }
                      >
                        {sec.key === "noDue" ? "補設定收款日並更新" : "建立應收帳款"}
                      </Button>
                    )}
                  </ItemShell>
                );
              }

              if (sec.key.startsWith("sub")) {
                const pipe = item.subsidyPipelineStatus ?? "link_not_sent";
                const next = SUBSIDY_NEXT[pipe];
                return (
                  <ItemShell key={`${sec.key}-${item.workOrderId}`} item={item}>
                    {canOperate && (
                      <div className="flex flex-wrap gap-2">
                        {item.subsidyType !== "company_assisted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              subsidyTypeMut.mutate({ id: item.workOrderId, enabled: true })
                            }
                          >
                            設為公司協助補助
                          </Button>
                        )}
                        {next && (
                          <Button
                            size="sm"
                            disabled={subsidyPipeMut.isPending}
                            onClick={() =>
                              subsidyPipeMut.mutate({ id: item.workOrderId, status: next })
                            }
                          >
                            {SUBSIDY_NEXT_LABEL[pipe] ?? "下一步"}
                          </Button>
                        )}
                        {pipe === "awaiting_upload" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              subsidyPipeMut.mutate({
                                id: item.workOrderId,
                                status: "docs_complete",
                              })
                            }
                          >
                            直接標記資料已齊
                          </Button>
                        )}
                      </div>
                    )}
                  </ItemShell>
                );
              }

              if (sec.key === "close") {
                return (
                  <ItemShell key={`close-${item.workOrderId}`} item={item}>
                    {!item.canClose && item.closeBlockers && item.closeBlockers.length > 0 && (
                      <ul className="text-xs text-amber-800 list-disc pl-4">
                        {item.closeBlockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {canOverride &&
                        item.subsidyType === "company_assisted" &&
                        !item.closeOverrideAt &&
                        item.subsidyPipelineStatus !== "applied" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={overrideMut.isPending}
                            onClick={() => overrideMut.mutate(item.workOrderId)}
                          >
                            核准先結案
                          </Button>
                        )}
                      {canOperate && (
                        <Button
                          size="sm"
                          disabled={closeMut.isPending || !item.canClose}
                          onClick={() => closeMut.mutate(item.workOrderId)}
                        >
                          完成結案
                        </Button>
                      )}
                    </div>
                  </ItemShell>
                );
              }

              if (sec.key === "closed") {
                return <ItemShell key={`closed-${item.workOrderId}`} item={item} />;
              }

              // collection
              const amt = payDraft[item.workOrderId] ?? item.unpaidAmount ?? "0";
              const phone = item.mobilePhone || item.telephone;
              return (
                <ItemShell key={`${sec.key}-${item.workOrderId}`} item={item}>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <p>應收：${money(item.totalAmount)}</p>
                    <p>已收：${money(item.receivedAmount)}</p>
                    <p>未收：${money(item.unpaidAmount)}</p>
                    <p>到期：{item.expectedPaymentDate ?? "—"}</p>
                    {item.overdueDays != null && item.overdueDays > 0 && (
                      <p className="text-red-700 col-span-2">逾期 {item.overdueDays} 天</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 items-end">
                    {phone && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`tel:${phone}`}>
                          <Phone className="h-3.5 w-3.5 mr-1" />
                          聯絡客戶
                        </a>
                      </Button>
                    )}
                    {canFinance && (
                      <>
                        <div className="w-28">
                          <Label className="text-xs">收款金額</Label>
                          <Input
                            value={amt}
                            onChange={(e) =>
                              setPayDraft((s) => ({ ...s, [item.workOrderId]: e.target.value }))
                            }
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={payMut.isPending}
                          onClick={() =>
                            payMut.mutate({
                              id: item.workOrderId,
                              amount: parseFloat(amt) || 0,
                              paymentDate: data.today,
                            })
                          }
                        >
                          登記收款
                        </Button>
                      </>
                    )}
                    {canOperate && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={markPaidMut.isPending}
                        onClick={() => markPaidMut.mutate(item.workOrderId)}
                      >
                        標記已收款
                      </Button>
                    )}
                  </div>
                </ItemShell>
              );
            })
          )}
        </Section>
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            今日完成
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
            {[
              ["確認施工", data.todayStats.confirmedToday],
              ["建立應收", data.todayStats.receivableCreatedToday],
              ["已收款", data.todayStats.paidToday],
              ["已結案", data.todayStats.closedToday],
              ["尚未完成待辦", data.todayStats.openTodos],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
