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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { SubsidyPipelineStatus } from "../../../shared/adminWorkflowConstants.ts";
import {
  advanceAdminSubsidyPipeline,
  approveAdminCloseOverride,
  cancelAdminPaid,
  completeAdminClose,
  confirmAdminCompletion,
  fetchAdminWorkbench,
  markAdminBilled,
  markAdminPaid,
  recordAdminPayment,
  reopenAdminClosed,
  setAdminExpectedPaymentDate,
  setAdminSubsidyType,
  type AdminWorkbenchItem,
} from "@/lib/adminWorkbenchApi";

function money(v?: string | null) {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n.toLocaleString("zh-TW") : "0";
}

function caseHref(workOrderId: number) {
  return `/work-orders?highlight=${workOrderId}`;
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
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  accent?: "red" | "orange" | "normal";
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
        <div className="flex items-center gap-2">
          <Badge variant={count > 0 ? "default" : "secondary"}>{count}</Badge>
          {collapsible && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "收合" : "展開"}
            </Button>
          )}
        </div>
      </CardHeader>
      {(!collapsible || open) && (
        <CardContent className="space-y-3">{children}</CardContent>
      )}
    </Card>
  );
}

function ReceivableSummary({ item }: { item: AdminWorkbenchItem }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-xs">
      <p>
        <span className="text-muted-foreground">客戶：</span>
        {item.customerName ?? "—"}
      </p>
      <p>
        <span className="text-muted-foreground">案件：</span>
        {item.workOrderNumber ?? `#${item.workOrderId}`}
      </p>
      <p>應收金額：NT${money(item.totalAmount)}</p>
      <p>已收金額：NT${money(item.receivedAmount)}</p>
      <p>未收金額：NT${money(item.unpaidAmount)}</p>
      <p>
        收款日：
        {item.expectedPaymentDate ? item.expectedPaymentDate : (
          <span className="text-amber-700 font-medium">未設定</span>
        )}
      </p>
      {item.overdueDays != null && item.overdueDays > 0 && (
        <p className="text-red-700 col-span-2">逾期 {item.overdueDays} 天</p>
      )}
    </div>
  );
}

function ItemShell({
  item,
  children,
  showViewCase = true,
}: {
  item: AdminWorkbenchItem;
  children?: React.ReactNode;
  showViewCase?: boolean;
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
        {showViewCase && (
          <Button asChild size="sm" variant="outline" className="h-9">
            <Link href={caseHref(item.workOrderId)}>查看案件</Link>
          </Button>
        )}
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
  link_not_sent: "傳送補助資料連結",
  awaiting_upload: "標記資料待補",
  docs_incomplete: "標記資料已齊",
  docs_complete: "進入待申請",
  pending_apply: "標記已申請補助",
};

function subsidyUploadShareText(item: AdminWorkbenchItem): string {
  const token = item.uploadLinkToken?.trim();
  const caseNo = item.workOrderNumber ?? `#${item.workOrderId}`;
  const lines = [
    "【晟風工程】補助資料上傳",
    `客戶：${item.customerName ?? "—"}`,
    `案件：${caseNo}`,
  ];
  if (token) {
    lines.push(`上傳代碼：${token}`);
    lines.push(`（請依公司指定管道傳送給客戶）`);
  }
  return lines.join("\n");
}

type BillDraft = {
  extra: string;
  discount: string;
  due: string;
  billTo: string;
  subsidy: boolean;
  /** Explicit final amount — required when no quote */
  finalAmount: string;
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

  const dueMut = useMutation({
    mutationFn: (p: { id: number; date: string }) => setAdminExpectedPaymentDate(p.id, p.date),
    onSuccess: () => {
      toast({ title: "已設定預計收款日" });
      setDueModal(null);
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
      setPayModal(null);
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

  const cancelPaidMut = useMutation({
    mutationFn: (id: number) => cancelAdminPaid(id, "取消已收款"),
    onSuccess: () => {
      toast({ title: "已取消已收款", description: "案件已回到未收款分類" });
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

  const reopenMut = useMutation({
    mutationFn: (id: number) => reopenAdminClosed(id, "取消結案／重新開啟"),
    onSuccess: () => {
      toast({ title: "已取消結案", description: "收款與補助資料均保留" });
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

  const [billDraft, setBillDraft] = useState<Record<number, BillDraft>>({});
  const [dueModal, setDueModal] = useState<{ item: AdminWorkbenchItem; date: string } | null>(null);
  const [payModal, setPayModal] = useState<{ item: AdminWorkbenchItem; amount: string } | null>(null);
  const [docsModal, setDocsModal] = useState<AdminWorkbenchItem | null>(null);

  function draftFor(item: AdminWorkbenchItem): BillDraft {
    const quote = parseFloat(String(item.quoteOriginalAmount ?? "0")) || 0;
    const extra = parseFloat(String(item.extraAmount ?? "0")) || 0;
    const discount = parseFloat(String(item.discountAmount ?? "0")) || 0;
    const computed = Math.max(0, quote + extra - discount);
    return (
      billDraft[item.workOrderId] ?? {
        extra: item.extraAmount ?? "0",
        discount: item.discountAmount ?? "0",
        due: "",
        billTo: item.billTo ?? item.customerName ?? "",
        subsidy: item.subsidyType === "company_assisted",
        finalAmount: String(computed > 0 ? computed : ""),
      }
    );
  }

  function finalPreview(d: BillDraft, item: AdminWorkbenchItem): number {
    const quote = parseFloat(String(item.quoteOriginalAmount ?? "0")) || 0;
    const extra = parseFloat(d.extra) || 0;
    const discount = parseFloat(d.discount) || 0;
    const computed = Math.max(0, quote + extra - discount);
    const typed = parseFloat(d.finalAmount);
    if (Number.isFinite(typed) && typed > 0) return typed;
    return computed;
  }

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

  function CollectionActions({ item }: { item: AdminWorkbenchItem }) {
    const unpaid = parseFloat(String(item.unpaidAmount ?? "0")) || 0;
    const phone = item.mobilePhone || item.telephone;
    return (
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        {phone && (
          <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
            <a href={`tel:${phone}`}>
              <Phone className="h-3.5 w-3.5 mr-1" />
              聯絡客戶
            </a>
          </Button>
        )}
        {canFinance && unpaid > 0 && (
          <Button
            size="sm"
            className="h-10 sm:h-9"
            onClick={() =>
              setPayModal({
                item,
                amount: String(unpaid),
              })
            }
          >
            登記收款
          </Button>
        )}
        {canOperate && (
          <Button
            size="sm"
            variant="outline"
            className="h-10 sm:h-9"
            onClick={() =>
              setDueModal({
                item,
                date: item.expectedPaymentDate ?? "",
              })
            }
          >
            設定收款日
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
          <Link href={caseHref(item.workOrderId)}>查看案件</Link>
        </Button>
        {canOperate && unpaid > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="h-10 sm:h-9"
            disabled={markPaidMut.isPending}
            onClick={() => markPaidMut.mutate(item.workOrderId)}
          >
            標記已收款
          </Button>
        )}
      </div>
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
        <Section
          key={sec.key}
          title={sec.title}
          count={sec.count}
          accent={sec.accent}
          collapsible={sec.key === "closed"}
          defaultOpen={sec.key === "closed" ? sec.count > 0 : true}
        >
          {sec.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {sec.key === "closed" ? "尚無已結案案件" : "目前無待辦"}
            </p>
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
                        className="h-10 sm:h-9"
                        disabled={confirmMut.isPending}
                        onClick={() => confirmMut.mutate(item.workOrderId)}
                      >
                        確認施工資料
                      </Button>
                    )}
                  </ItemShell>
                );
              }

              if (sec.key === "createAr") {
                const draft = draftFor(item);
                const preview = finalPreview(draft, item);
                return (
                  <ItemShell key={`createAr-${item.workOrderId}`} item={item} showViewCase>
                    <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
                      <p>原報價／成交金額：NT${money(item.quoteOriginalAmount)}</p>
                      <p className="font-medium text-foreground">
                        最終應收金額：NT${preview.toLocaleString("zh-TW")}
                      </p>
                      <p className="text-muted-foreground">
                        計算：報價 {money(item.quoteOriginalAmount)} + 追加 {money(draft.extra)} − 折讓 {money(draft.discount)}
                      </p>
                    </div>
                    {canOperate && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">追加</Label>
                          <Input
                            value={draft.extra}
                            onChange={(e) => {
                              const extra = e.target.value;
                              const quote = parseFloat(String(item.quoteOriginalAmount ?? "0")) || 0;
                              const discount = parseFloat(draft.discount) || 0;
                              const nextFinal = Math.max(0, quote + (parseFloat(extra) || 0) - discount);
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: {
                                  ...draft,
                                  extra,
                                  finalAmount: String(nextFinal || ""),
                                },
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">折讓</Label>
                          <Input
                            value={draft.discount}
                            onChange={(e) => {
                              const discount = e.target.value;
                              const quote = parseFloat(String(item.quoteOriginalAmount ?? "0")) || 0;
                              const extra = parseFloat(draft.extra) || 0;
                              const nextFinal = Math.max(0, quote + extra - (parseFloat(discount) || 0));
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: {
                                  ...draft,
                                  discount,
                                  finalAmount: String(nextFinal || ""),
                                },
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">最終應收金額 <span className="text-destructive">*</span></Label>
                          <Input
                            type="number"
                            value={draft.finalAmount}
                            onChange={(e) =>
                              setBillDraft((s) => ({
                                ...s,
                                [item.workOrderId]: { ...draft, finalAmount: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">預計收款日（選填）</Label>
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
                        <div className="sm:col-span-2">
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
                        className="h-10 sm:h-9"
                        disabled={billMut.isPending || !(preview > 0)}
                        onClick={() => {
                          if (!(preview > 0)) {
                            toast({
                              title: "請確認最終應收金額",
                              description: "金額必須大於 0",
                              variant: "destructive",
                            });
                            return;
                          }
                          billMut.mutate({
                            id: item.workOrderId,
                            body: {
                              extraAmount: draft.extra || "0",
                              discountAmount: draft.discount || "0",
                              finalAmount: String(preview),
                              billTo: draft.billTo,
                              expectedPaymentDate: draft.due || null,
                              needsSubsidy: draft.subsidy,
                              subsidyType: draft.subsidy ? "company_assisted" : "none",
                            },
                          });
                        }}
                      >
                        建立應收帳款（NT${preview.toLocaleString("zh-TW")}）
                      </Button>
                    )}
                  </ItemShell>
                );
              }

              if (sec.key === "noDue") {
                return (
                  <ItemShell key={`noDue-${item.workOrderId}`} item={item} showViewCase={false}>
                    <ReceivableSummary item={item} />
                    <CollectionActions item={item} />
                  </ItemShell>
                );
              }

              if (sec.key.startsWith("sub")) {
                const pipe = item.subsidyPipelineStatus ?? "link_not_sent";
                const next = SUBSIDY_NEXT[pipe];
                const paid = item.receivableStatus === "paid";
                return (
                  <ItemShell key={`${sec.key}-${item.workOrderId}`} item={item}>
                    <ReceivableSummary item={item} />
                    {paid && (
                      <p className="text-xs text-green-700">已收款 — 請完成補助流程後再結案</p>
                    )}
                    {canOperate && (
                      <div className="flex flex-wrap gap-2">
                        {item.subsidyType !== "company_assisted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 sm:h-9"
                            onClick={() =>
                              subsidyTypeMut.mutate({ id: item.workOrderId, enabled: true })
                            }
                          >
                            設為公司協助補助
                          </Button>
                        )}
                        {pipe === "link_not_sent" && (
                          <Button
                            size="sm"
                            className="h-10 sm:h-9"
                            disabled={subsidyPipeMut.isPending}
                            onClick={() => {
                              subsidyPipeMut.mutate(
                                { id: item.workOrderId, status: "awaiting_upload" },
                                {
                                  onSuccess: () => {
                                    const text = subsidyUploadShareText(item);
                                    void navigator.clipboard.writeText(text).then(
                                      () =>
                                        toast({
                                          title: "已傳送／複製補助資料連結",
                                          description: "分享內容已複製，可貼到 LINE 傳送給客戶",
                                        }),
                                      () =>
                                        toast({
                                          title: "補助狀態已更新",
                                          description: "請手動將上傳代碼告知客戶",
                                        }),
                                    );
                                  },
                                },
                              );
                            }}
                          >
                            傳送補助資料連結
                          </Button>
                        )}
                        {next && pipe !== "link_not_sent" && (
                          <Button
                            size="sm"
                            className="h-10 sm:h-9"
                            disabled={subsidyPipeMut.isPending}
                            onClick={() =>
                              subsidyPipeMut.mutate({ id: item.workOrderId, status: next })
                            }
                          >
                            {SUBSIDY_NEXT_LABEL[pipe] ?? "下一步"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 sm:h-9"
                          onClick={() => setDocsModal(item)}
                        >
                          查看客戶上傳資料
                          {(item.customerDocumentCount ?? 0) > 0
                            ? `（${item.customerDocumentCount}）`
                            : ""}
                        </Button>
                        {pipe !== "applied" && pipe !== "pending_apply" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-10 sm:h-9"
                            disabled={subsidyPipeMut.isPending}
                            onClick={() => {
                              if (!window.confirm("確定標記此案件為「已申請補助」？")) return;
                              subsidyPipeMut.mutate({
                                id: item.workOrderId,
                                status: "applied",
                              });
                            }}
                          >
                            標記已申請補助
                          </Button>
                        )}
                        {pipe === "awaiting_upload" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-10 sm:h-9"
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
                        {paid && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 sm:h-9 text-orange-700 border-orange-300"
                            disabled={cancelPaidMut.isPending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "確定取消已收款？將恢復為未收款，不會刪除派工單／報價單／施工資料。",
                                )
                              ) {
                                return;
                              }
                              cancelPaidMut.mutate(item.workOrderId);
                            }}
                          >
                            取消已收款
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
                    <ReceivableSummary item={item} />
                    <p className="text-xs text-green-700 font-medium">已收款／待結案</p>
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
                            className="h-10 sm:h-9"
                            disabled={overrideMut.isPending}
                            onClick={() => overrideMut.mutate(item.workOrderId)}
                          >
                            核准先結案
                          </Button>
                        )}
                      {canOperate && (
                        <Button
                          size="sm"
                          className="h-10 sm:h-9"
                          disabled={closeMut.isPending || !item.canClose}
                          onClick={() => closeMut.mutate(item.workOrderId)}
                        >
                          結案
                        </Button>
                      )}
                      {canOperate && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 sm:h-9 text-orange-700 border-orange-300"
                          disabled={cancelPaidMut.isPending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "確定取消已收款？將恢復為未收款，不會刪除派工單／報價單／施工資料。",
                              )
                            ) {
                              return;
                            }
                            cancelPaidMut.mutate(item.workOrderId);
                          }}
                        >
                          取消已收款
                        </Button>
                      )}
                    </div>
                  </ItemShell>
                );
              }

              if (sec.key === "closed") {
                return (
                  <ItemShell key={`closed-${item.workOrderId}`} item={item} showViewCase={false}>
                    <ReceivableSummary item={item} />
                    <p className="text-xs text-muted-foreground">
                      補助：{item.subsidyStatusLabel ?? "不適用補助"}
                      {" · "}
                      收款狀態：{item.paymentStatus ?? item.receivableStatusLabel ?? "—"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
                        <Link href={caseHref(item.workOrderId)}>查看案件</Link>
                      </Button>
                      {item.quoteId != null && (
                        <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
                          <Link href={`/quotes?focusId=${item.quoteId}`}>查看報價單</Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
                        <Link href={`/work-orders?highlight=${item.workOrderId}`}>查看派工單</Link>
                      </Button>
                      {item.subsidyType === "company_assisted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 sm:h-9"
                          onClick={() => setDocsModal(item)}
                        >
                          補助資料
                          {(item.customerDocumentCount ?? 0) > 0
                            ? `（${item.customerDocumentCount}）`
                            : ""}
                        </Button>
                      )}
                      {canOperate && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 sm:h-9 text-orange-700 border-orange-300"
                          disabled={reopenMut.isPending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "確定取消結案／重新開啟？收款紀錄與補助資料將保留。",
                              )
                            ) {
                              return;
                            }
                            reopenMut.mutate(item.workOrderId);
                          }}
                        >
                          取消結案／重新開啟
                        </Button>
                      )}
                    </div>
                  </ItemShell>
                );
              }

              // collection: overdue / today / soon / partial
              return (
                <ItemShell key={`${sec.key}-${item.workOrderId}`} item={item} showViewCase={false}>
                  <ReceivableSummary item={item} />
                  <CollectionActions item={item} />
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

      {/* 設定預計收款日 — 簡單 Modal */}
      <Dialog open={!!dueModal} onOpenChange={(o) => { if (!o) setDueModal(null); }}>
        <DialogContent className="max-w-sm w-[calc(100vw-1.5rem)]">
          <DialogHeader>
            <DialogTitle>設定預計收款日</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {dueModal && (
              <p className="text-xs text-muted-foreground">
                {dueModal.item.customerName} · {dueModal.item.workOrderNumber ?? `#${dueModal.item.workOrderId}`}
              </p>
            )}
            <div className="space-y-1">
              <Label>預計收款日</Label>
              <Input
                type="date"
                value={dueModal?.date ?? ""}
                onChange={(e) =>
                  setDueModal((m) => (m ? { ...m, date: e.target.value } : m))
                }
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDueModal(null)}>取消</Button>
            <Button
              disabled={dueMut.isPending || !dueModal?.date}
              onClick={() => {
                if (!dueModal?.date) return;
                dueMut.mutate({ id: dueModal.item.workOrderId, date: dueModal.date });
              }}
            >
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 登記收款 Modal */}
      <Dialog open={!!payModal} onOpenChange={(o) => { if (!o) setPayModal(null); }}>
        <DialogContent className="max-w-sm w-[calc(100vw-1.5rem)]">
          <DialogHeader>
            <DialogTitle>登記收款</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {payModal && (
              <>
                <ReceivableSummary item={payModal.item} />
                <div className="space-y-1">
                  <Label>本次收款金額</Label>
                  <Input
                    type="number"
                    value={payModal.amount}
                    onChange={(e) =>
                      setPayModal((m) => (m ? { ...m, amount: e.target.value } : m))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    不可超過未收金額 NT${money(payModal.item.unpaidAmount)}
                  </p>
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayModal(null)}>取消</Button>
            <Button
              disabled={payMut.isPending}
              onClick={() => {
                if (!payModal || !data) return;
                const unpaid = parseFloat(String(payModal.item.unpaidAmount ?? "0")) || 0;
                const amount = parseFloat(payModal.amount) || 0;
                if (!(amount > 0)) {
                  toast({ title: "請輸入收款金額", variant: "destructive" });
                  return;
                }
                if (amount > unpaid) {
                  toast({
                    title: "超過未收金額",
                    description: `最多可收 NT$${unpaid.toLocaleString("zh-TW")}`,
                    variant: "destructive",
                  });
                  return;
                }
                payMut.mutate({
                  id: payModal.item.workOrderId,
                  amount,
                  paymentDate: data.today,
                });
              }}
            >
              確認收款
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 客戶上傳／補助資料 */}
      <Dialog open={!!docsModal} onOpenChange={(o) => { if (!o) setDocsModal(null); }}>
        <DialogContent className="max-w-md w-[calc(100vw-1.5rem)]">
          <DialogHeader>
            <DialogTitle>客戶上傳／補助資料</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {docsModal && (
              <>
                <p className="text-xs text-muted-foreground">
                  {docsModal.customerName} · {docsModal.workOrderNumber ?? `#${docsModal.workOrderId}`}
                </p>
                <p className="text-xs">
                  補助狀態：{docsModal.subsidyStatusLabel ?? "—"}
                  {docsModal.uploadLinkToken ? (
                    <>
                      <br />
                      上傳代碼：<span className="font-mono">{docsModal.uploadLinkToken}</span>
                    </>
                  ) : null}
                </p>
                {(docsModal.customerDocuments?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    尚無客戶上傳紀錄
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {docsModal.customerDocuments!.map((d) => (
                      <li key={d.id} className="rounded-md border p-2">
                        <p className="font-medium">
                          {d.fileName || d.docType || "文件"} · {d.status}
                        </p>
                        {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                        {d.uploadedAt && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(d.uploadedAt).toLocaleString("zh-TW")}
                          </p>
                        )}
                        {d.fileUrl && (
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary underline"
                          >
                            開啟檔案
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocsModal(null)}>關閉</Button>
            {docsModal?.uploadLinkToken && (
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(subsidyUploadShareText(docsModal)).then(
                    () => toast({ title: "已複製分享內容" }),
                    () => toast({ title: "複製失敗", variant: "destructive" }),
                  );
                }}
              >
                複製上傳代碼
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
