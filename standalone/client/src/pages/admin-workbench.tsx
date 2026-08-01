import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, CheckCircle2, ChevronLeft, ClipboardList, Phone } from "lucide-react";
import { useAuth, hasRole } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type {
  AssistedProgram,
  SubsidyInvoiceKind,
  SubsidyPipelineStatus,
  SubsidyType,
} from "../../../shared/adminWorkflowConstants.ts";
import {
  SUBSIDY_DISPLAY_COLORS,
  type SubsidyDisplayStatus,
} from "../../../shared/subsidyDocs.ts";
import { openLineShareText } from "@/components/pdf/pdf-service";
import { getListReceivablesQueryKey } from "@workspace/api-client-react";
import {
  advanceAdminSubsidyPipeline,
  cancelAdminPaid,
  completeAdminClose,
  confirmAdminCompletion,
  confirmAdminSubsidyDocs,
  fetchAdminWorkbench,
  markAdminBilled,
  markAdminPaid,
  recordAdminPayment,
  reopenAdminClosed,
  setAdminExpectedPaymentDate,
  setAdminSubsidyInvoiceKind,
  setAdminSubsidyType,
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
  const lines = [
    "您好，我們是晟風工程。",
    "",
    "為協助您辦理補助，請點擊以下連結上傳所需資料：",
    "",
    url || "（尚未產生上傳網址）",
    "",
  ];
  if (item.invoiceKind === "triple") {
    lines.push("因本案件需開立公司三聯式發票，請填寫公司名稱及統一編號。");
    lines.push("");
  }
  lines.push("請依頁面提示完成上傳；若資料缺件，我們會再通知您，謝謝。");
  return lines.join("\n");
}

function subsidyMissingShareText(item: AdminWorkbenchItem): string {
  const url = absoluteUploadUrl(item);
  const missing =
    (item.missingDocLabels?.length ?? 0) > 0
      ? item.missingDocLabels!.join("、")
      : "必要文件";
  const lines = [
    "您好，目前補助資料尚缺：",
    "",
    missing,
    "",
  ];
  if (item.invoiceKind === "triple") {
    lines.push("因本案件需開立公司三聯式發票，請填寫公司名稱及統一編號。");
    lines.push("");
  }
  lines.push("請點擊原上傳連結補上資料，謝謝。");
  if (url) lines.push("", url);
  return lines.join("\n");
}

function SubsidyBadge({ item }: { item: AdminWorkbenchItem }) {
  // Simplified: company_assisted open → 等待客戶上傳；applied → 補助完成
  if (item.subsidyType === "company_assisted") {
    if (item.subsidyPipelineStatus === "applied") {
      return (
        <Badge className="bg-emerald-200 text-emerald-900 border-0 font-normal">補助已完成</Badge>
      );
    }
    return (
      <Badge className="bg-blue-100 text-blue-700 border-0 font-normal">等待客戶上傳</Badge>
    );
  }
  const status = (item.subsidyDisplayStatus ?? "no_record") as SubsidyDisplayStatus;
  const color = SUBSIDY_DISPLAY_COLORS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <Badge className={`${color} border-0 font-normal`}>
      {item.subsidyStatusLabel ?? item.subsidyTypeLabel ?? "—"}
    </Badge>
  );
}

/** Handling-method tag — no binary 需補助／免補助. */
function SubsidyHandlingTag({
  item,
  onOpen,
}: {
  item: AdminWorkbenchItem;
  onOpen: () => void;
}) {
  const t = item.subsidyType;
  if (t === "pending_confirmation") {
    return (
      <button
        type="button"
        className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
        onClick={onOpen}
      >
        補助方式：待確認
      </button>
    );
  }
  if (t === "not_needed") {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
        不需申請
      </span>
    );
  }
  if (t === "customer_self_apply") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
        客戶自行申請
      </span>
    );
  }
  if (t === "company_assisted") {
    const prog = item.assistedProgramLabel ?? "公司協助";
    return (
      <button
        type="button"
        className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-800 hover:bg-blue-100"
        onClick={onOpen}
      >
        公司協助－{prog}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-gray-100 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
      尚無補助紀錄
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
        <div className="text-yellow-800">
          <p className="font-medium">檢查提示：</p>
          <ul className="list-disc pl-4">
            {item.aiTips!.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-workbench"],
    queryFn: fetchAdminWorkbench,
    enabled: !!user && canFinance,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-workbench"] });
    void qc.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
    void qc.invalidateQueries({ queryKey: ["/api/work-orders"] });
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
    onSuccess: (_data, vars) => {
      toast({
        title: vars.status === "applied" ? "已標記補助完成" : "補助狀態已更新",
        description: vars.status === "applied" ? "案件已從補助中心移除" : undefined,
      });
      invalidate();
    },
    onError: onErr,
  });

  const subsidyTypeMut = useMutation({
    mutationFn: (p: {
      id: number;
      subsidyType: SubsidyType;
      assistedProgram?: AssistedProgram | null;
    }) => setAdminSubsidyType(p.id, p.subsidyType, { assistedProgram: p.assistedProgram }),
    onSuccess: () => {
      toast({ title: "補助方式已更新" });
      invalidate();
    },
    onError: onErr,
  });

  const invoiceKindMut = useMutation({
    mutationFn: (p: { id: number; invoiceKind: SubsidyInvoiceKind }) =>
      setAdminSubsidyInvoiceKind(p.id, p.invoiceKind),
    onSuccess: (_d, vars) => {
      toast({
        title: "發票類型已更新",
        description: vars.invoiceKind === "triple" ? "三聯式（公司）" : "二聯式（個人）",
      });
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
    // 補助中心：僅「公司協助且尚未標記完成」＝需客戶提供資料
    const waitingSubsidyItems = [
      ...(s.subsidyLinkNotSent ?? []),
      ...(s.subsidyAwaitingUpload ?? []),
      ...(s.subsidyDocsIncomplete ?? []),
      ...(s.subsidyAwaitingManualReview ?? []),
      ...(s.subsidyDocsComplete ?? []),
      ...(s.subsidyPendingApply ?? []),
    ].filter(
      (it, idx, arr) =>
        it.subsidyType === "company_assisted" &&
        it.subsidyPipelineStatus !== "applied" &&
        arr.findIndex((x) => x.workOrderId === it.workOrderId) === idx,
    );
    const subsidyTodoCount = waitingSubsidyItems.length;
    return {
      collectionCount,
      subsidyTodoCount,
      collectionSections: [
        { key: "noDue", title: "未設定收款日", accent: "normal" as const, items: noDueItems, count: noDueCount },
        { key: "today", title: "今日到期", accent: "orange" as const, items: s.collectionToday, count: c.collectionToday ?? 0 },
        { key: "soon", title: "即將到期", accent: "normal" as const, items: s.collectionSoon, count: c.collectionSoon ?? 0 },
        { key: "overdue", title: "已逾期", accent: "red" as const, items: s.collectionOverdue, count: c.collectionOverdue ?? 0 },
      ],
      subsidySections: [
        {
          key: "subWait",
          title: "等待客戶上傳",
          accent: "normal" as const,
          items: waitingSubsidyItems,
          count: subsidyTodoCount,
        },
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
            <SubsidyHandlingTag
              item={item}
              onOpen={() => {
                if (item.subsidyType === "pending_confirmation") goPanel("subsidy");
                else if (item.subsidyType === "company_assisted") openSubsidyForItem(item);
                else goPanel("subsidy");
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
              <p className="text-xs text-muted-foreground col-span-2">
                若需客戶上傳補助資料，請在下方選擇「公司協助」方案（與收款並行）。
              </p>
            </div>
          )}
          {canOperate &&
            (item.subsidyType === "pending_confirmation" || item.virtualPendingConfirmation) && (
              <div className="space-y-2">
                <p className="text-xs font-medium">選擇補助方式</p>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                    onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "customer_self_apply" })}>
                    客戶自行申請
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                    onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "company_assisted", assistedProgram: "new_unit" })}>
                    公司協助－新機補助
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                    onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "company_assisted", assistedProgram: "trade_in" })}>
                    公司協助－舊換新補助
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                    onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "company_assisted", assistedProgram: "new_unit_and_trade_in" })}>
                    公司協助－新機＋舊換新
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                    onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "not_needed" })}>
                    不需申請
                  </Button>
                </div>
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
            <SubsidyHandlingTag item={item} onOpen={() => openSubsidyForItem(item)} />
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
      const missing =
        (item.missingDocLabels?.length ?? 0) > 0
          ? item.missingDocLabels!.join("、")
          : "尚無缺件（可提醒客戶上傳）";
      const shareReady = !!item.invoiceKind && !!item.uploadUrl;

      return (
        <div
          key={`${secKey}-${item.workOrderId}`}
          className="rounded-lg border p-3 space-y-2 text-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{item.customerName ?? "未命名客戶"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.workOrderNumber ?? `#${item.workOrderId}`}
              </p>
            </div>
            <Badge className="bg-blue-100 text-blue-700 border-0 font-normal">等待客戶上傳</Badge>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">發票類型</p>
            {canOperate ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={item.invoiceKind === "dual" ? "default" : "outline"}
                  className="h-10 sm:h-9"
                  disabled={invoiceKindMut.isPending}
                  onClick={() =>
                    invoiceKindMut.mutate({ id: item.workOrderId, invoiceKind: "dual" })
                  }
                >
                  二聯式（個人）
                </Button>
                <Button
                  size="sm"
                  variant={item.invoiceKind === "triple" ? "default" : "outline"}
                  className="h-10 sm:h-9"
                  disabled={invoiceKindMut.isPending}
                  onClick={() =>
                    invoiceKindMut.mutate({ id: item.workOrderId, invoiceKind: "triple" })
                  }
                >
                  三聯式（公司）
                </Button>
              </div>
            ) : (
              <p className="text-xs">{item.invoiceKindLabel ?? "尚未選擇"}</p>
            )}
            {!item.invoiceKind && (
              <p className="text-xs text-amber-800">請先選擇發票類型，再複製網址或 LINE 提醒</p>
            )}
          </div>
          <p className="text-xs">
            <span className="text-muted-foreground">缺少資料：</span>
            <span className={(item.missingDocLabels?.length ?? 0) > 0 ? "text-orange-800" : ""}>
              {missing}
            </span>
          </p>
          {canOperate && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
                <Link href={caseHref(item.workOrderId)}>查看案件</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9"
                disabled={!shareReady}
                onClick={() => {
                  const url = absoluteUploadUrl(item);
                  if (!url) return;
                  const text = subsidyUploadShareText(item);
                  void navigator.clipboard.writeText(
                    item.invoiceKind === "triple" ? text : url,
                  ).then(
                    () =>
                      toast({
                        title: "已複製",
                        description:
                          item.invoiceKind === "triple"
                            ? "已複製含三聯式提醒的分享內容"
                            : "已複製上傳網址",
                      }),
                    () => toast({ title: "複製失敗", variant: "destructive" }),
                  );
                }}
              >
                複製上傳網址
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9"
                disabled={!shareReady || subsidyPipeMut.isPending}
                onClick={() => {
                  const text =
                    (item.missingDocLabels?.length ?? 0) > 0
                      ? subsidyMissingShareText(item)
                      : subsidyUploadShareText(item);
                  const win = openLineShareText(text);
                  if (!win) {
                    void navigator.clipboard.writeText(text).then(() =>
                      toast({ title: "已複製分享內容", description: "請貼到 LINE 傳送" }),
                    );
                    return;
                  }
                  toast({ title: "已開啟 LINE 分享", description: "請選擇聊天室後送出" });
                  if (pipe === "link_not_sent") {
                    subsidyPipeMut.mutate({ id: item.workOrderId, status: "awaiting_upload" });
                  }
                }}
              >
                LINE 提醒補件
              </Button>
              <Button
                size="sm"
                className="h-10 sm:h-9 bg-green-700 hover:bg-green-800"
                disabled={subsidyPipeMut.isPending}
                onClick={() => {
                  if (!window.confirm("確定此案件的補助申請已完成？完成後將從補助中心移除。")) return;
                  subsidyPipeMut.mutate({ id: item.workOrderId, status: "applied" });
                }}
              >
                標記補助完成
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (secKey === "close") {
      const waitingSubsidy =
        item.subsidyType === "company_assisted" &&
        item.subsidyPipelineStatus !== "applied";
      return (
        <ItemShell key={`close-${item.workOrderId}`} item={item}>
          <ReceivableSummary item={item} />
          <div className="flex flex-wrap items-center gap-2">
            <SubsidyHandlingTag item={item} onOpen={() => openSubsidyForItem(item)} />
            <SubsidyBadge item={item} />
          </div>
          {waitingSubsidy ? (
            <p className="text-xs text-amber-800 font-medium">等待補助完成</p>
          ) : (
            <p className="text-xs text-green-700 font-medium">
              {item.canClose ? "可結案" : "已收款／待結案"}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canOperate && item.canClose && !waitingSubsidy && (
              <Button
                size="sm"
                className="h-10 sm:h-9"
                disabled={closeMut.isPending}
                onClick={() => closeMut.mutate(item.workOrderId)}
              >
                結案
              </Button>
            )}
            {canOperate && waitingSubsidy && (
              <Button size="sm" className="h-10 sm:h-9" disabled>
                等待補助完成
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
          <SubsidyHandlingTag
            item={item}
            onOpen={() => {
              if (item.subsidyType === "company_assisted") openSubsidyForItem(item);
              else goPanel("subsidy");
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
        {canOperate &&
          (item.subsidyType === "pending_confirmation" || item.virtualPendingConfirmation) && (
            <div className="space-y-2 border-t pt-2">
              <p className="text-xs font-medium">選擇補助方式</p>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                  onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "customer_self_apply" })}>
                  客戶自行申請
                </Button>
                <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                  onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "company_assisted", assistedProgram: "new_unit" })}>
                  公司協助－新機補助
                </Button>
                <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                  onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "company_assisted", assistedProgram: "trade_in" })}>
                  公司協助－舊換新補助
                </Button>
                <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                  onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "company_assisted", assistedProgram: "new_unit_and_trade_in" })}>
                  公司協助－新機＋舊換新
                </Button>
                <Button size="sm" variant="outline" className="h-10 justify-start" disabled={subsidyTypeMut.isPending}
                  onClick={() => subsidyTypeMut.mutate({ id: item.workOrderId, subsidyType: "not_needed" })}>
                  不需申請
                </Button>
              </div>
            </div>
          )}
        {item.subsidyType === "company_assisted" && item.subsidyPipelineStatus !== "applied" && (
          <Button size="sm" variant="ghost" className="h-10 sm:h-9" onClick={() => goPanel("subsidy")}>
            開啟補助中心
          </Button>
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
              : "僅列出需客戶上傳補助資料的案件；完成後請至案件頁標記補助完成"}
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
            count={hubs.subsidyTodoCount}
            onClick={() => goPanel("subsidy")}
            hint="等待客戶上傳補助資料"
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
            <DialogTitle>查看客戶資料</DialogTitle>
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
                        {d.uploadedAt && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(d.uploadedAt).toLocaleString("zh-TW")}
                          </p>
                        )}
                        {d.fileUrl?.startsWith("data:image/") && (
                          <img
                            src={d.fileUrl}
                            alt={d.docTypeLabel || "預覽"}
                            className="mt-1 max-h-32 rounded border object-contain"
                          />
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
                    onClick={() => {
                      if (!window.confirm("確認補助資料齊全可用？")) return;
                      subsidyConfirmMut.mutate(docsModal.workOrderId);
                    }}
                  >
                    人工確認資料完整
                  </Button>
                )}
                {canOperate &&
                  (docsModal.missingDocLabels?.length ?? 0) > 0 &&
                  docsModal.uploadUrl && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const text = subsidyMissingShareText(docsModal);
                        const win = openLineShareText(text);
                        if (!win) {
                          void navigator.clipboard.writeText(text);
                          toast({ title: "已複製補件訊息" });
                        }
                      }}
                    >
                      LINE 提醒補件
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
                複製網址
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
