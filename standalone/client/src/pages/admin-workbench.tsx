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
import {
  ARCHIVE_CHECKLIST_KEYS,
  ARCHIVE_CHECKLIST_LABELS,
  emptyArchiveChecklist,
  type ArchiveChecklist,
} from "../../../shared/adminWorkflowConstants.ts";
import {
  completeAdminArchive,
  confirmAdminCompletion,
  fetchAdminWorkbench,
  markAdminBilled,
  markAdminPaid,
  recordAdminPayment,
  toggleAdminSubsidy,
  type AdminWorkbenchItem,
} from "@/lib/adminWorkbenchApi";

function money(v?: string | null) {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n.toLocaleString("zh-TW") : "0";
}

function Flag({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span className={ok ? "text-green-700" : "text-destructive"}>
      {ok ? "✓" : "✗"} {label}
    </span>
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
  children: React.ReactNode;
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
      {children}
    </div>
  );
}

export default function AdminWorkbench() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canOperate = hasRole(user, "super_admin", "owner", "admin");
  const canFinance = canOperate || hasRole(user, "accountant");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-workbench"],
    queryFn: fetchAdminWorkbench,
    enabled: !!user && canFinance,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin-workbench"] });

  const onErr = (err: unknown) => {
    const msg = err instanceof Error ? err.message : "操作失敗";
    toast({ title: "無法完成操作", description: msg, variant: "destructive" });
  };

  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmAdminCompletion(id),
    onSuccess: () => {
      toast({ title: "已確認完工，進入待請款" });
      invalidate();
    },
    onError: onErr,
  });

  const billMut = useMutation({
    mutationFn: (p: { id: number; body: Parameters<typeof markAdminBilled>[1] }) =>
      markAdminBilled(p.id, p.body),
    onSuccess: () => {
      toast({ title: "已標記請款，進入待收款" });
      invalidate();
    },
    onError: onErr,
  });

  const subsidyMut = useMutation({
    mutationFn: (p: { id: number; applied: boolean }) => toggleAdminSubsidy(p.id, p.applied),
    onSuccess: () => {
      toast({ title: "補助狀態已更新" });
      invalidate();
    },
    onError: onErr,
  });

  const payMut = useMutation({
    mutationFn: (p: {
      id: number;
      amount: number;
      paymentDate: string;
    }) => recordAdminPayment(p.id, p),
    onSuccess: () => {
      toast({ title: "已登記收款" });
      invalidate();
    },
    onError: onErr,
  });

  const markPaidMut = useMutation({
    mutationFn: (id: number) => markAdminPaid(id),
    onSuccess: () => {
      toast({ title: "已標記收款，進入待歸檔" });
      invalidate();
    },
    onError: onErr,
  });

  const archiveMut = useMutation({
    mutationFn: (p: { id: number; checklist: ArchiveChecklist }) =>
      completeAdminArchive(p.id, p.checklist),
    onSuccess: () => {
      toast({ title: "已完成歸檔，案件已結案" });
      invalidate();
    },
    onError: onErr,
  });

  const [payDraft, setPayDraft] = useState<Record<number, string>>({});
  const [archiveDraft, setArchiveDraft] = useState<Record<number, ArchiveChecklist>>({});
  const [billDraft, setBillDraft] = useState<
    Record<number, { extra: string; discount: string; due: string; billTo: string; subsidy: boolean }>
  >({});

  const sectionOrder = useMemo(() => {
    if (!data) return [];
    return [
      { key: "overdue", title: "已逾期收款", accent: "red" as const, items: data.sections.collectionOverdue, count: data.counts.overdue },
      { key: "today", title: "今日到期收款", accent: "orange" as const, items: data.sections.collectionToday, count: data.counts.dueToday },
      { key: "review", title: "待行政確認", accent: "normal" as const, items: data.sections.pendingAdminReview, count: data.counts.pendingAdminReview },
      { key: "billing", title: "待製作請款", accent: "normal" as const, items: data.sections.pendingBilling, count: data.counts.pendingBilling },
      { key: "subsidy", title: "待申請補助", accent: "normal" as const, items: data.sections.pendingSubsidy, count: data.counts.pendingSubsidy },
      { key: "archive", title: "待歸檔", accent: "normal" as const, items: data.sections.pendingArchive, count: data.counts.pendingArchive },
      { key: "soon", title: "即將到期收款", accent: "normal" as const, items: data.sections.collectionSoon, count: data.sections.collectionSoon.length },
      { key: "partial", title: "部分收款", accent: "normal" as const, items: data.sections.collectionPartial, count: data.sections.collectionPartial.length },
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
          行政每日工作台 · {data.today} · 未完成待辦 {data.counts.openTodos} 件
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
              if (sec.key === "review") {
                return (
                  <ItemShell key={item.workOrderId} item={item}>
                    <p className="text-xs text-muted-foreground">
                      施工完成時間：
                      {item.completedAt
                        ? new Date(item.completedAt).toLocaleString("zh-TW", {
                            timeZone: "Asia/Taipei",
                          })
                        : "—"}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <Flag ok={item.hasPhotos} label="完工照片" />
                      <Flag ok={item.hasSignature} label="客戶簽名" />
                      <Flag ok={item.hasMaterials} label="材料紀錄" />
                    </div>
                    {item.anomalyNote && (
                      <p className="text-xs text-amber-800">異常備註：{item.anomalyNote}</p>
                    )}
                    {canOperate && (
                      <Button
                        size="sm"
                        disabled={confirmMut.isPending}
                        onClick={() => confirmMut.mutate(item.workOrderId)}
                      >
                        確認完工
                      </Button>
                    )}
                  </ItemShell>
                );
              }

              if (sec.key === "billing") {
                const draft = billDraft[item.workOrderId] ?? {
                  extra: item.extraAmount ?? "0",
                  discount: item.discountAmount ?? "0",
                  due: item.expectedPaymentDate ?? "",
                  billTo: item.billTo ?? item.customerName ?? "",
                  subsidy: !!item.needsSubsidy,
                };
                return (
                  <ItemShell key={item.workOrderId} item={item}>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <p>原報價：${money(item.quoteOriginalAmount)}</p>
                      <p>最終請款：${money(item.finalAmount)}</p>
                    </div>
                    {canOperate && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">追加金額</Label>
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
                          <Label className="text-xs">折讓金額</Label>
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
                          符合補助案件
                        </label>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/receivables`}>製作請款單</Link>
                      </Button>
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
                                invoiceNeeded: true,
                              },
                            })
                          }
                        >
                          標記已請款
                        </Button>
                      )}
                    </div>
                  </ItemShell>
                );
              }

              if (sec.key === "subsidy") {
                const applied = item.subsidyStatus === "已申請補助";
                return (
                  <ItemShell key={item.workOrderId} item={item}>
                    <p className="text-xs">目前：{item.subsidyStatus ?? "未申請補助"}</p>
                    {canOperate && (
                      <Button
                        size="sm"
                        variant={applied ? "secondary" : "default"}
                        disabled={subsidyMut.isPending}
                        onClick={() =>
                          subsidyMut.mutate({ id: item.workOrderId, applied: !applied })
                        }
                      >
                        {applied ? "已申請補助" : "未申請補助"}
                      </Button>
                    )}
                  </ItemShell>
                );
              }

              if (sec.key === "archive") {
                const cl =
                  archiveDraft[item.workOrderId] ??
                  item.archiveChecklist ??
                  emptyArchiveChecklist(!!item.needsSubsidy);
                return (
                  <ItemShell key={item.workOrderId} item={item}>
                    <div className="grid sm:grid-cols-2 gap-1">
                      {ARCHIVE_CHECKLIST_KEYS.map((k) => {
                        if (k === "subsidy" && !item.needsSubsidy) return null;
                        return (
                          <label key={k} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={!!cl[k]}
                              disabled={!canOperate}
                              onCheckedChange={(v) =>
                                setArchiveDraft((s) => ({
                                  ...s,
                                  [item.workOrderId]: { ...cl, [k]: !!v },
                                }))
                              }
                            />
                            {ARCHIVE_CHECKLIST_LABELS[k]}
                          </label>
                        );
                      })}
                    </div>
                    {canOperate && (
                      <Button
                        size="sm"
                        disabled={archiveMut.isPending}
                        onClick={() =>
                          archiveMut.mutate({ id: item.workOrderId, checklist: cl })
                        }
                      >
                        完成歸檔
                      </Button>
                    )}
                  </ItemShell>
                );
              }

              // collection sections
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
              ["確認完工", data.todayStats.confirmedToday],
              ["已請款", data.todayStats.billedToday],
              ["已收款", data.todayStats.paidToday],
              ["已歸檔", data.todayStats.archivedToday],
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
