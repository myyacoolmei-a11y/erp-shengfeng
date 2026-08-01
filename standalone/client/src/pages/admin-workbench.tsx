import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Phone } from "lucide-react";
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
import type { SubsidyInvoiceKind } from "../../../shared/adminWorkflowConstants.ts";
import { openLineShareText } from "@/components/pdf/pdf-service";
import { getListReceivablesQueryKey } from "@workspace/api-client-react";
import {
  advanceAdminSubsidyPipeline,
  cancelAdminPaid,
  confirmAdminCompletion,
  confirmAdminSubsidyDocs,
  fetchAdminWorkbench,
  markAdminPaid,
  recordAdminPayment,
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

/** LINE 傳送補助資料連結（首次通知） */
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

/**
 * LINE「提醒補件」訊息模板。
 * 日後若要改文案，請改此函式即可。
 * - {missing_documents} ← item.missingDocLabels（依實際缺件動態產生）
 * - {upload_url} ← absoluteUploadUrl(item)
 * - 三聯式提醒僅在 invoiceKind === "triple" 時顯示
 */
function subsidyLineReminderText(item: AdminWorkbenchItem): string {
  const uploadUrl = absoluteUploadUrl(item) || "（尚未產生上傳網址）";
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
    "📋 目前尚缺資料：",
    "",
    missingDocuments,
    "",
  ];

  if (item.invoiceKind === "triple") {
    lines.push(
      "若本案件為公司三聯式發票，請一併填寫：",
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

/** 補助狀態 — 只看 pipeline_status */
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
  if ((item.missingDocLabels?.length ?? 0) > 0) {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-0 font-normal">等待客戶上傳</Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-800 border-0 font-normal">
      補助資料已齊，可進行申請
    </Badge>
  );
}

function SubsidyMetaLines({ item }: { item: AdminWorkbenchItem }) {
  return (
    <div className="text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <SubsidyBadge item={item} />
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

  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmAdminCompletion(id),
    onSuccess: () => {
      toast({ title: "已確認施工資料" });
      invalidate();
    },
    onError: onErr,
  });

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

  const [payModal, setPayModal] = useState<{ item: AdminWorkbenchItem; amount: string } | null>(null);
  const [docsModal, setDocsModal] = useState<AdminWorkbenchItem | null>(null);

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

  function renderConfirmCard(item: AdminWorkbenchItem) {
    return (
      <ItemShell key={`confirm-${item.workOrderId}`} item={item}>
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

  function renderOpenCard(item: AdminWorkbenchItem) {
    const unpaid = parseFloat(String(item.unpaidAmount ?? "0")) || 0;
    const phone = item.mobilePhone || item.telephone;
    const subsidyDone = item.subsidyPipelineStatus === "applied";
    const shareReady = !!item.invoiceKind && !!item.uploadUrl;
    const missing = item.missingDocLabels ?? [];

    function shareLine(text: string, okTitle: string) {
      const win = openLineShareText(text);
      if (!win) {
        void navigator.clipboard.writeText(text).then(() =>
          toast({ title: "已複製分享內容", description: "請貼到 LINE 傳送" }),
        );
        return;
      }
      toast({ title: okTitle, description: "請選擇聊天室後送出" });
    }

    return (
      <ItemShell key={`open-${item.workOrderId}`} item={item}>
        <AmountSummary item={item} />
        {item.receivableId == null && (
          <p className="text-xs text-amber-800">
            尚未建立應收帳款（案件可能未綁定客戶），請至應收帳款頁確認後再登記收款
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">補助狀態：</span>
          <SubsidyBadge item={item} />
        </div>
        {!subsidyDone && missing.length > 0 && (
          <p className="text-xs text-orange-800">缺少補助資料：{missing.join("、")}</p>
        )}
        {!subsidyDone && item.invoiceKind && missing.length === 0 && (
          <p className="text-xs text-green-700">補助資料已齊，確認送件後請標記補助完成</p>
        )}
        {item.receivableStatus === "paid" && !subsidyDone && (
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
        {canOperate && shareReady && !subsidyDone && (
          <div className="flex flex-wrap gap-2">
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
              複製補助上傳網址
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9"
              disabled={subsidyPipeMut.isPending}
              onClick={() => {
                shareLine(subsidyUploadShareText(item), "已開啟 LINE 分享");
                if (item.subsidyPipelineStatus === "link_not_sent") {
                  subsidyPipeMut.mutate({ id: item.workOrderId, status: "awaiting_upload" });
                }
              }}
            >
              LINE 傳送補助資料連結
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9"
              onClick={() => shareLine(subsidyLineReminderText(item), "已開啟 LINE 分享")}
            >
              LINE 提醒補件
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9"
              onClick={() => setDocsModal(item)}
            >
              查看客戶資料
            </Button>
            <Button
              size="sm"
              className="h-10 sm:h-9 bg-green-700 hover:bg-green-800"
              disabled={subsidyPipeMut.isPending}
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
              className="h-10 sm:h-9"
              onClick={() => setDocsModal(item)}
            >
              查看客戶資料
            </Button>
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
          {canFinance && unpaid > 0 && (
            <Button
              size="sm"
              className="h-10 sm:h-9"
              onClick={() => setPayModal({ item, amount: String(unpaid) })}
            >
              登記收款
            </Button>
          )}
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
          {canOperate && item.receivableStatus === "paid" && (
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
          <Button
            size="sm"
            variant="outline"
            className="h-10 sm:h-9"
            onClick={() => setDocsModal(item)}
          >
            查看客戶資料
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

      <Section
        title="📋 待確認施工資料"
        count={c.pendingConstructionConfirm ?? 0}
      >
        {(s.pendingConstructionConfirm ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">目前無待辦</p>
        ) : (
          s.pendingConstructionConfirm.map(renderConfirmCard)
        )}
      </Section>

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

      {/* 登記收款 Modal */}
      <Dialog open={!!payModal} onOpenChange={(o) => { if (!o) setPayModal(null); }}>
        <DialogContent className="max-w-sm w-[calc(100vw-1.5rem)]">
          <DialogHeader>
            <DialogTitle>登記收款</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {payModal && (
              <>
                <AmountSummary item={payModal.item} />
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
                        const text = subsidyLineReminderText(docsModal);
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
