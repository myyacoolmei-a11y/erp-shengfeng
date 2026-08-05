import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListQuotes, useCreateQuote, useUpdateQuote, useDeleteQuote,
  useListCustomers, useUpdateCustomer, useCreateWorkOrder, useListEmployees,
  useListProducts,
  getListWorkOrdersQueryKey, getListCustomersQueryKey, getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, Pencil, Trash2, Printer, Wrench, Copy, Download, FileText, MoreHorizontal, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { makeEmpty, buildPayload, hasWorkOrderCustomer, type WOForm } from "@/components/work-order-form";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { BindCustomerDialog } from "@/components/bind-customer-dialog";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import {
  handlePdfAction,
  openLineShareText,
} from "@/components/pdf/pdf-service";
import { buildQuotationHtml } from "@/components/pdf/templates/QuotationTemplate";
import { computeQuoteAmounts } from "@/components/pdf/quote-amounts";
import { invalidateStatistics } from "@/lib/invalidateStatistics";
import {
  formatQuoteNumber,
  buildWorkOrderFormFromQuote,
  canConvertQuoteToWorkOrder,
  normalizeQuoteStatus,
  quoteHasLinkedWorkOrder,
} from "@/lib/quoteToWorkOrder";
import { PENDING_DISPATCH_BADGE, PENDING_DISPATCH_FILTER_ACTIVE } from "@/lib/dispatchPendingTheme";
import { VoiceAssistantButton } from "@/components/voice-assistant/VoiceAssistantDialog";
import { applyVoiceToQuoteForm } from "@/lib/voice/applyVoiceToQuote";
import type { VoiceAssistantApplyPayload } from "@/components/voice-assistant/types";

const AUTH_TOKEN_KEY = "erp_auth_token";

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

/** Compact icon action button — min 44×44 touch target on mobile. */
function QuoteIconButton({
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

// ── Constants ──────────────────────────────────────────────────────────────
const STATUSES = ["草稿", "已送出", "已成交", "已拒絕"];
/** Mutually exclusive quote list tabs — one quote appears in exactly one tab. */
const FILTER_TABS = ["草稿", "等待客戶回覆", "已成交待派工", "歷史紀錄"] as const;
type QuoteFilterTab = (typeof FILTER_TABS)[number];
const STATUS_COLORS: Record<string, string> = {
  "草稿": "bg-gray-100 text-gray-700",
  "已送出": "bg-blue-100 text-blue-700",
  "已成交": "bg-green-100 text-green-700",
  "已拒絕": "bg-red-100 text-red-700",
  "已取消": "bg-gray-100 text-gray-600",
  "已失效": "bg-gray-100 text-gray-600",
  "等待客戶回覆": "bg-blue-100 text-blue-700",
  "等待修改": "bg-blue-100 text-blue-700",
  "等待確認": "bg-blue-100 text-blue-700",
  "等待成交": "bg-blue-100 text-blue-700",
};
const DISPATCH_COLORS: Record<string, string> = {
  "未派工": "bg-slate-100 text-slate-600",
  "待派工": PENDING_DISPATCH_BADGE,
  "已派工": "bg-green-100 text-green-700",
  "施工中": "bg-blue-100 text-blue-700",
  "已完工": "bg-emerald-100 text-emerald-700",
};

const WAITING_CLIENT_STATUSES = new Set([
  "已送出",
  "等待客戶回覆",
  "等待修改",
  "等待確認",
  "等待成交",
]);
const DRAFT_STATUSES = new Set(["草稿", "尚未完成", "尚未送出"]);
const HISTORY_STATUSES = new Set(["已拒絕", "已取消", "已失效"]);

/**
 * Assign each quote to exactly one tab (priority: 歷史 → 已成交待派工／進行中 → 等待客戶 → 草稿).
 * Tab mapping may use dispatchStatus; action buttons must use quoteHasLinkedWorkOrder only.
 *
 * 進行中（「已成交待派工」分頁）：已成交＋待施工／已派工／施工中（含尚未派工）
 * 歷史紀錄：已成交＋已完工、已結案、以及拒絕／取消／失效
 */
function quoteCategory(q: any): QuoteFilterTab {
  const raw = String(q.status ?? "");
  const status = normalizeQuoteStatus(raw);
  const dispatchStatus = String(q.dispatchStatus ?? "");

  // 歷史紀錄 — 已完工／已結案／拒絕／取消／失效（不可因「已有派工單」或「已派工」誤判）
  if (
    HISTORY_STATUSES.has(raw) ||
    HISTORY_STATUSES.has(status) ||
    raw === "已結案" ||
    status === "已結案" ||
    (status === "已成交" && dispatchStatus === "已完工")
  ) {
    return "歷史紀錄";
  }

  // 進行中 — 已成交且尚未完工（待派工／待施工／已派工／施工中）
  if (status === "已成交") {
    return "已成交待派工";
  }

  // 等待客戶回覆
  if (WAITING_CLIENT_STATUSES.has(raw) || WAITING_CLIENT_STATUSES.has(status)) {
    return "等待客戶回覆";
  }

  // 草稿
  if (DRAFT_STATUSES.has(raw) || DRAFT_STATUSES.has(status) || !raw) {
    return "草稿";
  }

  return "草稿";
}

function quoteMatchesFilter(q: any, filter: QuoteFilterTab): boolean {
  return quoteCategory(q) === filter;
}

// ── Types ──────────────────────────────────────────────────────────────────
const UNITS = ["台", "式", "個", "組", "套", "次", "公尺", "公斤"];

type ItemInputMode = "catalog" | "manual";

interface QuoteItem {
  productId: number | null;
  inputMode: ItemInputMode;
  addToCatalog: boolean;
  category: string;
  itemName: string;
  brand: string;
  model: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  notes: string;
  sortOrder: number;
}
interface QuoteForm {
  customerId: number;
  customerName: string;
  contactPerson: string;
  customerPhone: string;
  address: string;
  title: string;
  description: string;
  taxType: string;
  salesRepId: number;
  status: string;
  notes: string;
  discountAmount: number;
  items: QuoteItem[];
}

const DEFAULT_ITEM = (): QuoteItem => ({
  productId: null, inputMode: "catalog", addToCatalog: false,
  category: "", itemName: "", brand: "", model: "",
  quantity: 1, unit: "台", unitPrice: 0, notes: "", sortOrder: 0,
});
const emptyForm = (): QuoteForm => ({
  customerId: 0, customerName: "", contactPerson: "", customerPhone: "",
  address: "", title: "", description: "", taxType: "未稅", salesRepId: 0,
  status: "草稿", notes: "", discountAmount: 0, items: [],
});

// ── Helpers ────────────────────────────────────────────────────────────────
function computeTotals(items: QuoteItem[], discountAmount: number, taxType: string) {
  const rawTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return computeQuoteAmounts(rawTotal, discountAmount, taxType);
}

function formToApi(f: QuoteForm) {
  const rawTotal = f.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discAmt = Math.max(0, f.discountAmount || 0);
  return {
    ...(f.customerId > 0 ? { customerId: f.customerId } : {}),
    customerName: f.customerName || undefined,
    contactPerson: f.contactPerson || undefined,
    title: f.title,
    description: f.description || undefined,
    amount: rawTotal,
    discountAmount: discAmt,
    finalAmount: Math.max(0, rawTotal - discAmt),
    status: f.status,
    notes: f.notes || undefined,
    address: f.address || undefined,
    customerPhone: f.customerPhone || undefined,
    taxType: f.taxType,
    ...(f.salesRepId > 0 ? { salesRepId: f.salesRepId } : {}),
    items: f.items.map((item, idx) => ({
      productId: item.productId ?? undefined,
      category: item.category || "其他",
      itemName: item.itemName,
      brand: item.brand || undefined,
      model: item.model || undefined,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      notes: item.notes || undefined,
      addToCatalog: item.inputMode === "manual" && !item.productId ? item.addToCatalog : undefined,
      sortOrder: idx,
    })),
  };
}

function quoteToForm(q: any): QuoteForm {
  return {
    customerId: q.customerId ?? 0,
    customerName: q.customerName ?? "",
    contactPerson: q.contactPerson ?? "",
    customerPhone: q.customerPhone ?? "",
    address: q.address ?? "",
    title: q.title ?? "",
    description: q.description ?? "",
    taxType: q.taxType ?? "未稅",
    salesRepId: q.salesRepId ?? 0,
    status: q.status ?? "草稿",
    notes: q.notes ?? "",
    discountAmount: Number(q.discountAmount ?? 0),
    items: (q.items ?? []).map((item: any, idx: number) => ({
      productId: item.productId ?? null,
      inputMode: item.productId != null ? "catalog" as const : "manual" as const,
      addToCatalog: false,
      category: item.category ?? "其他",
      itemName: item.itemName ?? "",
      brand: item.brand ?? "",
      model: item.model ?? "",
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? "台",
      unitPrice: Number(item.unitPrice ?? 0),
      notes: item.notes ?? "",
      sortOrder: idx,
    })),
  };
}

// ── Shared PDF helpers (client-side A4 html2pdf; same source for print / LINE / download) ──
function getQuoteNo(quote: any): string {
  return formatQuoteNumber(quote);
}

function buildLineShareMessage(quote: any, shareUrl: string): string {
  const quoteNo = getQuoteNo(quote);
  const name = quote.customerName || quote.title || "客戶";
  return [
    "【晟風工程報價單】",
    `客戶／案件：${name}`,
    `報價單號：${quoteNo}`,
    `案件：${quote.title || "—"}`,
    "",
    "查看報價單（無需登入）：",
    shareUrl,
  ].join("\n");
}

async function createQuoteShareUrl(quoteId: number): Promise<string> {
  const res = await authFetch(`/api/quotes/${quoteId}/share-link`, { method: "POST" });
  const ct = (res.headers.get("Content-Type") || "").toLowerCase();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      if (ct.includes("application/json")) {
        const data = await res.json();
        message = data?.message || data?.error || message;
      } else {
        const text = await res.text();
        if (ct.includes("text/html") || text.trimStart().startsWith("<!")) {
          message = "建立分享連結失敗：伺服器回傳 HTML 而非 JSON";
        } else if (text) message = text.slice(0, 200);
      }
    } catch { /* keep */ }
    throw new Error(message);
  }
  if (!ct.includes("application/json")) {
    throw new Error("建立分享連結失敗：回應不是 JSON");
  }
  const data = await res.json();
  if (!data?.url) throw new Error(data?.message || "未取得分享網址");
  return String(data.url);
}

async function printQuote(
  quote: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const quoteNo = getQuoteNo(quote);
  const html = buildQuotationHtml(quote);
  await handlePdfAction({
    html,
    docNo: quoteNo,
    filename: `報價單_${quoteNo}.pdf`,
    title: "晟風工程報價單",
    action: "print",
    setPdfPreview,
    toast,
    pageFormat: "a4",
  });
}

async function downloadQuotePdf(
  quote: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const quoteNo = getQuoteNo(quote);
  const html = buildQuotationHtml(quote);
  await handlePdfAction({
    html,
    docNo: quoteNo,
    filename: `報價單_${quoteNo}.pdf`,
    title: "晟風工程報價單",
    action: "download",
    setPdfPreview,
    toast,
    pageFormat: "a4",
  });
}

// ── ItemCard ───────────────────────────────────────────────────────────────
function ItemCard({ item, index, products, onChange, onDelete }: {
  item: QuoteItem; index: number; products: any[];
  onChange: (u: QuoteItem) => void; onDelete: () => void;
}) {
  const [productSearch, setProductSearch] = useState("");
  const productOptions = products ?? [];

  const filteredProducts = productOptions.filter((p: any) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.trim().toLowerCase();
    const hay = [p.brand, p.name, p.model, p.category, p.productNumber].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });

  function switchMode(mode: ItemInputMode) {
    if (mode === item.inputMode) return;
    if (mode === "catalog") {
      onChange({
        ...DEFAULT_ITEM(),
        inputMode: "catalog",
        sortOrder: item.sortOrder,
        quantity: item.quantity,
        notes: item.notes,
      });
    } else {
      onChange({
        ...item,
        inputMode: "manual",
        productId: null,
        addToCatalog: false,
      });
    }
  }

  function applyProduct(productId: number) {
    const found = productOptions.find((p: any) => p.id === productId);
    if (!found) return;
    const price = found.retailPrice != null ? parseFloat(found.retailPrice) : 0;
    onChange({
      ...item,
      inputMode: "catalog",
      productId: found.id,
      addToCatalog: false,
      category: found.category ?? "其他",
      itemName: found.name ?? "",
      brand: found.brand ?? "",
      model: found.model ?? "",
      unit: found.unit ?? "台",
      unitPrice: isNaN(price) ? 0 : price,
    });
  }

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-card/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">項目 {index + 1}</span>
        <div className="flex rounded-md border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => switchMode("catalog")}
            className={`px-2.5 py-1 font-medium transition-colors ${item.inputMode === "catalog" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            從商品管理
          </button>
          <button
            type="button"
            onClick={() => switchMode("manual")}
            className={`px-2.5 py-1 font-medium transition-colors ${item.inputMode === "manual" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            自行輸入
          </button>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground shrink-0" onClick={onDelete}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {item.inputMode === "catalog" ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">搜尋商品（工程報價）</Label>
            <Input
              className="h-8 text-xs"
              placeholder="搜尋品牌、品項、型號…"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
            />
          </div>
          {item.productId != null ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs bg-muted/30 rounded-md p-2">
              <div><span className="text-muted-foreground">品牌</span><p className="font-medium">{item.brand || "—"}</p></div>
              <div><span className="text-muted-foreground">品項</span><p className="font-medium">{item.itemName || "—"}</p></div>
              <div><span className="text-muted-foreground">型號</span><p className="font-medium">{item.model || "—"}</p></div>
              <div><span className="text-muted-foreground">單位</span><p className="font-medium">{item.unit || "—"}</p></div>
              <div><span className="text-muted-foreground">單價</span><p className="font-medium">NT${item.unitPrice.toLocaleString()}</p></div>
            </div>
          ) : (
            <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">找不到符合的商品，可改用「自行輸入」</p>
              ) : filteredProducts.slice(0, 20).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                  onClick={() => applyProduct(p.id)}
                >
                  <span className="font-medium">{[p.brand, p.name].filter(Boolean).join(" ")}</span>
                  {p.model && <span className="text-muted-foreground ml-1">· {p.model}</span>}
                  {p.retailPrice && <span className="float-right text-muted-foreground">NT${parseFloat(p.retailPrice).toLocaleString()}</span>}
                </button>
              ))}
            </div>
          )}
          {item.productId != null && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({ ...item, productId: null })}>
              重新選擇商品
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">品牌</Label>
              <Input className="h-8 text-xs" value={item.brand} onChange={e => onChange({ ...item, brand: e.target.value })} placeholder="品牌" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">品項 *</Label>
              <Input className="h-8 text-xs" value={item.itemName} onChange={e => onChange({ ...item, itemName: e.target.value })} placeholder="品項名稱" required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">型號</Label>
              <Input className="h-8 text-xs" value={item.model} onChange={e => onChange({ ...item, model: e.target.value })} placeholder="型號" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">單位</Label>
              <Select value={item.unit} onValueChange={v => onChange({ ...item, unit: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">單價</Label>
              <Input className="h-8 text-xs" type="number" min="0" value={item.unitPrice}
                onChange={e => onChange({ ...item, unitPrice: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={item.addToCatalog}
              onCheckedChange={v => onChange({ ...item, addToCatalog: v === true })}
            />
            加入商品管理（儲存報價時同步建立商品主檔，用途：工程報價）
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">數量</Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01" value={item.quantity}
            onChange={e => onChange({ ...item, quantity: parseFloat(e.target.value) || 0 })} />
        </div>
        {item.inputMode === "catalog" && (
          <div className="space-y-1">
            <Label className="text-xs">單價</Label>
            <Input className="h-8 text-sm" type="number" min="0" value={item.unitPrice}
              onChange={e => onChange({ ...item, unitPrice: parseFloat(e.target.value) || 0 })} />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">小計</Label>
          <div className="h-8 flex items-center px-2 bg-muted/50 rounded-md border text-xs font-semibold">
            NT${(item.quantity * item.unitPrice).toLocaleString()}
          </div>
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs">備註</Label>
          <Input className="h-8 text-xs" value={item.notes} onChange={e => onChange({ ...item, notes: e.target.value })} placeholder="選填" />
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function QuotesPage() {
  const [search] = useSearch();
  const navigate = useLocation()[1];
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [convertItem, setConvertItem] = useState<any>(null);
  const [bindQuoteForWo, setBindQuoteForWo] = useState<any>(null);
  const [form, setForm] = useState<QuoteForm>(emptyForm());
  const [woForm, setWoForm] = useState<WOForm>(makeEmpty());

  const [statusFilter, setStatusFilter] = useState<QuoteFilterTab>("等待客戶回覆");
  const [listSearch, setListSearch] = useState("");
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [lineFallback, setLineFallback] = useState<{ message: string; url: string } | null>(null);
  const openEditAfterCopyRef = useRef(false);

  const searchParams = new URLSearchParams(search);
  const filterCustomerName = searchParams.get("customer") || "";
  const focusQuoteId = parseInt(searchParams.get("focusId") ?? "0", 10) || null;

  const { data: quotes, isLoading } = useListQuotes();
  const { data: customers } = useListCustomers();
  const { data: employees } = useListEmployees();
  const { data: quoteProducts } = useListProducts({ usageType: "engineering_quote", isActive: "true" });
  const salesReps = employees?.filter((e: any) => e.position === "業務" && e.status !== "離職") ?? [];

  const updateCustomerMutation = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      },
    },
  });

  function handleCustomerChange(v: CustomerSelectorValue | null) {
    const linked = v?.customerId ? customers?.find((c: any) => c.id === v.customerId) : null;
    setForm(f => ({
      ...f,
      customerId: v?.customerId ?? 0,
      customerName: v?.name ?? "",
      contactPerson: v?.contactPerson ?? "",
      customerPhone: v?.phone ?? "",
      address: v?.address ?? "",
      salesRepId: f.salesRepId > 0 ? f.salesRepId : (linked?.primarySalesRepId ?? 0),
    }));
  }

  function handleConvertToFormal(newCustomer: { id: number; name: string }) {
    if (form.salesRepId <= 0) return;
    const existing = customers?.find((c: any) => c.id === newCustomer.id);
    if (existing?.primarySalesRepId) return;
    updateCustomerMutation.mutate({
      id: newCustomer.id,
      data: { primarySalesRepId: form.salesRepId } as any,
    });
  }

  const tabCounts = (() => {
    const counts: Record<QuoteFilterTab, number> = {
      草稿: 0,
      等待客戶回覆: 0,
      已成交待派工: 0,
      歷史紀錄: 0,
    };
    for (const q of quotes ?? []) {
      counts[quoteCategory(q)] += 1;
    }
    return counts;
  })();

  const filtered = (quotes ?? []).filter((q: any) => {
    if (!quoteMatchesFilter(q, statusFilter)) return false;
    if (filterCustomerName && !q.customerName?.toLowerCase().includes(filterCustomerName.toLowerCase())) return false;
    const qSearch = listSearch.trim().toLowerCase();
    if (qSearch) {
      const hay = [q.title, q.customerName, q.customerPhone, q.address, formatQuoteNumber(q)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(qSearch)) return false;
    }
    return true;
  });

  function startConvertToWorkOrder(q: any) {
    if (!q.customerId) {
      setBindQuoteForWo(q);
      return;
    }
    setConvertItem(q);
    setWoForm(buildWorkOrderFormFromQuote(q));
  }

  const invQuotes = () => invalidateStatistics(qc);
  const createMutation = useCreateQuote({
    mutation: {
      onSuccess: (created: any) => {
        invQuotes();
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setShowCreate(false);
        if (openEditAfterCopyRef.current && created?.id) {
          openEditAfterCopyRef.current = false;
          openEdit(created);
          toast({ title: "已建立複製草稿", description: "已開啟新草稿編輯" });
          return;
        }
        toast({ title: "報價單已新增" });
      },
      onError: (err: any) => {
        openEditAfterCopyRef.current = false;
        const msg = err?.response?.data?.error ?? err?.message ?? "建立失敗";
        toast({ title: "建立報價單失敗", description: msg, variant: "destructive" });
      },
    },
  });
  const updateMutation = useUpdateQuote({ mutation: { onSuccess: () => { invQuotes(); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); setEditItem(null); toast({ title: "報價單已更新" }); } } });
  const deleteMutation = useDeleteQuote({ mutation: { onSuccess: () => { invQuotes(); setDeleteId(null); toast({ title: "報價單已刪除" }); } } });
  const createWoMutation = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(qc);
        invQuotes();
        qc.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setConvertItem(null);
        toast({ title: "派工單建立成功" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "建立失敗，請稍後再試";
        toast({ title: "建立派工單失敗", description: msg, variant: "destructive" });
      },
    },
  });

  function handleCopy(q: any) {
    if (!window.confirm("確定複製此報價單並建立新草稿？")) return;
    const draft = {
      ...quoteToForm(q),
      title: `${q.title || "報價單"}（複製）`,
      status: "草稿",
    };
    openEditAfterCopyRef.current = true;
    createMutation.mutate({ data: formToApi(draft) as any });
  }

  function openEdit(q: any) { setForm(quoteToForm(q)); setEditItem(q); }

  async function runPdfAction(quoteId: number, fn: () => Promise<void>) {
    if (pdfBusyId != null) return;
    setPdfBusyId(quoteId);
    try {
      await fn();
    } finally {
      setPdfBusyId(null);
    }
  }

  async function shareQuoteViaLineWithFallback(q: any) {
    const quoteNo = getQuoteNo(q);
    toast({ title: "PDF 產生中…", description: "準備 LINE 分享內容" });
    let shareUrl = "";
    try {
      shareUrl = await createQuoteShareUrl(q.id);
    } catch (e: any) {
      toast({
        title: "無法建立公開分享連結",
        description: String(e?.message || e),
        variant: "destructive",
      });
      return;
    }

    const html = buildQuotationHtml(q);
    const blob = await handlePdfAction({
      html,
      docNo: quoteNo,
      filename: `報價單_${quoteNo}.pdf`,
      title: "晟風工程報價單",
      action: "preview",
      setPdfPreview,
      toast,
      pageFormat: "a4",
    });
    if (!blob) return;

    const message = buildLineShareMessage(q, shareUrl);
    const win = openLineShareText(message);
    if (win) {
      toast({ title: "已開啟 LINE 分享", description: "分享內容含報價單公開連結" });
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
      setLineFallback({ message, url: shareUrl });
      toast({ title: "已複製分享連結", description: "可再點「開啟 LINE」" });
    } catch {
      setLineFallback({ message, url: shareUrl });
      toast({ title: "請手動開啟 LINE", description: shareUrl, variant: "destructive" });
    }
  }

  function handleVoiceApply({ parsed }: VoiceAssistantApplyPayload) {
    if (parsed.formType !== "quote") return;
    setForm(applyVoiceToQuoteForm(emptyForm, parsed));
    setEditItem(null);
    setShowCreate(true);
  }

  useEffect(() => {
    if (!focusQuoteId || !quotes?.length) return;
    const q = quotes.find((x: any) => x.id === focusQuoteId);
    if (q) openEdit(q);
  }, [focusQuoteId, quotes]);

  function addItem() { setForm(f => ({ ...f, items: [...f.items, { ...DEFAULT_ITEM(), sortOrder: f.items.length }] })); }
  function removeItem(idx: number) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }
  function updateItem(idx: number, updated: QuoteItem) { setForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? updated : item) })); }

  function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!convertItem) return;
    if (!convertItem.customerId && !woForm.customerId) {
      setConvertItem(null);
      setBindQuoteForWo(convertItem);
      return;
    }
    if (!hasWorkOrderCustomer(woForm)) {
      toast({ title: "請綁定正式客戶", variant: "destructive" });
      return;
    }
    const payload = buildPayload({
      ...woForm,
      customerMode: "existing",
      customerId: woForm.customerId || convertItem.customerId,
      customerName: woForm.customerName || convertItem.customerName || "",
      mobilePhone: woForm.mobilePhone || convertItem.customerPhone || "",
      installAddress: woForm.installAddress || convertItem.address || "",
    });
    createWoMutation.mutate({ data: payload });
  }

  const { rawTotal, preTax, taxAmt, total } = computeTotals(form.items, form.discountAmount, form.taxType);

  const closeDialog = () => { if (editItem) setEditItem(null); else setShowCreate(false); };
  const dialogOpen = showCreate || !!editItem;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">報價單管理</h1><p className="text-sm text-muted-foreground mt-0.5">管理所有客戶報價單</p></div>
        <div className="flex items-center gap-2">
          <VoiceAssistantButton formType="quote" onApply={handleVoiceApply} />
          <Button size="sm" onClick={() => { setForm(emptyForm()); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增報價單</Button>
        </div>
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/quotes")}>
            <X className="h-3 w-3" />清除
          </button>
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Input
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
          placeholder="搜尋報價單、客戶、電話…"
          className="h-10"
        />
      </div>

      {/* Status filter — horizontal scroll; counts from mutually exclusive mapping */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {FILTER_TABS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === s
                ? s === "已成交待派工"
                  ? PENDING_DISPATCH_FILTER_ACTIVE
                  : "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}>
            {s} ({tabCounts[s]})
          </button>
        ))}
      </div>

      {/* List — single column cards */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 max-w-3xl">
          {filtered.map(q => {
            const qItems = (q.items ?? []) as any[];
            const qRaw = qItems.length > 0 ? qItems.reduce((s: number, i: any) => s + Number(i.subtotal ?? 0), 0) : Number(q.finalAmount ?? q.amount ?? 0);
            const qDisc = Number(q.discountAmount ?? 0);
            const { total: qTotal } = computeQuoteAmounts(qRaw, qDisc, q.taxType ?? "未稅");
            const hasWo = quoteHasLinkedWorkOrder(q);
            const canCreateWo = canConvertQuoteToWorkOrder(q);
            const canEdit = !HISTORY_STATUSES.has(normalizeQuoteStatus(q.status)) && !HISTORY_STATUSES.has(String(q.status ?? ""));
            const canVoid = canEdit && !hasWo;
            return (
              <Card key={q.id}>
                <CardContent className="p-3 sm:p-4 space-y-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{q.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[normalizeQuoteStatus(q.status)] ?? STATUS_COLORS[String(q.status)] ?? "bg-gray-100 text-gray-700"}`}>{normalizeQuoteStatus(q.status)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${DISPATCH_COLORS[q.dispatchStatus ?? "未派工"] ?? "bg-slate-100 text-slate-600"}`}>
                      {q.dispatchStatus === "待派工" ? "● " : ""}{q.dispatchStatus ?? "未派工"}
                    </span>
                    {hasWo && q.workOrderNumber && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono">{q.workOrderNumber}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                    {q.customerName && <span>{q.customerName}</span>}
                    {q.customerPhone && <span>{q.customerPhone}</span>}
                    {q.salesRepName && <span>業務：{q.salesRepName}</span>}
                    <span>含稅 NT${qTotal.toLocaleString()}</span>
                  </div>
                  {q.address && <div className="text-xs text-muted-foreground">{q.address}</div>}

                  {/* Compact action bar: 查看 + icon ops; ⋯ for rare/dangerous */}
                  <TooltipProvider delayDuration={300}>
                    <div className="flex flex-col gap-2">
                      {(canCreateWo || hasWo) && (
                        <div className="flex flex-wrap gap-2">
                          {canCreateWo && (
                            <Button
                              size="sm"
                              className="h-10 sm:h-9 w-auto px-3"
                              onClick={() => startConvertToWorkOrder(q)}
                            >
                              <Wrench className="h-4 w-4 mr-1" />建立派工單
                            </Button>
                          )}
                          {hasWo && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 sm:h-9 w-auto px-3"
                              onClick={() =>
                                navigate(
                                  q.workOrderId
                                    ? `/work-orders?highlight=${q.workOrderId}`
                                    : "/work-orders",
                                )
                              }
                            >
                              <FileText className="h-4 w-4 mr-1" />查看派工單
                            </Button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-11 sm:h-9 w-auto px-3 shrink-0"
                          onClick={() => openEdit(q)}
                          title="查看案件"
                          aria-label="查看案件"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          <span className="sm:hidden">查看</span>
                          <span className="hidden sm:inline">查看案件</span>
                        </Button>

                        <QuoteIconButton
                          label={pdfBusyId === q.id ? "PDF 產生中…" : "列印報價單"}
                          disabled={pdfBusyId != null}
                          onClick={() =>
                            void runPdfAction(q.id, () => printQuote(q, setPdfPreview, toast as any))
                          }
                        >
                          <Printer className="h-4 w-4" />
                        </QuoteIconButton>

                        <QuoteIconButton
                          label={pdfBusyId === q.id ? "PDF 產生中…" : "LINE 分享報價單"}
                          disabled={pdfBusyId != null}
                          className="border-[#06C755]/40"
                          onClick={() =>
                            void runPdfAction(q.id, () => shareQuoteViaLineWithFallback(q))
                          }
                        >
                          <LineGlyph className="h-5 w-5 px-0.5" />
                        </QuoteIconButton>

                        <QuoteIconButton
                          label="複製報價單"
                          disabled={createMutation.isPending}
                          onClick={() => handleCopy(q)}
                        >
                          <Copy className="h-4 w-4" />
                        </QuoteIconButton>

                        {canEdit && (
                          <QuoteIconButton label="編輯報價單" onClick={() => openEdit(q)}>
                            <Pencil className="h-4 w-4" />
                          </QuoteIconButton>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title="更多操作"
                              aria-label="更多操作"
                              className="inline-flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={pdfBusyId != null}
                              onClick={() =>
                                void runPdfAction(q.id, () =>
                                  downloadQuotePdf(q, setPdfPreview, toast as any),
                                )
                              }
                            >
                              <Download className="h-3.5 w-3.5 mr-2" />下載 PDF
                            </DropdownMenuItem>
                            {canVoid && (
                              <DropdownMenuItem
                                onClick={() => {
                                  if (!window.confirm("確定作廢此報價單？作廢後將移至歷史紀錄。")) return;
                                  updateMutation.mutate({
                                    id: q.id,
                                    data: { status: "已失效" } as any,
                                  });
                                }}
                              >
                                <X className="h-3.5 w-3.5 mr-2" />作廢
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteId(q.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />刪除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </TooltipProvider>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">{`目前無「${statusFilter}」的報價單`}</p></CardContent></Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => !open && closeDialog()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "編輯報價單" : "新增報價單"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            const invalidManual = form.items.some(
              it => it.inputMode === "manual" && !it.itemName.trim(),
            );
            if (invalidManual) {
              toast({ title: "請填寫自行輸入項目的品項名稱", variant: "destructive" });
              return;
            }
            const data = formToApi(form) as any;
            if (editItem) updateMutation.mutate({ id: editItem.id, data });
            else createMutation.mutate({ data });
          }} className="space-y-4">

            {/* Section: 客戶資訊 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1">客戶資訊</h3>
              <div className="space-y-1.5">
                <Label>客戶</Label>
                <CustomerSelector
                  allowTemp={true}
                  convertPrimarySalesRepId={form.salesRepId > 0 ? form.salesRepId : undefined}
                  onConvertToFormal={handleConvertToFormal}
                  value={
                    form.customerId > 0 ? {
                      type: "linked", customerId: form.customerId,
                      name: form.customerName || `客戶 #${form.customerId}`,
                      contactPerson: form.contactPerson, phone: form.customerPhone,
                      mobile: "", address: form.address, taxId: "",
                    } : form.customerName ? {
                      type: "temp", customerId: null, name: form.customerName,
                      contactPerson: form.contactPerson, phone: form.customerPhone,
                      mobile: "", address: form.address, taxId: "",
                    } : null
                  }
                  onChange={handleCustomerChange}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>聯絡電話</Label>
                  <Input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="自動帶入或手動填寫" />
                </div>
                <div className="space-y-1.5">
                  <Label>聯絡人</Label>
                  <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="聯絡人姓名" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>施工地址</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="自動帶入或手動填寫" />
              </div>
            </div>

            {/* Section: 工程資訊 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1">工程資訊</h3>
              <div className="space-y-1.5">
                <Label>工程名稱 *</Label>
                <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例：台中南屯冷氣安裝工程" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>負責業務</Label>
                  <Select value={String(form.salesRepId)} onValueChange={v => setForm(f => ({ ...f, salesRepId: parseInt(v, 10) }))}>
                    <SelectTrigger><SelectValue placeholder="選擇業務" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">（不指定）</SelectItem>
                      {salesReps?.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>稅別</Label>
                  <Select value={form.taxType} onValueChange={v => setForm(f => ({ ...f, taxType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未稅">○ 未稅（加計 5% 稅額）</SelectItem>
                      <SelectItem value="含稅">○ 含稅（已含 5% 稅額）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>狀態</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section: 工程項目 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b pb-1">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">工程項目</h3>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" />新增項目
                </Button>
              </div>
              {form.items.length === 0 ? (
                <div className="border border-dashed rounded-lg py-8 text-center text-muted-foreground text-sm">
                  <p>尚未新增工程項目</p>
                  <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />新增第一項</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <ItemCard key={idx} item={item} index={idx} products={quoteProducts ?? []}
                      onChange={updated => updateItem(idx, updated)}
                      onDelete={() => removeItem(idx)} />
                  ))}
                </div>
              )}

              {/* Discount + Totals */}
              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-20 text-right flex-shrink-0">折扣</Label>
                    <Input className="h-7 text-sm text-right" type="number" min={0} step="1" value={form.discountAmount}
                      placeholder="0"
                      onChange={e => {
                        const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        setForm(f => ({ ...f, discountAmount: Number.isFinite(v) ? Math.max(0, v) : 0 }));
                      }} />
                  </div>
                  <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground"><span>項目小計</span><span>NT$ {rawTotal.toLocaleString()}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>折扣</span><span>{form.discountAmount > 0 ? `－ NT$ ${form.discountAmount.toLocaleString()}` : `NT$ 0`}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>未稅小計</span><span>NT$ {preTax.toLocaleString()}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>稅額 5%</span><span>NT$ {taxAmt.toLocaleString()}</span></div>
                    <div className="flex justify-between font-bold border-t pt-1 text-sm">
                      <span>含稅總計</span><span>NT$ {total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: 備註 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1">說明與備註</h3>
              <div className="space-y-1.5">
                <Label>施工說明</Label>
                <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="施工方式、施工天數、注意事項…" />
              </div>
              <div className="space-y-1.5">
                <Label>備註 <span className="text-muted-foreground text-xs">（保固說明、其他約定事項等）</span></Label>
                <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="保固說明、付款條件、其他約定…" />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to Work Order */}
      {convertItem && (
        <Dialog open onOpenChange={() => setConvertItem(null)}>
          <DialogContent className="max-w-lg w-[calc(100vw-1rem)]">
            <DialogHeader><DialogTitle>由報價單建立派工單</DialogTitle></DialogHeader>
            <form
              onSubmit={handleConvert}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <DialogBody className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                  <p className="font-mono text-xs text-muted-foreground">{formatQuoteNumber(convertItem)}</p>
                  <p className="font-semibold">{convertItem.title}</p>
                  <div className="rounded-md border bg-background p-2 space-y-1">
                    <p className="text-xs font-medium text-foreground">已綁定客戶</p>
                    <p className="text-sm font-medium">{convertItem.customerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{convertItem.customerPhone ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{convertItem.address ?? "—"}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1 h-8"
                      onClick={() => {
                        setBindQuoteForWo(convertItem);
                        setConvertItem(null);
                      }}
                    >
                      更換客戶
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>聯絡人：{convertItem.contactPerson ?? "—"} · 業務：{convertItem.salesRepName ?? "—"}</p>
                    {convertItem.description && <p>服務內容：{convertItem.description}</p>}
                    {(convertItem.items ?? []).length > 0 && (
                      <ul className="list-disc pl-4 mt-1">
                        {(convertItem.items as any[]).map((it: any, i: number) => (
                          <li key={i}>
                            {it.category} / {it.brand || "—"} / {it.itemName || it.model || "—"}
                            {it.model && it.itemName && it.model !== it.itemName ? `（${it.model}）` : ""}
                            {" "}×{it.quantity}{it.unit}
                            {it.notes ? ` — ${it.notes}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">客戶與設備將帶入派工單，僅需確認施工排程（選填）。</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>預定施工日</Label>
                    <Input type="date" value={woForm.scheduledDate} onChange={e => setWoForm(f => ({ ...f, scheduledDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>預定時間</Label>
                    <Input value={woForm.scheduledTime} onChange={e => setWoForm(f => ({ ...f, scheduledTime: e.target.value }))} placeholder="例：09:00" />
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConvertItem(null)}>取消</Button>
                <Button type="submit" disabled={createWoMutation.isPending}><Wrench className="h-3.5 w-3.5 mr-1" />建立派工單</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <BindCustomerDialog
        open={!!bindQuoteForWo}
        onOpenChange={(o) => { if (!o) setBindQuoteForWo(null); }}
        title="此報價單尚未綁定正式客戶"
        description="請搜尋既有客戶或建立新客戶後，才可建立派工單。"
        initial={bindQuoteForWo ? {
          name: bindQuoteForWo.customerName ?? "",
          mobile: bindQuoteForWo.customerPhone ?? "",
          address: bindQuoteForWo.address ?? "",
          contactPerson: bindQuoteForWo.contactPerson ?? "",
        } : null}
        confirmLabel="綁定並建立派工"
        pending={updateMutation.isPending}
        onConfirm={(v) => {
          if (!bindQuoteForWo || !v.customerId) return;
          updateMutation.mutate(
            {
              id: bindQuoteForWo.id,
              data: {
                customerId: v.customerId,
                customerName: v.name,
                customerPhone: v.mobile || v.phone || bindQuoteForWo.customerPhone,
                address: v.address || bindQuoteForWo.address,
                contactPerson: v.contactPerson || bindQuoteForWo.contactPerson,
              } as any,
            },
            {
              onSuccess: () => {
                const next = {
                  ...bindQuoteForWo,
                  customerId: v.customerId,
                  customerName: v.name,
                  customerPhone: v.mobile || v.phone || bindQuoteForWo.customerPhone,
                  address: v.address || bindQuoteForWo.address,
                  contactPerson: v.contactPerson || bindQuoteForWo.contactPerson,
                };
                setBindQuoteForWo(null);
                setConvertItem(next);
                setWoForm(buildWorkOrderFormFromQuote(next));
                toast({ title: "客戶已綁定" });
              },
            },
          );
        }}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除這筆報價單嗎？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Preview */}
      {pdfPreview && (
        <PdfPreviewDialog
          open={!!pdfPreview}
          onClose={() => setPdfPreview(null)}
          pdfUrl={pdfPreview.url}
          filename={pdfPreview.filename}
        />
      )}

      {/* LINE share fallback when URL scheme blocked */}
      <AlertDialog open={!!lineFallback} onOpenChange={(open) => !open && setLineFallback(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>已複製分享連結</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">無法直接開啟 LINE 時，請貼到對話中，或點下方按鈕再開一次。</span>
              {lineFallback?.url && (
                <span className="block break-all text-xs text-muted-foreground">{lineFallback.url}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>關閉</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (lineFallback?.message) openLineShareText(lineFallback.message);
              }}
            >
              開啟 LINE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
