import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, CheckCircle2, ChevronLeft, ClipboardList, Phone } from "lucide-react";
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
  SUBSIDY_DISPLAY_COLORS,
  type SubsidyDisplayStatus,
} from "../../../shared/subsidyDocs.ts";
import { openLineShareText } from "@/components/pdf/pdf-service";
import { getListReceivablesQueryKey } from "@workspace/api-client-react";
import {
  advanceAdminSubsidyPipeline,
  approveAdminCloseOverride,
  cancelAdminPaid,
  completeAdminClose,
  confirmAdminCompletion,
  confirmAdminSubsidyDocs,
  fetchAdminWorkbench,
  markAdminBilled,
  markAdminPaid,
  recordAdminPayment,
  regenerateAdminSubsidyToken,
  reopenAdminClosed,
  setAdminExpectedPaymentDate,
  unmarkAdminSubsidyApplied,
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
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">收款狀態：</span>
        <span>{item.receivableStatusLabel ?? item.paymentStatus ?? "—"}</span>
        <span className="text-muted-foreground">｜</span>
        <span className="text-muted-foreground">補助狀態：</span>
        <SubsidyBadge item={item} />
      </div>
      <p>
        <span className="text-muted-foreground">可結案：</span>
        <span className={item.canClose ? "text-green-700" : "text-amber-700"}>
          {item.canClose ? "是" : "否"}
        </span>
      </p>
    </div>
  );
}

type WorkbenchPanel = "home" | "collection" | "subsidy";

function HubCard({
  title,
  count,
  accent,
  onClick,
  hint,
}: {
  title: string;
  count: number;
  accent?: "red" | "orange" | "normal";
  onClick: () => void;
  hint?: string;
}) {
  const border =
    accent === "red"
      ? "border-red-300"
      : accent === "orange"
        ? "border-orange-300"
        : "border-border";
  return (
    <button type="button" onClick={onClick} className="w-full text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className={`${border} hover:bg-muted/30 transition-colors`}>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={count > 0 ? "default" : "secondary"}>{count}</Badge>
        </CardHeader>
        {hint ? (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">{hint}</p>
          </CardContent>
        ) : null}
      </Card>
    </button>
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

function absoluteUploadUrl(item: AdminWorkbenchItem): string | null {
  const path = item.uploadUrl?.trim();
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function subsidyUploadShareText(item: AdminWorkbenchItem): string {
  const url = absoluteUploadUrl(item);
  const caseNo = item.workOrderNumber ?? `#${item.workOrderId}`;
  const lines = [
    "【晟風工程】補助資料上傳",
    `客戶：${item.customerName ?? "—"}`,
    `案件：${caseNo}`,
  ];
  if (url) {
    lines.push(`請點此上傳（無需登入）：`);
    lines.push(url);
  }
  return lines.join("\n");
}

function SubsidyBadge({ item }: { item: AdminWorkbenchItem }) {
  const status = (item.subsidyDisplayStatus ?? "not_applicable") as SubsidyDisplayStatus;
  const color = SUBSIDY_DISPLAY_COLORS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <Badge className={`${color} border-0 font-normal`}>
      {item.subsidyStatusLabel ?? "—"}
    </Badge>
  );
}

/** Tag only — opens subsidy center / docs; does not change process. */
function SubsidyNeedTag({
  item,
  onNeedSubsidy,
}: {
  item: AdminWorkbenchItem;
  onNeedSubsidy: () => void;
}) {
  const needs = item.needsSubsidy === true || item.subsidyType === "company_assisted";
  if (needs) {
    return (
      <button
        type="button"
        className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-100"
        onClick={onNeedSubsidy}
        title="開啟補助中心／查看補助資料"
      >
        🟢【需補助】
      </button>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
      ⚪【免補助】
    </span>
  );
}

function SubsidyMetaLines({ item }: { item: AdminWorkbenchItem }) {
  return (
    <div className="text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <SubsidyBadge item={item} />
        {item.subsidyDisplayStatus === "docs_complete" && (
          <span className="text-green-700">可進行補助申請</span>
        )}
        {item.canCloseReady && item.subsidyType === "company_assisted" && item.subsidyPipelineStatus === "applied" && (
          <span className="text-emerald-800 font-medium">可結案</span>
        )}
      </div>
      <p>
        已上傳 {item.uploadedDocCount ?? item.customerDocumentCount ?? 0} 份
        {item.lastUploadAt
          ? ` · 最後上傳 ${new Date(item.lastUploadAt).toLocaleString("zh-TW")}`
          : ""}
      </p>
      {(item.missingDocLabels?.length ?? 0) > 0 && (
        <p className="text-orange-800">缺少：{item.missingDocLabels!.join("、")}</p>
      )}
      {(item.aiTips?.length ?? 0) > 0 && (
        <ul className="text-yellow-800 list-disc pl-4">
          {item.aiTips!.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {item.appliedAt && (
        <p className="text-emerald-900">
          完成時間：{new Date(item.appliedAt).toLocaleString("zh-TW")}
          {item.appliedBy != null ? ` · 操作人 #${item.appliedBy}` : ""}
        </p>
      )}
    </div>
  );
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
  const [path, navigate] = useLocation();
  const search = useSearch();
  const panelParam = new URLSearchParams(search).get("panel");
  const panel: WorkbenchPanel =
    panelParam === "collection" || panelParam === "subsidy" ? panelParam : "home";
  const basePath = path.startsWith("/admin-workbench") ? "/admin-workbench" : "/";
  const goPanel = (p: WorkbenchPanel) => {
    if (p === "home") navigate(basePath);
    else navigate(`${basePath}?panel=${p}`);
  };

  const canOperate = hasRole(user, "super_admin", "owner", "admin");
  const canFinance = canOperate || hasRole(user, "accountant");
  const canOverride = hasRole(user, "super_admin", "owner");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-workbench"],
    queryFn: fetchAdminWorkbench,
    enabled: !!user && canFinance,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-workbench"] });
    void qc.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
  };
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
    mutationFn: (p: { id: number; status: SubsidyPipelineStatus; note?: string }) =>
      advanceAdminSubsidyPipeline(p.id, p.status, p.note),
    onSuccess: () => {
      toast({ title: "補助狀態已更新" });
      invalidate();
    },
    onError: onErr,
  });

  const subsidyUnmarkMut = useMutation({
    mutationFn: (id: number) => unmarkAdminSubsidyApplied(id),
    onSuccess: () => {
      toast({ title: "已取消補助完成", description: "附件與操作紀錄均保留" });
      invalidate();
    },
    onError: onErr,
  });

  const subsidyConfirmMut = useMutation({
    mutationFn: (id: number) => confirmAdminSubsidyDocs(id),
    onSuccess: () => {
      toast({ title: "已人工確認補助資料齊全" });
      invalidate();
    },
    onError: onErr,
  });

  const subsidyRegenMut = useMutation({
    mutationFn: (p: { id: number; force?: boolean }) =>
      regenerateAdminSubsidyToken(p.id, !!p.force),
    onSuccess: (data) => {
      toast({
        title: data.regenerated ? "已重新產生上傳網址" : "目前網址仍有效",
        description: data.uploadUrl,
      });
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

  const hubs = useMemo(() => {
    if (!data) return null;
    const s = data.sections;
    const c = data.counts;
    // 未設定收款日：含尚未建檔／草稿應收（首頁不另開「待建立」分類）
    const noDueItems = [...(s.pendingCreateReceivable ?? []), ...(s.noDueDate ?? [])];
    const noDueCount = (c.pendingCreateReceivable ?? 0) + (c.noDueDate ?? 0);
    const collectionCount =
      noDueCount +
      (c.collectionOverdue ?? 0) +
      (c.collectionToday ?? 0) +
      (c.collectionSoon ?? 0);
    const docsCompleteItems = [
      ...(s.subsidyDocsComplete ?? []),
      ...(s.subsidyPendingApply ?? []),
    ];
    const docsCompleteCount =
      (c.subsidyDocsComplete ?? 0) + (c.subsidyPendingApply ?? 0);
    const subsidyCount =
      (c.subsidyLinkNotSent ?? 0) +
      (c.subsidyAwaitingUpload ?? 0) +
      (c.subsidyDocsIncomplete ?? 0) +
      (c.subsidyAwaitingManualReview ?? 0) +
      docsCompleteCount +
      (c.subsidyApplied ?? 0);
    return {
      collectionCount,
      subsidyCount,
      collectionSections: [
        { key: "noDue", title: "未設定收款日", accent: "normal" as const, items: noDueItems, count: noDueCount },
        { key: "today", title: "今日到期", accent: "orange" as const, items: s.collectionToday, count: c.collectionToday ?? 0 },
        { key: "soon", title: "即將到期", accent: "normal" as const, items: s.collectionSoon, count: c.collectionSoon ?? 0 },
        { key: "overdue", title: "已逾期", accent: "red" as const, items: s.collectionOverdue, count: c.collectionOverdue ?? 0 },
      ],
      subsidySections: [
        { key: "subLink", title: "待傳送補助資料連結", accent: "normal" as const, items: s.subsidyLinkNotSent, count: c.subsidyLinkNotSent ?? 0 },
        { key: "subWait", title: "等待客戶上傳", accent: "normal" as const, items: s.subsidyAwaitingUpload, count: c.subsidyAwaitingUpload ?? 0 },
        { key: "subInc", title: "客戶資料待補件", accent: "orange" as const, items: s.subsidyDocsIncomplete, count: c.subsidyDocsIncomplete ?? 0 },
        {
          key: "subManual",
          title: "等待人工確認",
          accent: "orange" as const,
          items: s.subsidyAwaitingManualReview ?? [],
          count: c.subsidyAwaitingManualReview ?? 0,
        },
        { key: "subOk", title: "補助資料完整", accent: "normal" as const, items: docsCompleteItems, count: docsCompleteCount },
        { key: "subDone", title: "補助已完成", accent: "normal" as const, items: s.subsidyApplied ?? [], count: c.subsidyApplied ?? 0 },
      ],
      homeSections: [
        { key: "confirm", title: "📋 待確認施工資料", accent: "normal" as const, items: s.pendingConstructionConfirm, count: c.pendingConstructionConfirm ?? 0 },
        { key: "partial", title: "💳 部分收款", accent: "normal" as const, items: s.collectionPartial, count: c.collectionPartial ?? 0 },
        { key: "close", title: "✅ 已收款／待結案", accent: "normal" as const, items: s.pendingClose, count: c.pendingClose ?? 0 },
        { key: "closed", title: "📦 已結案", accent: "normal" as const, items: s.closed, count: c.closed ?? 0 },
      ],
    };
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

  function openSubsidyForItem(item: AdminWorkbenchItem) {
    setDocsModal(item);
  }

  function renderCreateArCard(item: AdminWorkbenchItem) {
      const draft = draftFor(item);
      const preview = finalPreview(draft, item);
      return (
        <ItemShell key={`createAr-${item.workOrderId}`} item={item} showViewCase>
          <div className="flex flex-wrap items-center gap-2">
            <SubsidyNeedTag
              item={item}
              onNeedSubsidy={() => {
                if (item.needsSubsidy || item.subsidyType === "company_assisted") {
                  openSubsidyForItem(item);
                } else {
                  goPanel("subsidy");
                }
              }}
            />
          </div>
          <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
            <p>原報價／成交金額：NT${money(item.quoteOriginalAmount)}</p>
            <p className="font-medium text-foreground">
              最終應收金額：NT${preview.toLocaleString("zh-TW")}
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
                      [item.workOrderId]: { ...draft, extra, finalAmount: String(nextFinal || "") },
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
                      [item.workOrderId]: { ...draft, discount, finalAmount: String(nextFinal || "") },
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
                  toast({ title: "請確認最終應收金額", description: "金額必須大於 0", variant: "destructive" });
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

  function renderItem(secKey: string, item: AdminWorkbenchItem) {
    if (secKey === "confirm") {
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
          <div className="flex flex-wrap items-center gap-2">
            <SubsidyNeedTag item={item} onNeedSubsidy={() => openSubsidyForItem(item)} />
            <SubsidyBadge item={item} />
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

    // 未設定收款日內可能含尚未有 receivableId 的草稿建檔案
    if (secKey === "noDue" && item.receivableId == null) {
      return renderCreateArCard(item);
    }

    if (secKey.startsWith("sub")) {
      const pipe = item.subsidyPipelineStatus ?? "link_not_sent";
      const display = item.subsidyDisplayStatus;
      const paid = item.receivableStatus === "paid";
      const phone = item.mobilePhone || item.telephone || "—";
      return (
        <ItemShell key={`${secKey}-${item.workOrderId}`} item={item}>
          <p className="text-xs text-muted-foreground">電話：{phone}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SubsidyNeedTag item={item} onNeedSubsidy={() => openSubsidyForItem(item)} />
            <span className="text-muted-foreground">收款狀態：</span>
            <span>{item.receivableStatusLabel ?? item.paymentStatus ?? "—"}</span>
          </div>
          <SubsidyMetaLines item={item} />
          {paid && pipe !== "applied" && (
            <p className="text-xs text-green-700">已收款 — 請完成補助流程後再結案</p>
          )}
          {canOperate && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
                <Link href={caseHref(item.workOrderId)}>查看案件</Link>
              </Button>
              <Button size="sm" variant="outline" className="h-10 sm:h-9" onClick={() => setDocsModal(item)}>
                查看補助資料
                {(item.uploadedDocCount ?? 0) > 0 ? `（${item.uploadedDocCount}）` : ""}
              </Button>
              {item.uploadUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 sm:h-9"
                  onClick={() => {
                    const url = absoluteUploadUrl(item);
                    if (!url) return;
                    void navigator.clipboard.writeText(url).then(
                      () => toast({ title: "已複製上傳網址" }),
                      () => toast({ title: "複製失敗", variant: "destructive" }),
                    );
                  }}
                >
                  複製上傳網址
                </Button>
              )}
              {item.uploadUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 sm:h-9"
                  onClick={() => {
                    const text = subsidyUploadShareText(item);
                    const win = openLineShareText(text);
                    if (!win) {
                      void navigator.clipboard.writeText(text).then(() =>
                        toast({ title: "已複製分享內容", description: "請貼到 LINE 傳送給客戶" }),
                      );
                    }
                    if (pipe === "link_not_sent") {
                      subsidyPipeMut.mutate({ id: item.workOrderId, status: "awaiting_upload" });
                    }
                  }}
                >
                  LINE 傳送上傳網址
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
                          void navigator.clipboard.writeText(subsidyUploadShareText(item));
                          toast({ title: "已標記等待客戶上傳", description: "上傳網址已複製，可貼到 LINE" });
                        },
                      },
                    );
                  }}
                >
                  標記已傳送網址
                </Button>
              )}
              {display === "awaiting_manual_review" && (
                <Button
                  size="sm"
                  className="h-10 sm:h-9 bg-yellow-600 hover:bg-yellow-700"
                  disabled={subsidyConfirmMut.isPending}
                  onClick={() => {
                    if (!window.confirm("確認補助資料齊全可用？確認後將標為「補助資料完整」。")) return;
                    subsidyConfirmMut.mutate(item.workOrderId);
                  }}
                >
                  人工確認資料齊全
                </Button>
              )}
              {(display === "docs_complete" || pipe === "pending_apply") && pipe !== "applied" && (
                <Button
                  size="sm"
                  className="h-10 sm:h-9 bg-green-700 hover:bg-green-800"
                  disabled={subsidyPipeMut.isPending}
                  onClick={() => {
                    if (!window.confirm("確定此案件已完成補助申請？確認後將同步更新應收帳款頁。")) return;
                    const remark = window.prompt("備註（選填）") ?? undefined;
                    subsidyPipeMut.mutate({
                      id: item.workOrderId,
                      status: "applied",
                      note: remark?.trim() || undefined,
                    });
                  }}
                >
                  補助申請已完成
                </Button>
              )}
              {pipe === "applied" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 sm:h-9 text-orange-700 border-orange-300"
                  disabled={subsidyUnmarkMut.isPending}
                  onClick={() => {
                    if (!window.confirm("取消補助完成／重新開啟？附件與完成紀錄會保留在操作日誌。")) return;
                    subsidyUnmarkMut.mutate(item.workOrderId);
                  }}
                >
                  取消補助完成／重新開啟
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-10 sm:h-9"
                disabled={subsidyRegenMut.isPending}
                onClick={() => {
                  if (!window.confirm("僅在網址失效時重新產生。確定重新產生上傳網址？")) return;
                  subsidyRegenMut.mutate({ id: item.workOrderId, force: true });
                }}
              >
                重新產生網址
              </Button>
            </div>
          )}
        </ItemShell>
      );
    }

    if (secKey === "close") {
      return (
        <ItemShell key={`close-${item.workOrderId}`} item={item}>
          <ReceivableSummary item={item} />
          <div className="flex flex-wrap items-center gap-2">
            <SubsidyNeedTag item={item} onNeedSubsidy={() => openSubsidyForItem(item)} />
            <SubsidyBadge item={item} />
          </div>
          <p className="text-xs text-green-700 font-medium">
            {item.canCloseReady ? "可結案" : "已收款／待結案"}
          </p>
          {item.subsidyType === "company_assisted" &&
            item.subsidyPipelineStatus !== "applied" &&
            !item.closeOverrideAt && (
              <p className="text-xs text-amber-800">需完成補助申請後才可結案（或由負責人核准先結案）</p>
            )}
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
                  if (!window.confirm("確定取消已收款？將恢復為未收款，不會刪除派工單／報價單／施工資料。")) return;
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

    if (secKey === "closed") {
      return (
        <ItemShell key={`closed-${item.workOrderId}`} item={item} showViewCase={false}>
          <ReceivableSummary item={item} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">收款狀態：</span>
            <span>{item.paymentStatus ?? item.receivableStatusLabel ?? "—"}</span>
            <span className="text-muted-foreground">｜補助狀態：</span>
            <SubsidyBadge item={item} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
              <Link href={caseHref(item.workOrderId)}>查看案件</Link>
            </Button>
            {item.subsidyType === "company_assisted" && (
              <Button size="sm" variant="outline" className="h-10 sm:h-9" onClick={() => setDocsModal(item)}>
                查看補助資料
              </Button>
            )}
            {canOperate && (
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9 text-orange-700 border-orange-300"
                disabled={reopenMut.isPending}
                onClick={() => {
                  if (!window.confirm("確定取消結案／重新開啟？收款紀錄與補助資料將保留。")) return;
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

    // collection / partial
    const phone = item.mobilePhone || item.telephone || "—";
    return (
      <ItemShell key={`${secKey}-${item.workOrderId}`} item={item} showViewCase={false}>
        <ReceivableSummary item={item} />
        <p className="text-xs text-muted-foreground">電話：{phone}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SubsidyNeedTag
            item={item}
            onNeedSubsidy={() => {
              if (item.needsSubsidy || item.subsidyType === "company_assisted") {
                openSubsidyForItem(item);
              } else {
                goPanel("subsidy");
              }
            }}
          />
          <span className="text-muted-foreground">收款狀態：</span>
          <span>{item.receivableStatusLabel ?? item.paymentStatus ?? "—"}</span>
          <span className="text-muted-foreground">｜補助狀態：</span>
          <SubsidyBadge item={item} />
        </div>
        {(item.aiTips?.length ?? 0) > 0 && (
          <ul className="text-xs text-yellow-800 list-disc pl-4">
            {item.aiTips!.slice(0, 3).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {(item.missingDocLabels?.length ?? 0) > 0 && (
          <p className="text-xs text-orange-800">缺少：{item.missingDocLabels!.join("、")}</p>
        )}
        <CollectionActions item={item} />
        {(item.needsSubsidy || item.subsidyType === "company_assisted") && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-10 sm:h-9" onClick={() => openSubsidyForItem(item)}>
              查看補助資料
            </Button>
            {item.uploadUrl && (
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => {
                  const url = absoluteUploadUrl(item);
                  if (!url) return;
                  void navigator.clipboard.writeText(url).then(() => toast({ title: "已複製上傳網址" }));
                }}
              >
                複製上傳網址
              </Button>
            )}
            {item.uploadUrl && (
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => {
                  const text = subsidyUploadShareText(item);
                  const win = openLineShareText(text);
                  if (!win) void navigator.clipboard.writeText(text);
                }}
              >
                LINE 分享
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-10 sm:h-9" onClick={() => goPanel("subsidy")}>
              開啟補助中心
            </Button>
          </div>
        )}
      </ItemShell>
    );
  }

  function renderSections(
    sections: Array<{
      key: string;
      title: string;
      accent: "red" | "orange" | "normal";
      items: AdminWorkbenchItem[];
      count: number;
    }>,
  ) {
    return sections.map((sec) => (
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
          sec.items.map((item) => renderItem(sec.key, item))
        )}
      </Section>
    ));
  }

  if (!hubs) return null;

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-12">
      <div>
        {panel !== "home" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 h-8 px-2"
            onClick={() => goPanel("home")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回行政首頁
          </Button>
        ) : null}
        <h1 className="text-xl font-bold tracking-tight">
          {panel === "collection" ? "💰 待收款" : panel === "subsidy" ? "📄 補助中心" : "今日必做事項"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {panel === "home"
            ? `行政每日工作台 · ${data.today} · 未完成待辦 ${data.counts.openTodos ?? 0} 件`
            : panel === "collection"
              ? "依收款日分類處理；與補助流程並行"
              : "與應收帳款共用同一補助狀態；施工完成即可開始"}
        </p>
      </div>

      {panel === "home" && (data.alerts.hasOverdue || data.alerts.hasDueToday) && (
        <div className="space-y-2">
          {data.alerts.hasOverdue && (
            <button
              type="button"
              className="w-full text-left rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
              onClick={() => goPanel("collection")}
            >
              有 {data.alerts.overdueCount} 件逾期收款，點此進入待收款
            </button>
          )}
          {data.alerts.hasDueToday && (
            <button
              type="button"
              className="w-full text-left rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900"
              onClick={() => goPanel("collection")}
            >
              今日有 {data.alerts.dueTodayCount} 件到期收款，點此進入待收款
            </button>
          )}
        </div>
      )}

      {panel === "home" && (
        <>
          {renderSections(hubs.homeSections.filter((s) => s.key === "confirm"))}
          <HubCard
            title="💰 待收款"
            count={hubs.collectionCount}
            accent={data.alerts.hasOverdue ? "red" : data.alerts.hasDueToday ? "orange" : "normal"}
            onClick={() => goPanel("collection")}
            hint="未設定收款日／今日到期／即將到期／已逾期"
          />
          {renderSections(hubs.homeSections.filter((s) => s.key === "partial"))}
          <HubCard
            title="📄 補助中心"
            count={hubs.subsidyCount}
            onClick={() => goPanel("subsidy")}
            hint="點擊進入補助中心"
          />
          {renderSections(hubs.homeSections.filter((s) => s.key === "close" || s.key === "closed"))}
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
        </>
      )}

      {panel === "collection" && renderSections(hubs.collectionSections)}
      {panel === "subsidy" && renderSections(hubs.subsidySections)}

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
                <SubsidyMetaLines item={docsModal} />
                {docsModal.uploadUrl && (
                  <p className="text-xs break-all text-muted-foreground">
                    上傳網址：{absoluteUploadUrl(docsModal)}
                  </p>
                )}
                {(docsModal.customerDocuments?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    尚無客戶上傳紀錄
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {docsModal.customerDocuments!.map((d) => (
                      <li key={d.id} className="rounded-md border p-2">
                        <p className="font-medium">
                          {d.docTypeLabel || d.fileName || d.docType || "文件"} · {d.status}
                        </p>
                        {d.fileName && (
                          <p className="text-xs text-muted-foreground">{d.fileName}</p>
                        )}
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
                            預覽／下載
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {docsModal.needsManualReview && canOperate && (
                  <Button
                    className="w-full"
                    disabled={subsidyConfirmMut.isPending}
                    onClick={() => subsidyConfirmMut.mutate(docsModal.workOrderId)}
                  >
                    人工確認資料齊全
                  </Button>
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocsModal(null)}>關閉</Button>
            {docsModal?.uploadUrl && (
              <Button
                onClick={() => {
                  const url = absoluteUploadUrl(docsModal);
                  if (!url) return;
                  void navigator.clipboard.writeText(url).then(
                    () => toast({ title: "已複製上傳網址" }),
                    () => toast({ title: "複製失敗", variant: "destructive" }),
                  );
                }}
              >
                複製上傳網址
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
