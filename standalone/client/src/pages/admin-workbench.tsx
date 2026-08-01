import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Phone } from "lucide-react";
import { useAuth, hasRole } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { SubsidyInvoiceKind } from "../../../shared/adminWorkflowConstants.ts";
import { openLineShareText } from "@/components/pdf/pdf-service";
import { getListReceivablesQueryKey } from "@workspace/api-client-react";
import {
  advanceAdminSubsidyPipeline,
  cancelAdminPaid,
  fetchAdminWorkbench,
  markAdminPaid,
  reopenAdminClosed,
  setAdminSubsidyInvoiceKind,
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

function Section({
  title,
  count,
  accent = "normal",
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
        : "";
  return (
    <Card className={border}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-left flex-1"
            onClick={() => collapsible && setOpen((v) => !v)}
          >
            {title}
          </button>
          <Badge variant="secondary">{count}</Badge>
        </CardTitle>
      </CardHeader>
      {(!collapsible || open) && (
        <CardContent className="space-y-3">{children}</CardContent>
      )}
    </Card>
  );
}

/** 金額摘要 — 不顯示收款日 */
function AmountSummary({ item }: { item: AdminWorkbenchItem }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-xs">
      <p>應收金額：NT${money(item.totalAmount)}</p>
      <p>已收金額：NT${money(item.receivedAmount)}</p>
      <p>未收金額：NT${money(item.unpaidAmount)}</p>
      <p>
        <span className="text-muted-foreground">收款狀態：</span>
        {item.receivableStatusLabel ?? item.paymentStatus ?? "—"}
      </p>
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

/**
 * LINE「通知客戶」訊息模板。日後要改文案改這裡即可。
 *
 * 依案件狀況自動切換兩種版本：
 * - 尚未上傳任何資料 → 第一次補助資料上傳通知
 * - 已上傳但仍有缺件 → 提醒補件，並列出實際缺少的資料
 *
 * 三聯式（invoiceKind === "triple"）才會加上公司名稱與統一編號提醒。
 */
function subsidyLineNotifyText(item: AdminWorkbenchItem): string {
  const uploadUrl = absoluteUploadUrl(item) || "（尚未產生上傳網址）";
  const firstTime = (item.uploadedDocCount ?? item.customerDocumentCount ?? 0) === 0;
  const missingDocuments =
    (item.missingDocLabels?.length ?? 0) > 0
      ? item.missingDocLabels!.map((label) => `• ${label}`).join("\n")
      : "• （目前系統未標示缺件，請依上傳頁提示確認）";

  const lines = [
    "您好 😊",
    "",
    "我是【晟風工程小秘書】。",
    "",
    "感謝您選擇晟風工程，您的冷氣安裝案件已順利完工！🎉",
    "",
    "接下來需要麻煩您協助我們完成最後一個步驟。",
    "",
    "請將以下資料補齊，方便我們協助您辦理政府冷氣補助。",
    "",
    firstTime ? "📋 需要準備的資料：" : "📋 目前尚缺資料：",
    "",
    missingDocuments,
    "",
  ];

  if (item.invoiceKind === "triple") {
    lines.push(
      "若需開立公司三聯式發票，請一併填寫：",
      "• 公司名稱",
      "• 統一編號",
      "",
    );
  }

  lines.push(
    "🔗 請點擊下方連結完成資料填寫與上傳：",
    "",
    uploadUrl,
    "",
    "如有任何問題，歡迎隨時與我們聯繫，我們將竭誠為您服務。",
    "",
    "感謝您的支持與配合，祝您順心愉快！😊",
  );

  return lines.join("\n");
}

/**
 * 補助狀態 — 只有「補助已完成」看 pipeline_status，
 * 其餘依實際上傳份數與缺件清單判斷。
 */
function SubsidyBadge({ item }: { item: AdminWorkbenchItem }) {
  if (item.subsidyPipelineStatus === "applied") {
    return (
      <Badge className="bg-emerald-200 text-emerald-900 border-0 font-normal">補助已完成</Badge>
    );
  }
  if (!item.invoiceKind) {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-0 font-normal">待選發票類型</Badge>
    );
  }
  if ((item.uploadedDocCount ?? item.customerDocumentCount ?? 0) <= 0) {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-0 font-normal">
        等待客戶上傳補助資料
      </Badge>
    );
  }
  if (
    (item.missingDocLabels?.length ?? 0) > 0 ||
    (item.missingBuyerLabels?.length ?? 0) > 0
  ) {
    return (
      <Badge className="bg-orange-100 text-orange-800 border-0 font-normal">客戶資料待補件</Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-800 border-0 font-normal">
      補助資料已齊，可進行申請
    </Badge>
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

  const subsidyPipeMut = useMutation({
    mutationFn: (p: { id: number; status: "awaiting_upload" | "applied"; note?: string }) =>
      advanceAdminSubsidyPipeline(p.id, p.status, p.note),
    onSuccess: (_data, vars) => {
      toast({
        title: vars.status === "applied" ? "已標記補助完成" : "補助狀態已更新",
        description:
          vars.status === "applied" ? "若已收款，系統會自動結案" : undefined,
      });
      invalidate();
    },
    onError: onErr,
  });

  const invoiceKindMut = useMutation({
    mutationFn: (p: { id: number; invoiceKind: SubsidyInvoiceKind }) =>
      setAdminSubsidyInvoiceKind(p.id, p.invoiceKind),
    onSuccess: (_d, vars) => {
      toast({
        title: "發票類型已設定",
        description:
          vars.invoiceKind === "triple"
            ? "三聯式（公司）· 已產生補助上傳網址"
            : "二聯式（個人）· 已產生補助上傳網址",
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
      toast({
        title: "已取消已收款",
        description: "若案件已結案會一併解除，並回到未收款",
      });
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

  function renderOpenCard(item: AdminWorkbenchItem) {
    const phone = item.mobilePhone || item.telephone;
    const subsidyDone = item.subsidyPipelineStatus === "applied";
    const shareReady = !!item.invoiceKind && !!item.uploadUrl;
    const missing = [...(item.missingDocLabels ?? []), ...(item.missingBuyerLabels ?? [])];
    const uploadedCount = item.uploadedDocCount ?? item.customerDocumentCount ?? 0;
    const isPaid = item.receivableStatus === "paid";
    const canMarkSubsidy = item.canMarkApplied !== false;

    function notifyViaLine() {
      const text = subsidyLineNotifyText(item);
      const win = openLineShareText(text);
      if (!win) {
        void navigator.clipboard.writeText(text).then(() =>
          toast({ title: "已複製通知內容", description: "請貼到 LINE 傳送" }),
        );
        return;
      }
      toast({ title: "已開啟 LINE 分享", description: "請選擇聊天室後送出" });
      if (item.subsidyPipelineStatus === "link_not_sent") {
        subsidyPipeMut.mutate({ id: item.workOrderId, status: "awaiting_upload" });
      }
    }

    return (
      <ItemShell key={`open-${item.workOrderId}`} item={item}>
        <AmountSummary item={item} />
        {item.receivableId == null && (
          <p className="text-xs text-amber-800">
            尚未建立應收帳款（案件可能未綁定客戶），請至應收帳款頁確認後再標記已收款
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">補助狀態：</span>
          <SubsidyBadge item={item} />
        </div>
        {!subsidyDone && missing.length > 0 && (
          <p className="text-xs text-orange-800">
            尚缺：{missing.join("、")}（可按「查看案件」逐項檢視客戶補助資料）
          </p>
        )}
        {!subsidyDone && item.invoiceKind && uploadedCount > 0 && missing.length === 0 && (
          <p className="text-xs text-green-700">補助資料已齊，確認送件後請標記補助完成</p>
        )}
        {isPaid && !subsidyDone && (
          <p className="text-xs text-amber-800 font-medium">等待補助完成</p>
        )}

        {/* 發票類型 */}
        <div className="space-y-1">
          <p className="text-xs font-medium">發票類型</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={item.invoiceKind === "dual" ? "default" : "outline"}
              className="h-10 sm:h-9"
              disabled={!canOperate || invoiceKindMut.isPending || subsidyDone}
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
              disabled={!canOperate || invoiceKindMut.isPending || subsidyDone}
              onClick={() =>
                invoiceKindMut.mutate({ id: item.workOrderId, invoiceKind: "triple" })
              }
            >
              三聯式（公司）
            </Button>
          </div>
          {!item.invoiceKind && (
            <p className="text-xs text-amber-800">
              請先選擇發票類型，系統會依類型決定客戶需上傳的資料並產生上傳網址
            </p>
          )}
        </div>

        {/* 補助操作 — 選好發票類型後才出現 */}
        {canOperate && !subsidyDone && (
          <div className="flex flex-wrap gap-2">
            {shareReady && (
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9"
                disabled={subsidyPipeMut.isPending}
                onClick={notifyViaLine}
              >
                LINE 通知客戶
              </Button>
            )}
            <Button
              size="sm"
              className="h-10 sm:h-9 bg-green-700 hover:bg-green-800"
              disabled={subsidyPipeMut.isPending || !canMarkSubsidy}
              title={
                canMarkSubsidy
                  ? undefined
                  : "補助資料尚未齊全，請按「查看案件」檢視或人工確認資料完整"
              }
              onClick={() => {
                if (!window.confirm("確定此案件的補助申請已完成？已收款的話會自動結案。")) return;
                subsidyPipeMut.mutate({ id: item.workOrderId, status: "applied" });
              }}
            >
              標記補助完成
            </Button>
          </div>
        )}
        {canOperate && subsidyDone && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9 text-orange-700 border-orange-300"
              disabled={subsidyUnmarkMut.isPending}
              onClick={() => {
                if (!window.confirm("取消補助完成？附件不會刪除。")) return;
                subsidyUnmarkMut.mutate(item.workOrderId);
              }}
            >
              取消補助完成
            </Button>
          </div>
        )}

        {/* 收款操作 */}
        <div className="flex flex-wrap gap-2">
          {phone && (
            <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
              <a href={`tel:${phone}`}>
                <Phone className="h-3.5 w-3.5 mr-1" />
                聯絡客戶
              </a>
            </Button>
          )}
          {canOperate && !isPaid && (
            <Button
              size="sm"
              className="h-10 sm:h-9"
              disabled={markPaidMut.isPending || item.receivableId == null}
              onClick={() => markPaidMut.mutate(item.workOrderId)}
            >
              標記已收款
            </Button>
          )}
          {canOperate && isPaid && (
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

  function renderClosedCard(item: AdminWorkbenchItem) {
    return (
      <ItemShell key={`closed-${item.workOrderId}`} item={item} showViewCase={false}>
        <AmountSummary item={item} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">補助狀態：</span>
          <SubsidyBadge item={item} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="h-10 sm:h-9">
            <Link href={caseHref(item.workOrderId)}>查看案件</Link>
          </Button>
          {canOperate && (
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9 text-orange-700 border-orange-300"
              disabled={cancelPaidMut.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    "確定取消已收款？將自動解除結案並恢復為未收款，不會刪除派工單／報價單／施工資料。",
                  )
                )
                  return;
                cancelPaidMut.mutate(item.workOrderId);
              }}
            >
              取消已收款
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

  const s = data.sections;
  const c = data.counts;

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold tracking-tight">今日必做事項</h1>
        <p className="text-sm text-muted-foreground mt-1">
          行政每日工作台 · {data.today} · 未完成待辦 {c.openTodos ?? 0} 件
        </p>
      </div>

      <Section title="💰 未收款／待結案" count={c.pendingClose ?? 0}>
        {(s.pendingClose ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">目前無待辦</p>
        ) : (
          s.pendingClose.map(renderOpenCard)
        )}
      </Section>

      <Section
        title="📦 已結案"
        count={c.closed ?? 0}
        collapsible
        defaultOpen={(c.closed ?? 0) > 0}
      >
        {(s.closed ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">尚無已結案案件</p>
        ) : (
          s.closed.map(renderClosedCard)
        )}
      </Section>

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
