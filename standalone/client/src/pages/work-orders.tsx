import { useState, useRef, useEffect, useMemo } from "react";
import { useSearch, useLocation, Link } from "wouter";
import {
  useListWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useDeleteWorkOrder,
  useListCustomers, useListProgress, useCreateProgress,
  useCreatePayment, useCreateReceivable,
  useListEmployees, useListQuotes,
  getListWorkOrdersQueryKey, getListProgressQueryKey, getListReceivablesQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateStatistics } from "@/lib/invalidateStatistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard, Printer, MapPin, X, FileText, AlertCircle, UserPlus, Eye } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth, hasRole, userHasFeature } from "@/contexts/auth-context";
import { makeEmpty, type WOForm, buildPayload, hasWorkOrderCustomer, WorkOrderFormFields, equipmentItemsFromOrder } from "@/components/work-order-form";
import { BindCustomerDialog } from "@/components/bind-customer-dialog";
import { validateWorkOrderAiReminder } from "@/components/work-orders/WorkOrderAiReminderSection";
import {
  parseAiReminderScenarioIds,
  parseWorkOrderAiReminderCustomConfig,
  type AiReminderRuleSource,
} from "@/lib/aiWorkReminderSettings";
import { stripQuotePricingFromNotes } from "@/lib/quoteToWorkOrder";
import { VoiceAssistantButton } from "@/components/voice-assistant/VoiceAssistantDialog";
import { applyVoiceToWorkOrderForm } from "@/lib/voice/applyVoiceToWorkOrder";
import type { VoiceAssistantApplyPayload } from "@/components/voice-assistant/types";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { handlePdfAction, isMobileDevice, openLineShareText, openPrintWindow } from "@/components/pdf/pdf-service";
import { buildWorkOrderHtml } from "@/components/pdf/templates/WorkOrderTemplate";

/** Same compact icon button as quote list — min 44×44 touch target on mobile. */
function WoIconButton({
  label,
  onClick,
  disabled,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={`inline-flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:pointer-events-none shrink-0 ${className}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function LineGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[4px] bg-[#06C755] text-[9px] font-bold leading-none text-white ${className}`}
      aria-hidden
    >
      LINE
    </span>
  );
}
import { FieldProgressDetailSection } from "@/components/field-progress/FieldProgressDetailSection";
import { WorkOrderReopenDialog } from "@/components/work-orders/WorkOrderReopenDialog";
import { EngineerWorkOrderCard } from "@/components/field-progress/EngineerWorkOrderCard";
import {
  listMyFieldProgress,
  taipeiToday,
  addDaysTaipei,
  type FieldProgressRecord,
} from "@/lib/fieldProgressApi";
import {
  advanceAdminSubsidyPipeline,
  fetchAdminCaseDetail,
  unmarkAdminSubsidyApplied,
} from "@/lib/adminWorkbenchApi";

const ADMIN_FILTER_TABS = ["待派工", "待施工", "施工中", "異常／暫停", "施工完成", "歷史紀錄"] as const;
type AdminFilterTab = (typeof ADMIN_FILTER_TABS)[number];
const ENGINEER_FILTERS = ["進行中", "今日", "即將施工", "已完成", "全部"] as const;
type EngineerFilter = (typeof ENGINEER_FILTERS)[number];
const WO_COMPLETED = new Set(["已完成", "已結案"]);

const STATUS_COLORS: Record<string, string> = {
  "待派工": "bg-slate-100 text-slate-700",
  "待施工": "bg-amber-100 text-amber-700",
  "施工中": "bg-blue-100 text-blue-700",
  "異常／暫停": "bg-orange-100 text-orange-800",
  "已完成": "bg-green-100 text-green-700",
  "已結案": "bg-gray-100 text-gray-600",
  // backward compat for old statuses
  "待處理": "bg-amber-100 text-amber-700",
  "進行中": "bg-blue-100 text-blue-700",
  "已取消": "bg-gray-100 text-gray-700",
};

function normalizeWoStatus(status: string | null | undefined): string {
  if (!status) return "待施工";
  if (status === "待處理") return "待施工";
  if (status === "進行中") return "施工中";
  if (status === "已取消" || status === "暫停") return "異常／暫停";
  return status;
}

/** Schedule bucket for 待施工 sort: overdue → today → tomorrow → future */
function scheduleSortKey(scheduledDate: string | null | undefined, today: string): number {
  if (!scheduledDate) return 0; // treat missing as most urgent (待派工-like)
  if (scheduledDate < today) return 0;
  if (scheduledDate === today) return 1;
  const tomorrow = addDaysTaipei(today, 1);
  if (scheduledDate === tomorrow) return 2;
  return 3;
}

function matchesAdminFilter(o: any, tab: AdminFilterTab, _today: string): boolean {
  const s = normalizeWoStatus(o.status);
  switch (tab) {
    case "待派工":
      return (s === "待派工" || s === "待施工") && !o.scheduledDate && !WO_COMPLETED.has(s);
    case "待施工":
      return s === "待施工" && !!o.scheduledDate;
    case "施工中":
      return s === "施工中";
    case "異常／暫停":
      return s === "異常／暫停";
    case "施工完成":
      return s === "已完成";
    case "歷史紀錄":
      return s === "已結案";
    default:
      return true;
  }
}

/** Pick the list tab that contains this work order. */
function tabForWorkOrder(o: any): AdminFilterTab {
  const s = normalizeWoStatus(o.status);
  if (s === "已結案") return "歷史紀錄";
  if (s === "已完成") return "施工完成";
  if (s === "異常／暫停") return "異常／暫停";
  if (s === "施工中") return "施工中";
  if ((s === "待派工" || s === "待施工") && !o.scheduledDate) return "待派工";
  if (s === "待施工" && o.scheduledDate) return "待施工";
  return "待施工";
}

const PT_COLORS: Record<string, string> = {
  "新裝": "bg-purple-100 text-purple-700",
  "維修": "bg-red-100 text-red-700",
  "保養": "bg-teal-100 text-teal-700",
  "遷機": "bg-orange-100 text-orange-700",
  "清洗": "bg-sky-100 text-sky-700",
  "保固服務": "bg-green-100 text-green-700",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"); }
function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(data)}`;
}
function stampHtml(status: string) {
  if (status !== "已完成" && status !== "已取消") return "";
  const color = status === "已完成" ? "#16a34a" : "#6b7280";
  return `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:36pt;font-weight:900;color:${color};opacity:0.12;pointer-events:none;white-space:nowrap;user-select:none">${status}</div>`;
}

function getTechDisplay(order: any): string {
  try {
    const techs = order.technicians ? JSON.parse(order.technicians) : null;
    if (Array.isArray(techs) && techs.length) return techs.join("、");
  } catch { /* ignore */ }
  if (order.assignedTo) {
    return order.assignedTo + (order.assistantTo ? ` / ${order.assistantTo}` : "");
  }
  return "—";
}

// ─── PDF V2 helpers ──────────────────────────────────────────────────────
async function printWorkOrderPDF(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const html = buildWorkOrderHtml(order);
  if (isMobileDevice()) {
    await handlePdfAction({
      html,
      docNo: woNum,
      filename: `派工單_${woNum}.pdf`,
      title: "晟風工程派工單",
      action: "download",
      setPdfPreview,
      toast,
      pageFormat: "custom-240x140-landscape",
    });
  } else {
    openPrintWindow(html, `晟風工程派工單 — ${woNum}`);
  }
}

async function shareWorkOrderViaLine(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const html = buildWorkOrderHtml(order);
  // Keep PDF preview (existing print layout) then open real LINE share — same helper as quotes.
  await handlePdfAction({
    html,
    docNo: woNum,
    filename: `派工單_${woNum}.pdf`,
    title: "晟風工程派工單",
    action: "preview",
    setPdfPreview,
    toast,
    pageFormat: "custom-240x140-landscape",
  });

  const message = [
    "【晟風工程派工單】",
    `單號：${woNum}`,
    `客戶：${order.customerName || "—"}`,
    order.title ? `工程：${order.title}` : "",
    order.installAddress ? `地址：${order.installAddress}` : "",
    order.scheduledDate ? `預定施工：${order.scheduledDate}${order.scheduledTime ? ` ${order.scheduledTime}` : ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const win = openLineShareText(message);
  if (win) {
    toast({ title: "已開啟 LINE 分享", description: "請選擇對話傳送派工單資訊" });
    return;
  }
  try {
    await navigator.clipboard.writeText(message);
    toast({ title: "已複製分享內容", description: "無法直接開啟 LINE，請貼到對話中" });
  } catch {
    toast({ title: "請手動開啟 LINE 分享", variant: "destructive" });
  }
}

function WorkOrderDetailSummary({ order }: { order: any }) {
  const items = equipmentItemsFromOrder(order);
  const hasEquipment = items.some(it => it.brand || it.itemName || it.model || it.quantity);
  const notes = stripQuotePricingFromNotes(order.notes ?? "");
  const phone = [order.mobilePhone, order.telephone].filter(Boolean).join(" / ");

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-sm">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">派工詳情</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {order.title && (
          <p><span className="text-muted-foreground">工程名稱：</span>{order.title}</p>
        )}
        {phone && (
          <p><span className="text-muted-foreground">電話：</span>{phone}</p>
        )}
        {order.installAddress && (
          <p className="sm:col-span-2"><span className="text-muted-foreground">施工地址：</span>{order.installAddress}</p>
        )}
      </div>
      {order.description && (
        <div className="text-xs">
          <span className="text-muted-foreground">施工內容：</span>
          <p className="mt-0.5 whitespace-pre-wrap">{order.description}</p>
        </div>
      )}
      {hasEquipment && (
        <div className="text-xs space-y-1">
          <span className="text-muted-foreground">材料 / 設備</span>
          <ul className="list-disc pl-4 space-y-0.5">
            {items.filter(it => it.brand || it.itemName || it.model || it.quantity).map((it, i) => (
              <li key={i}>
                {[it.brand, it.itemName || it.model].filter(Boolean).join(" ")}
                {it.model && it.itemName && it.model !== it.itemName ? `（${it.model}）` : ""}
                {" "}×{it.quantity ?? "—"}{it.unit}
                {it.notes ? ` — ${it.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes && (
        <div className="text-xs">
          <span className="text-muted-foreground">備註：</span>
          <p className="mt-0.5 whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  );
}

function amountText(v?: string | null) {
  const n = parseFloat(String(v ?? "0"));
  return `NT$${(Number.isFinite(n) ? n : 0).toLocaleString("zh-TW")}`;
}

/**
 * 案件頁的行政資訊：客戶／買受人、收款、補助狀態與客戶已上傳的補助文件。
 * 取代原本行政工作台的「查看客戶資料」彈窗，統一由此檢視。
 */
function WorkOrderSubsidyPanel({ order }: { order: any }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canMark =
    hasRole(user, "super_admin", "owner", "admin") || userHasFeature(user, "receivables");
  const canViewAdmin =
    canMark || hasRole(user, "accountant");
  const { data: detail } = useQuery({
    queryKey: ["admin-case-detail", order.id],
    queryFn: () => fetchAdminCaseDetail(order.id),
    enabled: canViewAdmin && !!order.id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/admin-workbench"] });
    queryClient.invalidateQueries({ queryKey: ["admin-workbench"] });
    queryClient.invalidateQueries({ queryKey: ["admin-case-detail", order.id] });
    queryClient.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
  };

  const markMut = useMutation({
    mutationFn: () => advanceAdminSubsidyPipeline(order.id, "applied"),
    onSuccess: () => {
      toast({ title: "已標記補助完成", description: "若已收款，系統會自動結案" });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "標記失敗",
        description: err?.message || "請稍後再試",
        variant: "destructive",
      });
    },
  });

  const unmarkMut = useMutation({
    mutationFn: () => unmarkAdminSubsidyApplied(order.id),
    onSuccess: () => {
      toast({ title: "已取消補助完成" });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "取消失敗",
        description: err?.message || "請稍後再試",
        variant: "destructive",
      });
    },
  });

  const docs = detail?.customerDocuments ?? [];
  const hasAdminInfo =
    !!detail &&
    (detail.receivableId != null ||
      !!detail.invoiceKind ||
      !!detail.subsidyCompleted ||
      docs.length > 0);
  if (!canViewAdmin || !hasAdminInfo) return null;

  const subsidyDone = !!detail!.subsidyCompleted;
  const missing = detail!.missingDocLabels ?? [];
  const phone = [order.mobilePhone, order.telephone].filter(Boolean).join(" / ");

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3 text-sm">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        行政／補助資訊
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <p><span className="text-muted-foreground">客戶：</span>{order.customerName || "—"}</p>
        {phone && <p><span className="text-muted-foreground">電話：</span>{phone}</p>}
        {order.installAddress && (
          <p className="sm:col-span-2">
            <span className="text-muted-foreground">地址：</span>{order.installAddress}
          </p>
        )}
        {detail?.invoiceKindLabel && (
          <p><span className="text-muted-foreground">發票類型：</span>{detail.invoiceKindLabel}</p>
        )}
        {detail?.invoiceTitle && (
          <p><span className="text-muted-foreground">公司名稱：</span>{detail.invoiceTitle}</p>
        )}
        {detail?.taxId && (
          <p><span className="text-muted-foreground">統一編號：</span>{detail.taxId}</p>
        )}
      </div>

      {detail && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <p><span className="text-muted-foreground">應收：</span>{amountText(detail.totalAmount)}</p>
          <p><span className="text-muted-foreground">已收：</span>{amountText(detail.receivedAmount)}</p>
          <p><span className="text-muted-foreground">未收：</span>{amountText(detail.unpaidAmount)}</p>
          <p><span className="text-muted-foreground">收款狀態：</span>{detail.paymentStatus || "—"}</p>
        </div>
      )}

      <div className="text-xs space-y-1">
        <p>
          <span className="text-muted-foreground">補助狀態：</span>
          {subsidyDone ? (
            <span className="text-emerald-800 font-medium">補助已完成</span>
          ) : (
            <span className="text-blue-700 font-medium">
              {detail?.subsidyStatusLabel || "等待客戶上傳"}
            </span>
          )}
        </p>
        {!subsidyDone && missing.length > 0 && (
          <p className="text-orange-800">缺少：{missing.join("、")}</p>
        )}
        {(detail?.aiTips?.length ?? 0) > 0 && (
          <div className="text-yellow-800">
            <p className="font-medium">檢查提示：</p>
            <ul className="list-disc pl-4">
              {detail!.aiTips!.map(t => <li key={t}>{t}</li>)}
            </ul>
          </div>
        )}
        {detail?.appliedAt && (
          <p className="text-emerald-900">
            完成時間：{new Date(detail.appliedAt).toLocaleString("zh-TW")}
          </p>
        )}
      </div>

      {detail && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            客戶已上傳補助文件（{docs.length} 份
            {detail.lastUploadAt
              ? ` · 最後上傳 ${new Date(detail.lastUploadAt).toLocaleString("zh-TW")}`
              : ""}
            ）
          </p>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">尚無客戶上傳紀錄</p>
          ) : (
            <ul className="space-y-2">
              {docs.map(d => (
                <li key={d.id} className="rounded-md border bg-background p-2 text-xs">
                  <p className="font-medium">
                    {d.docTypeLabel || d.fileName || d.docType || "文件"} · {d.status}
                  </p>
                  {d.fileName && <p className="text-muted-foreground">{d.fileName}</p>}
                  {d.uploadedAt && (
                    <p className="text-muted-foreground">
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
                      className="text-primary underline"
                    >
                      預覽／下載
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canMark && !subsidyDone && (
        <Button
          size="sm"
          className="h-10 sm:h-9 bg-green-700 hover:bg-green-800"
          disabled={markMut.isPending}
          onClick={() => {
            if (!window.confirm("確定此案件的補助申請已完成？已收款的話會自動結案。")) return;
            markMut.mutate();
          }}
        >
          標記補助完成
        </Button>
      )}
      {canMark && subsidyDone && (
        <Button
          size="sm"
          variant="outline"
          className="h-10 sm:h-9 text-orange-700 border-orange-300"
          disabled={unmarkMut.isPending}
          onClick={() => {
            if (!window.confirm("取消補助完成／重新開啟？附件不會刪除。")) return;
            unmarkMut.mutate();
          }}
        >
          取消補助完成
        </Button>
      )}
    </div>
  );
}

// ─── Progress + Quick Payment Panel ────────────────────────────────────────
function ProgressPanel({ workOrderId, customerId, workOrderTitle }: {
  workOrderId: number; customerId: number; workOrderTitle: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isTechnician = user?.role === "technician";
  const { data: progress } = useListProgress(workOrderId);
  const [note, setNote] = useState("");
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: 0,
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "現金",
    notes: "",
  });

  const createProgress = useCreateProgress({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProgressQueryKey(workOrderId) });
        setNote("");
        toast({ title: "進度紀錄已新增" });
      },
    },
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(queryClient);
        setShowPayForm(false);
        toast({ title: "收款已登錄" });
      },
    },
  });

  const METHODS = ["現金", "銀行轉帳", "支票", "LINE Pay", "其他"];

  return (
    <div className="mt-3 ml-2 pl-3 border-l-2 border-muted space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">工程進度紀錄</p>
        {progress && progress.length > 0 ? progress.map(p => (
          <div key={p.id} className="text-xs bg-muted/30 rounded p-2">
            <p className="font-medium">{p.description}</p>
            <p className="text-muted-foreground mt-0.5">
              {new Date(p.createdAt).toLocaleString("zh-TW")}
              {p.recordedBy && ` · ${p.recordedBy}`}
            </p>
          </div>
        )) : <p className="text-xs text-muted-foreground">尚無進度紀錄</p>}
      </div>
      <div className="flex gap-2">
        <Input
          className="text-xs h-8 flex-1"
          placeholder="新增進度說明..."
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && note) createProgress.mutate({ workOrderId, data: { description: note } });
          }}
        />
        <Button
          size="sm" className="h-8 text-xs px-3"
          disabled={!note || createProgress.isPending}
          onClick={() => createProgress.mutate({ workOrderId, data: { description: note } })}
        >新增</Button>
      </div>
      {!isTechnician && !showPayForm && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowPayForm(true)}>
          <CreditCard className="h-3 w-3 mr-1" />登錄收款
        </Button>
      )}
      {!isTechnician && showPayForm && (
        <div className="bg-muted/30 rounded p-3 space-y-2">
          <p className="text-xs font-medium">快速登錄收款</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">金額</Label>
              <Input className="h-7 text-xs" type="number" value={payForm.amount || ""} onChange={e => setPayForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">日期</Label>
              <Input className="h-7 text-xs" type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">付款方式</Label>
            <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">備註</Label>
            <Input className="h-7 text-xs" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder={workOrderTitle} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" variant="ghost" onClick={() => setShowPayForm(false)}>取消</Button>
            <Button size="sm" className="h-7 text-xs" disabled={!payForm.amount || createPayment.isPending}
              onClick={() => createPayment.mutate({ data: { customerId, workOrderId, ...payForm } })}>
              儲存收款
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Main Page ───────────────────────────────────────────────────────────────
export default function WorkOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";
  const expandParam = parseInt(urlParams.get("expand") ?? "0", 10) || null;
  const openParam = parseInt(urlParams.get("open") ?? "0", 10) || null;
  const highlightParam = parseInt(urlParams.get("highlight") ?? "0", 10) || null;
  const focusId = highlightParam || openParam || expandParam;

  const [statusFilter, setStatusFilter] = useState<AdminFilterTab>("待施工");
  const [listSearch, setListSearch] = useState("");
  const [engineerFilter, setEngineerFilter] = useState<EngineerFilter>("進行中");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(focusId);
  const [highlightId, setHighlightId] = useState<number | null>(focusId);
  const [form, setForm] = useState<WOForm>(makeEmpty());
  const [arModal, setArModal] = useState<{ order: any; amount: string } | null>(null);
  const [bindForAr, setBindForAr] = useState<any | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const pendingARRef = useRef<any>(null);
  const [reopenModal, setReopenModal] = useState<{ payload: Record<string, unknown> } | null>(null);

  const COMPLETED_STATUSES = ["已完成", "已結案"];
  const isAdmin =
    hasRole(user, "super_admin", "owner", "admin") ||
    (userHasFeature(user, "dispatch_orders") && userHasFeature(user, "customers"));
  const isEngineerView =
    hasRole(user, "engineer", "technician") &&
    !hasRole(user, "super_admin", "owner", "admin");
  // 工程師不可新增／管理派工（僅施工檢視）
  const canWrite =
    !isEngineerView &&
    (hasRole(user, "super_admin", "owner", "admin") || userHasFeature(user, "dispatch_orders"));

  // 工程師：不寫死 today，一次取回指派案件後前端篩選
  const {
    data: orders,
    isLoading,
    isError: ordersError,
    error: ordersErr,
  } = useListWorkOrders({
    ...(filterCustomerId ? { customerId: filterCustomerId } : {}),
  });

  const { data: progressRows = [] } = useQuery({
    queryKey: ["field-progress", "mine"],
    queryFn: listMyFieldProgress,
    enabled: isEngineerView,
  });
  const progressMap = useMemo(() => {
    const map = new Map<number, FieldProgressRecord>();
    for (const r of progressRows) map.set(r.workOrderId, r);
    return map;
  }, [progressRows]);

  const today = taipeiToday();
  const completedSince = addDaysTaipei(today, -30);

  const displayedOrders = useMemo(() => {
    const list = orders ?? [];
    const q = listSearch.trim().toLowerCase();

    if (!isEngineerView) {
      // Deep-link focus: show the target case without forcing the user to search.
      if (focusId) {
        const focused = list.find((o) => o.id === focusId);
        if (focused) return [focused];
      }

      let filtered = list.filter((o) => matchesAdminFilter(o, statusFilter, today));
      if (q) {
        filtered = filtered.filter((o) => {
          const hay = [
            o.workOrderNumber,
            o.customerName,
            o.title,
            o.installAddress,
            o.mobilePhone,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });
      }
      if (statusFilter === "待施工") {
        filtered = [...filtered].sort((a, b) => {
          const ka = scheduleSortKey(a.scheduledDate, today);
          const kb = scheduleSortKey(b.scheduledDate, today);
          if (ka !== kb) return ka - kb;
          const da = a.scheduledDate ?? "";
          const db = b.scheduledDate ?? "";
          return da.localeCompare(db);
        });
      }
      return filtered;
    }

    return list.filter((o) => {
      const prog = progressMap.get(o.id);
      const fieldDone = prog?.fieldStatus === "completed" || !!prog?.completedAt;
      const woDone = WO_COMPLETED.has(normalizeWoStatus(o.status)) || fieldDone;
      const sched = o.scheduledDate ?? null;

      switch (engineerFilter) {
        case "進行中":
          return !woDone && (!sched || sched <= today);
        case "今日":
          return sched === today;
        case "即將施工":
          return !woDone && !!sched && sched > today;
        case "已完成": {
          if (!woDone) return false;
          let doneDay: string | null = null;
          if (prog?.completedAt) {
            doneDay = new Date(prog.completedAt).toLocaleDateString("en-CA", {
              timeZone: "Asia/Taipei",
            });
          } else {
            doneDay = (o as { completedDate?: string | null }).completedDate ?? sched;
          }
          return !doneDay || doneDay >= completedSince;
        }
        case "全部":
        default:
          return true;
      }
    });
  }, [orders, isEngineerView, engineerFilter, progressMap, today, completedSince, statusFilter, listSearch, focusId]);

  // 工程師不打客戶／報價 API（常因無 customers/quotations 權限而 403）
  const { data: customers } = useListCustomers(
    { includeOld: "true" },
    { query: { enabled: !isEngineerView } } as any,
  );
  const { data: employees } = useListEmployees(
    undefined,
    { query: { enabled: !isEngineerView } } as any,
  );
  const { data: quotes } = useListQuotes(
    { includeOld: "true" } as any,
    { query: { enabled: !isEngineerView } } as any,
  );

  // Technician options: employees whose position contains "技師" and are active
  const technicianOptions = (employees ?? []).filter(e => e.position?.includes("技師") && e.status !== "離職");

  useEffect(() => {
    if (!focusId || !orders?.length) return;
    const o = orders.find((x) => x.id === focusId);
    if (!o) return;
    setExpandedId(focusId);
    setHighlightId(focusId);
    setListSearch("");
    if (!isEngineerView) setStatusFilter(tabForWorkOrder(o));
    requestAnimationFrame(() => {
      document.getElementById(`wo-row-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusId, orders, isEngineerView]);

  const createMutation = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(queryClient);
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setShowCreate(false);
        toast({ title: "派工單已新增" });
      },
    },
  });
  const updateMutation = useUpdateWorkOrder({
    mutation: {
      onSuccess: (_data, variables) => {
        invalidateStatistics(queryClient);
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        if (variables.id) {
          queryClient.invalidateQueries({ queryKey: ["field-progress", variables.id] });
          queryClient.invalidateQueries({ queryKey: ["field-progress-snapshots", variables.id] });
        }
        queryClient.invalidateQueries({ queryKey: ["field-progress", "mine"] });
        setEditItem(null);
        toast({ title: "派工單已更新" });
        if (pendingARRef.current) {
          const o = pendingARRef.current;
          pendingARRef.current = null;
          setArModal({ order: o, amount: "" });
        }
      },
    },
  });

  const createARMutation = useCreateReceivable({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(queryClient);
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
        setArModal(null);
        toast({ title: "應收帳款已建立", description: "可至「應收帳款」頁面查看" });
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.response?.data?.error ?? err?.message;
        if (err?.status === 409 || /已有應收/.test(String(msg))) {
          toast({ title: "此派工單已有應收帳款紀錄" });
          queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
          setArModal(null);
        } else {
          toast({ title: "建立失敗", description: msg || "請稍後再試", variant: "destructive" });
        }
      },
    },
  });

  const bindCustomerMutation = useUpdateWorkOrder({
    mutation: {
      onSuccess: (updated: any) => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        toast({ title: "客戶已綁定" });
        const order = { ...bindForAr, ...updated, customerId: updated?.customerId ?? bindForAr?.customerId };
        setBindForAr(null);
        if (order) setArModal({ order, amount: arModal?.amount ?? "" });
      },
      onError: (err: any) => {
        toast({
          title: "綁定失敗",
          description: err?.data?.error ?? err?.message,
          variant: "destructive",
        });
      },
    },
  });
  const deleteMutation = useDeleteWorkOrder({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(queryClient);
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setDeleteId(null);
        toast({ title: "派工單已刪除" });
      },
    },
  });

  function openCreate() {
    setForm(makeEmpty());
    setShowCreate(true);
  }

  function handleVoiceApply({ parsed }: VoiceAssistantApplyPayload) {
    if (parsed.formType !== "work_order") return;
    setForm(applyVoiceToWorkOrderForm(parsed));
    setEditItem(null);
    setShowCreate(true);
  }

  function openEdit(o: any) {
    let technicians: string[] = [];
    try {
      const parsed = o.technicians ? JSON.parse(o.technicians) : null;
      if (Array.isArray(parsed)) technicians = parsed;
    } catch { /* ignore */ }

    setForm({
      customerMode: o.customerId ? "existing" as const : (o.customerName ? "temporary" as const : null),
      quoteId: o.quoteId ?? undefined,
      customerId: o.customerId ?? 0,
      customerName: o.customerName ?? "",
      title: o.title ?? "",
      status: o.status,
      contactPerson: o.contactPerson ?? "",
      mobilePhone: o.mobilePhone ?? "",
      telephone: o.telephone ?? "",
      installAddress: o.installAddress ?? "",
      scheduledDate: o.scheduledDate ?? "",
      scheduledTime: o.scheduledTime ?? "",
      completedDate: o.completedDate ?? "",
      technicians,
      projectType: o.projectType ?? "",
      equipmentItems: equipmentItemsFromOrder(o),
      hasElevator: o.hasElevator ?? "",
      description: o.description ?? "",
      notes: stripQuotePricingFromNotes(o.notes ?? ""),
      estimatedWorkMinutes: o.estimatedWorkMinutes ?? undefined,
      aiReminderEnabled: Boolean(o.aiReminderEnabled),
      aiReminderScenarioIds: parseAiReminderScenarioIds(o.aiReminderScenarioIds),
      aiNotifySupervisorOnDelay: Boolean(o.aiNotifySupervisorOnDelay),
      aiReminderRuleSource: (o.aiReminderRuleSource as AiReminderRuleSource) ?? "company_default",
      aiReminderCustomConfig: parseWorkOrderAiReminderCustomConfig(o.aiReminderCustomConfig),
    });
    setEditItem(o);
  }

  function handleSubmit(e: React.FormEvent, mode: "create" | "edit") {
    e.preventDefault();
    if (!hasWorkOrderCustomer(form)) {
      toast({
        title: form.customerMode === "temporary" ? "請填寫臨時客戶姓名與手機" : "請選擇客戶",
        variant: "destructive",
      });
      return;
    }
    const aiError = validateWorkOrderAiReminder(form);
    if (aiError) {
      toast({ title: aiError, variant: "destructive" });
      return;
    }
    const payload = buildPayload(form);
    if (payload.quoteId) {
      console.log("LINK QUOTE WORK ORDER PAYLOAD", payload);
    } else {
      console.log("DIRECT WORK ORDER PAYLOAD", payload);
    }
    if (mode === "create") {
      createMutation.mutate({ data: payload });
      return;
    }

    const isReopen =
      isAdmin &&
      form.status === "待施工" &&
      editItem?.status &&
      COMPLETED_STATUSES.includes(editItem.status) &&
      editItem.status !== "待施工";

    if (isReopen) {
      setReopenModal({ payload });
      return;
    }

    if (form.status === "已完成" && editItem?.status !== "已完成") {
      pendingARRef.current = { ...editItem, ...payload };
    }
    updateMutation.mutate({ id: editItem.id, data: payload });
  }

  function confirmReopen(reason: string, note: string) {
    if (!reopenModal || !editItem) return;
    updateMutation.mutate({
      id: editItem.id,
      data: {
        ...reopenModal.payload,
        reopenReason: reason,
        reopenNote: note || undefined,
      },
    });
    setReopenModal(null);
  }

  const isDialogOpen = showCreate || !!editItem;
  const dialogMode = showCreate ? "create" : "edit";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">派工單管理</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">冷氣工程派工管理</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2 shrink-0">
            <VoiceAssistantButton formType="work_order" onApply={handleVoiceApply} />
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />新增派工單
            </Button>
          </div>
        )}
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/work-orders")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      {/* Sticky search (mobile-first) — hidden in deep-link focus mode */}
      {!isEngineerView && !focusId && (
        <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Input
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="搜尋派工單號、客戶、地址…"
            className="h-10"
          />
        </div>
      )}

      {focusId && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
          <span>正在查看指定案件 #{focusId}</span>
          <button
            type="button"
            className="ml-auto text-xs text-primary hover:underline"
            onClick={() => navigate("/work-orders")}
          >
            返回全部列表
          </button>
        </div>
      )}

      {/* Status filter tabs — horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {isEngineerView
          ? ENGINEER_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setEngineerFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap shrink-0 ${
                  engineerFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {s}
              </button>
            ))
          : ADMIN_FILTER_TABS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {s}
              </button>
            ))}
      </div>

      {isEngineerView && (
        <p className="text-xs text-muted-foreground">
          預設顯示進行中（含逾期未完成）。已完成預設最近 30 天。
          <Link href="/engineer-dashboard" className="ml-2 underline text-primary">
            前往施工首頁
          </Link>
        </p>
      )}

      {ordersError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-6 text-center space-y-3">
            <AlertCircle className="h-7 w-7 text-destructive mx-auto" />
            <p className="font-medium text-destructive">無法載入派工單</p>
            <p className="text-sm text-muted-foreground">
              {ordersErr instanceof Error ? ordersErr.message : "請稍後再試"}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
              重新整理
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Engineer card list — 有 403 時不顯示空資料文案 */}
      {isEngineerView && !ordersError ? (
        isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        ) : displayedOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            目前沒有分配給您的派工單
          </p>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {displayedOrders.map((o) => (
              <EngineerWorkOrderCard
                key={o.id}
                order={o}
                progress={progressMap.get(o.id) ?? null}
                readOnly={engineerFilter === "已完成"}
              />
            ))}
          </div>
        )
      ) : null}

      {/* Admin / shared list — single column cards */}
      {!isEngineerView && isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : !isEngineerView && !ordersError && displayedOrders.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 max-w-3xl">
          {displayedOrders.map(o => {
            const techDisplay = getTechDisplay(o);
            const statusLabel = normalizeWoStatus(o.status);
            const hasAr = !!(o as any).receivableId;
            const needsCustomer = !o.customerId;
            return (
              <Card
                key={o.id}
                id={`wo-row-${o.id}`}
                className={`overflow-hidden transition-shadow ${
                  highlightId === o.id
                    ? "ring-2 ring-primary shadow-md border-primary/40"
                    : ""
                }`}
              >
                <CardContent className="p-3 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-mono font-semibold text-muted-foreground">
                      {o.workOrderNumber || `#${o.id}`}
                    </span>
                    {highlightId === o.id && (
                      <span className="text-xs px-2 py-0.5 rounded font-medium bg-primary/10 text-primary">
                        目前案件
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[statusLabel] ?? STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {statusLabel}
                    </span>
                    {o.projectType && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${PT_COLORS[o.projectType] ?? "bg-gray-100 text-gray-600"}`}>
                        {o.projectType}
                      </span>
                    )}
                    {needsCustomer && (
                      <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-50 text-red-700">未綁定客戶</span>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold">{o.customerName || "—"}</p>
                    {o.title && <p className="text-xs text-foreground/80 mt-0.5">{o.title}</p>}
                    {o.installAddress && (
                      <p className="text-xs text-muted-foreground mt-0.5">{o.installAddress}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {o.scheduledDate && (
                        <span>施工：{o.scheduledDate}{o.scheduledTime ? ` ${o.scheduledTime}` : ""}</span>
                      )}
                      {techDisplay !== "—" && <span>技師：{techDisplay}</span>}
                      {o.completedDate && <span className="text-green-600">完成：{o.completedDate}</span>}
                    </div>
                    {o.quoteId && (o as any).quoteNumber && (
                      <button
                        type="button"
                        className="text-xs font-mono text-blue-600 hover:underline mt-1"
                        onClick={() => navigate(`/quotes?focusId=${o.quoteId}`)}
                      >
                        來源報價單：{(o as any).quoteNumber}
                      </button>
                    )}
                  </div>

                  {/* Actions — compact text buttons + icon ops (same pattern as quote list) */}
                  <TooltipProvider delayDuration={300}>
                    <div className="flex flex-wrap items-center gap-2">
                      {canWrite && !o.scheduledDate && statusLabel !== "已完成" && statusLabel !== "已結案" && (
                        <Button
                          size="sm"
                          className="h-11 sm:h-9 w-auto px-3 shrink-0"
                          variant="default"
                          onClick={() => openEdit(o)}
                        >
                          安排派工
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-11 sm:h-9 w-auto px-3 shrink-0"
                        onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                        title={expandedId === o.id ? "收合" : "查看案件"}
                        aria-label={expandedId === o.id ? "收合" : "查看案件"}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        <span className="sm:hidden">{expandedId === o.id ? "收合" : "查看"}</span>
                        <span className="hidden sm:inline">{expandedId === o.id ? "收合" : "查看案件"}</span>
                      </Button>
                      {(statusLabel === "施工中" || statusLabel === "待施工" || statusLabel === "已完成") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 sm:h-9 w-auto px-3 shrink-0"
                          onClick={() => setExpandedId(o.id)}
                          title="查看施工"
                          aria-label="查看施工"
                        >
                          查看施工
                        </Button>
                      )}
                      {canWrite && (statusLabel === "已完成" || o.status === "已完成") && (
                        hasAr ? (
                          <Button
                            size="sm"
                            className="h-11 sm:h-9 w-auto px-3 shrink-0 text-emerald-700 border-emerald-300"
                            variant="outline"
                            onClick={() => navigate(`/receivables?receivableId=${(o as any).receivableId}`)}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />查看帳款
                          </Button>
                        ) : needsCustomer ? (
                          <Button
                            size="sm"
                            className="h-11 sm:h-9 w-auto px-3 shrink-0"
                            variant="default"
                            onClick={() => setBindForAr(o)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />先綁定客戶
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-11 sm:h-9 w-auto px-3 shrink-0 text-emerald-700 border-emerald-300"
                            variant="outline"
                            onClick={() => setArModal({ order: o, amount: "" })}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />建立帳款
                          </Button>
                        )
                      )}

                      <WoIconButton
                        label="列印派工單"
                        onClick={() => void printWorkOrderPDF(o, setPdfPreview, toast)}
                      >
                        <Printer className="h-4 w-4" />
                      </WoIconButton>
                      <WoIconButton
                        label="LINE 分享派工單"
                        className="border-[#06C755]/40"
                        onClick={() => void shareWorkOrderViaLine(o, setPdfPreview, toast as any)}
                      >
                        <LineGlyph className="h-5 w-5 px-0.5" />
                      </WoIconButton>
                      {!!o.installAddress && (
                        <WoIconButton
                          label="導航"
                          onClick={() => {
                            const addr = String(o.installAddress);
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        >
                          <MapPin className="h-4 w-4" />
                        </WoIconButton>
                      )}
                      {canWrite && (
                        <WoIconButton label="編輯派工單" onClick={() => openEdit(o)}>
                          <Pencil className="h-4 w-4" />
                        </WoIconButton>
                      )}
                      {(user?.role === "owner" || user?.role === "super_admin") && (
                        <WoIconButton
                          label="刪除派工單"
                          className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          onClick={() => setDeleteId(o.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </WoIconButton>
                      )}
                    </div>
                  </TooltipProvider>

                  {expandedId === o.id && (
                    <div className="space-y-3 border-t pt-3">
                      <WorkOrderDetailSummary order={o} />
                      <WorkOrderSubsidyPanel order={o} />
                      <FieldProgressDetailSection workOrderId={o.id} />
                      <ProgressPanel workOrderId={o.id} customerId={o.customerId ?? 0} workOrderTitle={o.workOrderNumber || o.title} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : !isEngineerView && !ordersError ? (
        <Card><CardContent className="py-12 text-center">
          <p className="text-muted-foreground">目前無「{statusFilter}」的派工單</p>
        </CardContent></Card>
      ) : null}

      {/* Create / Edit Dialog — sticky header/footer, scrollable body (iPhone Safari) */}
      <Dialog open={isDialogOpen} onOpenChange={open => { if (!open) { setShowCreate(false); setEditItem(null); } }}>
        <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "新增派工單" : `編輯派工單 ${editItem?.workOrderNumber || ""}`}</DialogTitle>
          </DialogHeader>

          <form
            id="wo-form"
            onSubmit={e => handleSubmit(e, dialogMode)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DialogBody>
              <WorkOrderFormFields
                form={form}
                setForm={setForm}
                customers={customers ?? []}
                technicianOptions={technicianOptions}
                quotes={quotes ?? []}
                showQuoteSelector={true}
                customerDisabled={dialogMode === "edit" && !!editItem?.customerId}
                workOrderNumber={editItem?.workOrderNumber}
                customerDisplayName={editItem?.customerName ?? form.customerName}
              />
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreate(false); setEditItem(null); }}
              >取消</Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除這筆派工單嗎？相關進度紀錄也會一併刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AR creation modal */}
      <Dialog open={!!arModal} onOpenChange={open => { if (!open) setArModal(null); }}>
        <DialogContent className="max-w-sm w-[calc(100vw-1.5rem)]">
          <DialogHeader>
            <DialogTitle>建立應收帳款</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              是否為此派工單建立應收帳款？
            </p>
            {arModal && (
              <div className="text-xs text-muted-foreground bg-muted rounded p-2 space-y-1">
                {arModal.order.workOrderNumber && <div>派工單號：{arModal.order.workOrderNumber}</div>}
                <div>工程：{arModal.order.title}</div>
                {arModal.order.customerName && <div>客戶：{arModal.order.customerName}</div>}
                {arModal.order.projectType && <div>類別：{arModal.order.projectType}</div>}
              </div>
            )}
            <div className="space-y-1">
              <Label>應收金額 (NT$)</Label>
              <Input
                type="number"
                placeholder="請輸入金額"
                value={arModal?.amount ?? ""}
                onChange={e => setArModal(m => m ? { ...m, amount: e.target.value } : m)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArModal(null)}>略過</Button>
            <Button
              disabled={createARMutation.isPending || !arModal?.order?.customerId}
              onClick={() => {
                if (!arModal) return;
                const o = arModal.order;
                if (!o.customerId) {
                  setArModal(null);
                  setBindForAr(o);
                  return;
                }
                createARMutation.mutate({ data: {
                  customerId: o.customerId,
                  workOrderId: o.id,
                  workOrderNumber: o.workOrderNumber ?? undefined,
                  projectName: o.title,
                  projectType: o.projectType ?? undefined,
                  completionDate: o.completedDate ?? undefined,
                  totalAmount: parseFloat(arModal.amount) || 0,
                }});
              }}
            >確認建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BindCustomerDialog
        open={!!bindForAr}
        onOpenChange={(o) => { if (!o) setBindForAr(null); }}
        title="先綁定客戶"
        description="此派工單尚未綁定正式客戶，請搜尋或建立客戶後再建立應收帳款。"
        initial={bindForAr ? {
          name: bindForAr.customerName ?? "",
          mobile: bindForAr.mobilePhone ?? "",
          address: bindForAr.installAddress ?? "",
        } : null}
        confirmLabel="綁定並繼續"
        pending={bindCustomerMutation.isPending}
        onConfirm={(v) => {
          if (!bindForAr || !v.customerId) return;
          bindCustomerMutation.mutate({
            id: bindForAr.id,
            data: {
              customerId: v.customerId,
              customerName: v.name,
              mobilePhone: v.mobile || bindForAr.mobilePhone || undefined,
              installAddress: v.address || bindForAr.installAddress || undefined,
              contactPerson: v.contactPerson || bindForAr.contactPerson || undefined,
            },
          });
        }}
      />

      <WorkOrderReopenDialog
        open={!!reopenModal}
        workOrderLabel={editItem?.workOrderNumber || `#${editItem?.id ?? ""}`}
        onCancel={() => setReopenModal(null)}
        onConfirm={confirmReopen}
        pending={updateMutation.isPending}
      />

      <PdfPreviewDialog
        open={!!pdfPreview}
        pdfUrl={pdfPreview?.url ?? ""}
        filename={pdfPreview?.filename ?? ""}
        onClose={() => setPdfPreview(null)}
        onDownload={() => {
          if (!pdfPreview) return;
          const a = document.createElement("a");
          a.href = pdfPreview.url;
          a.download = pdfPreview.filename;
          a.click();
        }}
      />
    </div>
  );
}
