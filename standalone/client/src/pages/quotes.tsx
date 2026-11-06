import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListQuotes, useCreateQuote, useUpdateQuote, useDeleteQuote,
  useListCustomers, useUpdateCustomer, useListEmployees,
  useListProducts,
  getListWorkOrdersQueryKey, getListCustomersQueryKey, getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, Pencil, Trash2, Printer, Copy, Download, FileText, MoreHorizontal, Eye, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import {
  openLineShareText,
} from "@/components/pdf/pdf-service";
import { computeQuoteAmounts } from "@/components/pdf/quote-amounts";
import {
  getQuoteNo,
  loadQuoteForDocument,
  printQuoteDocument,
  downloadQuoteDocument,
  previewQuoteDocument,
} from "@/lib/quotationPdf";
import { invalidateStatistics } from "@/lib/invalidateStatistics";
import {
  formatQuoteNumber,
  canWinQuoteAndCreateWorkOrder,
  quoteHasLinkedWorkOrder,
  quoteListTab,
  quoteStatusLabel,
  isQuoteWon,
} from "@/lib/quoteToWorkOrder";
import { QUOTE_LOST_REASONS } from "../../../shared/quoteStatus.ts";
import { VoiceAssistantButton } from "@/components/voice-assistant/VoiceAssistantDialog";
import { applyVoiceToQuoteForm } from "@/lib/voice/applyVoiceToQuote";
import type { VoiceAssistantApplyPayload } from "@/components/voice-assistant/types";
import {
  displayQuoteItemBrand,
  displayQuoteItemCategory,
  normalizeQuoteItemCategoryBrand,
  QUOTE_CATEGORY_SUGGESTIONS,
} from "../../../shared/quoteItemDisplay";
import {
  QUOTE_WORKFLOW_STAGES,
  normalizeQuoteDocumentType,
  quoteDocumentTypeLabel,
  type QuoteDocumentType,
} from "../../../shared/quoteIntentLogic.ts";

export const QUOTE_INTENT_ESIGN_RELEASE_MARKER = "quote-intent-esign-dispatch-v1";

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
const FILTER_TABS = ["尚未成交", "已成交", "未成交"] as const;
type QuoteFilterTab = (typeof FILTER_TABS)[number];
const LIST_PAGE_SIZE = 10;
const STATUS_COLORS: Record<string, string> = {
  "客戶確認中": "bg-sky-100 text-sky-800",
  "尚未成交": "bg-sky-100 text-sky-800",
  "已成交": "bg-emerald-100 text-emerald-800",
  "未成交": "bg-slate-100 text-slate-600",
  "草稿": "bg-gray-100 text-gray-700",
  "已傳送": "bg-blue-100 text-blue-800",
  "待客戶選擇": "bg-amber-100 text-amber-800",
  "待客戶確認": "bg-sky-100 text-sky-800",
  "已確認": "bg-emerald-100 text-emerald-800",
  "待安排派工": "bg-purple-100 text-purple-800",
  "已派工": "bg-indigo-100 text-indigo-800",
  "已取消": "bg-slate-100 text-slate-600",
};

const ROOM_GROUP_SUGGESTIONS = [
  "客廳方案",
  "主臥室方案",
  "次臥室方案",
  "書房方案",
  "孝親房方案",
  "餐廳方案",
  "全室冷氣方案",
] as const;

function quoteCategory(q: any): QuoteFilterTab {
  return quoteListTab(q.status);
}

function quoteMatchesFilter(q: any, filter: QuoteFilterTab): boolean {
  return quoteCategory(q) === filter;
}

function workOrderEditPath(workOrderId: number | string | null | undefined): string {
  const id = workOrderId != null ? Number(workOrderId) : NaN;
  if (Number.isFinite(id) && id > 0) return `/work-orders?edit=${id}`;
  return "/work-orders";
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
  installFee: number;
  notes: string;
  workContent: string;
  optionGroupId: string;
  optionGroupName: string;
  isRequiredGroup: boolean;
  selectionMode: "single" | "multiple" | "fixed";
  sortOrder: number;
}
interface QuoteForm {
  documentType: QuoteDocumentType;
  workflowStage: string;
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

const DEFAULT_ITEM = (docType: QuoteDocumentType = "formal"): QuoteItem => ({
  productId: null, inputMode: "catalog", addToCatalog: false,
  category: docType === "intent" ? "裝新機" : "", itemName: "", brand: "", model: "",
  quantity: 1, unit: "台", unitPrice: 0, installFee: 0,
  notes: "", workContent: "",
  optionGroupId: docType === "intent" ? "客廳方案" : "",
  optionGroupName: docType === "intent" ? "客廳方案" : "",
  isRequiredGroup: true,
  selectionMode: docType === "intent" ? "single" : "fixed",
  sortOrder: 0,
});
const emptyForm = (docType: QuoteDocumentType = "formal"): QuoteForm => ({
  documentType: docType,
  workflowStage: docType === "intent" ? "待客戶選擇" : "待客戶確認",
  customerId: 0, customerName: "", contactPerson: "", customerPhone: "",
  address: "", title: "", description: "", taxType: "不另加稅", salesRepId: 0,
  status: "客戶確認中", notes: "", discountAmount: 0, items: [],
});

// ── Helpers ────────────────────────────────────────────────────────────────
function computeTotals(items: QuoteItem[], discountAmount: number, taxType: string) {
  const rawTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice + Math.max(0, i.installFee || 0), 0);
  return computeQuoteAmounts(rawTotal, discountAmount, taxType);
}

function formToApi(f: QuoteForm) {
  const rawTotal = f.items.reduce((s, i) => s + i.quantity * i.unitPrice + Math.max(0, i.installFee || 0), 0);
  const discAmt = Math.max(0, f.discountAmount || 0);
  return {
    ...(f.customerId > 0 ? { customerId: f.customerId } : {}),
    documentType: f.documentType,
    workflowStage: f.workflowStage || (f.documentType === "intent" ? "待客戶選擇" : "待客戶確認"),
    customerName: f.customerName || undefined,
    contactPerson: f.contactPerson || undefined,
    title: f.title,
    description: f.description || undefined,
    amount: rawTotal,
    discountAmount: discAmt,
    finalAmount: Math.max(0, rawTotal - discAmt),
    notes: f.notes || undefined,
    address: f.address || undefined,
    customerPhone: f.customerPhone || undefined,
    taxType: f.taxType,
    ...(f.salesRepId > 0 ? { salesRepId: f.salesRepId } : {}),
    items: f.items.map((item, idx) => {
      const { category, brand } = normalizeQuoteItemCategoryBrand(item);
      const groupName = (item.optionGroupName || item.optionGroupId || "").trim();
      return {
        productId: item.productId ?? undefined,
        category,
        itemName: item.itemName,
        brand: brand || undefined,
        model: item.model || undefined,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        installFee: f.documentType === "intent" ? Math.max(0, item.installFee || 0) : 0,
        notes: item.notes || undefined,
        workContent: f.documentType === "intent" ? (item.workContent || undefined) : undefined,
        optionGroupId: f.documentType === "intent" ? (groupName || undefined) : undefined,
        optionGroupName: f.documentType === "intent" ? (groupName || undefined) : undefined,
        isRequiredGroup: f.documentType === "intent" ? item.isRequiredGroup : true,
        selectionMode: f.documentType === "intent" ? item.selectionMode : "fixed",
        addToCatalog: item.inputMode === "manual" && !item.productId ? item.addToCatalog : undefined,
        sortOrder: idx,
      };
    }),
  };
}

function quoteToForm(q: any): QuoteForm {
  const docType = normalizeQuoteDocumentType(q.documentType);
  return {
    documentType: docType,
    workflowStage: q.workflowStage || (docType === "intent" ? "待客戶選擇" : "待客戶確認"),
    customerId: q.customerId ?? 0,
    customerName: q.customerName ?? "",
    contactPerson: q.contactPerson ?? "",
    customerPhone: q.customerPhone ?? "",
    address: q.address ?? "",
    title: q.title ?? "",
    description: q.description ?? "",
    taxType: q.taxType ?? "未稅",
    salesRepId: q.salesRepId ?? 0,
    status: quoteStatusLabel(q.status),
    notes: q.notes ?? "",
    discountAmount: Number(q.discountAmount ?? 0),
    items: (q.items ?? []).map((item: any, idx: number) => ({
      productId: item.productId ?? null,
      inputMode: item.productId != null ? "catalog" as const : "manual" as const,
      addToCatalog: false,
      category: item.category && item.category !== "其他" ? item.category : "",
      itemName: item.itemName ?? "",
      brand: item.brand ?? "",
      model: item.model ?? "",
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? "台",
      unitPrice: Number(item.unitPrice ?? 0),
      installFee: Number(item.installFee ?? 0),
      notes: item.notes ?? "",
      workContent: item.workContent ?? "",
      optionGroupId: item.optionGroupId ?? item.optionGroupName ?? (docType === "intent" ? "客廳方案" : ""),
      optionGroupName: item.optionGroupName ?? item.optionGroupId ?? (docType === "intent" ? "客廳方案" : ""),
      isRequiredGroup: item.isRequiredGroup !== false,
      selectionMode: (item.selectionMode === "multiple" || item.selectionMode === "fixed" ? item.selectionMode : "single"),
      sortOrder: idx,
    })),
  };
}

function buildLineShareMessage(quote: any, shareUrl: string): string {
  const quoteNo = getQuoteNo(quote);
  const name = quote.customerName || quote.title || "客戶";
  const isIntent = normalizeQuoteDocumentType(quote.documentType) === "intent";
  return [
    isIntent ? "【晟風工程｜冷氣工程意向選擇單】" : "【晟風工程報價單】",
    `客戶／案件：${name}`,
    `單號：${quoteNo}`,
    `案件：${quote.title || "—"}`,
    "",
    isIntent
      ? "請點選下方連結選擇您偏好的品牌與機型方案（無需登入）："
      : "查看報價單並可線上確認簽名（無需登入）：",
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

// ── ItemCard ───────────────────────────────────────────────────────────────
function ItemCard({
  item,
  index,
  products,
  documentType,
  onChange,
  onDelete,
  onCloneInGroup,
}: {
  item: QuoteItem;
  index: number;
  products: any[];
  documentType: QuoteDocumentType;
  onChange: (u: QuoteItem) => void;
  onDelete: () => void;
  onCloneInGroup?: () => void;
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
        ...DEFAULT_ITEM(documentType),
        inputMode: "catalog",
        sortOrder: item.sortOrder,
        quantity: item.quantity,
        notes: item.notes,
        optionGroupId: item.optionGroupId,
        optionGroupName: item.optionGroupName,
        isRequiredGroup: item.isRequiredGroup,
        selectionMode: item.selectionMode,
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
    const mapped = normalizeQuoteItemCategoryBrand({
      category: found.category ?? "",
      brand: found.brand ?? "",
    });
    onChange({
      ...item,
      inputMode: "catalog",
      productId: found.id,
      addToCatalog: false,
      category: mapped.category === "其他" ? "" : mapped.category,
      itemName: found.name ?? "",
      brand: mapped.brand,
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs">類別</Label>
          <Input
            className="h-8 text-xs"
            list={`quote-item-category-suggestions-${index}`}
            value={item.category === "其他" ? "" : item.category}
            onChange={e => onChange({ ...item, category: e.target.value })}
            placeholder="可選或自行輸入"
          />
          <datalist id={`quote-item-category-suggestions-${index}`}>
            {QUOTE_CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        {documentType === "intent" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">房間／選擇群組名稱 *</Label>
              <Input
                className="h-8 text-xs"
                list={`room-group-suggestions-${index}`}
                value={item.optionGroupName}
                onChange={e => onChange({ ...item, optionGroupName: e.target.value, optionGroupId: e.target.value })}
                placeholder="例：客廳方案、主臥室方案"
              />
              <datalist id={`room-group-suggestions-${index}`}>
                {ROOM_GROUP_SUGGESTIONS.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">群組選擇方式</Label>
              <Select
                value={item.selectionMode}
                onValueChange={v => onChange({ ...item, selectionMode: v as "single" | "multiple" | "fixed" })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">單選方案（同群組多選一）</SelectItem>
                  <SelectItem value="multiple">可複選方案</SelectItem>
                  <SelectItem value="fixed">固定必含施工項目</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {documentType === "intent" && item.selectionMode !== "fixed" && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50/70 border border-amber-200/80 rounded-md px-2.5 py-1.5 text-xs">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-amber-900">
            <Checkbox
              checked={item.isRequiredGroup}
              onCheckedChange={v => onChange({ ...item, isRequiredGroup: v === true })}
            />
            此群組為客戶必選項目
          </label>
          {onCloneInGroup && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-amber-300 bg-white" onClick={onCloneInGroup}>
              ＋同群組新增另一品牌候選方案
            </Button>
          )}
        </div>
      )}

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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-muted/30 rounded-md p-2">
              <div><span className="text-muted-foreground">類別</span><p className="font-medium">{displayQuoteItemCategory(item)}</p></div>
              <div><span className="text-muted-foreground">品牌</span><p className="font-medium">{displayQuoteItemBrand(item)}</p></div>
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
              <Input className="h-8 text-xs" value={item.brand} onChange={e => onChange({ ...item, brand: e.target.value })} placeholder="大金、日立… 沒有可留空" />
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
            NT${(item.quantity * item.unitPrice + Math.max(0, item.installFee || 0)).toLocaleString()}
          </div>
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs">備註</Label>
          <Input className="h-8 text-xs" value={item.notes} onChange={e => onChange({ ...item, notes: e.target.value })} placeholder="選填" />
        </div>
      </div>

      {documentType === "intent" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-dashed">
          <div className="space-y-1">
            <Label className="text-xs">方案安裝／施工費（選填）</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              min="0"
              value={item.installFee || 0}
              onChange={e => onChange({ ...item, installFee: parseFloat(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">此方案施工內容說明（選填）</Label>
            <Input
              className="h-8 text-xs"
              value={item.workContent}
              onChange={e => onChange({ ...item, workContent: e.target.value })}
              placeholder="例：含基本銅管 5 米、標準室外機架、排水配管"
            />
          </div>
        </div>
      )}
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
  const [lostQuote, setLostQuote] = useState<any>(null);
  const [lostReason, setLostReason] = useState<string>("價格因素");
  const [lostDetail, setLostDetail] = useState("");
  const [form, setForm] = useState<QuoteForm>(emptyForm());
  const [winningId, setWinningId] = useState<number | null>(null);
  const [cancelWinQuote, setCancelWinQuote] = useState<any>(null);
  const [cancelingWin, setCancelingWin] = useState(false);
  const [markingLost, setMarkingLost] = useState(false);

  const [statusFilter, setStatusFilter] = useState<QuoteFilterTab>("尚未成交");
  const [docTypeFilter, setDocTypeFilter] = useState<"all" | "formal" | "intent">("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [creatingRevision, setCreatingRevision] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listPage, setListPage] = useState(1);
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
      尚未成交: 0,
      已成交: 0,
      未成交: 0,
    };
    for (const q of quotes ?? []) {
      counts[quoteCategory(q)] += 1;
    }
    return counts;
  })();

  const filtered = (quotes ?? [])
    .filter((q: any) => {
      if (!quoteMatchesFilter(q, statusFilter)) return false;
      if (docTypeFilter !== "all" && normalizeQuoteDocumentType(q.documentType) !== docTypeFilter) return false;
      if (stageFilter !== "all" && (q.workflowStage || "") !== stageFilter) return false;
      if (filterCustomerName && !q.customerName?.toLowerCase().includes(filterCustomerName.toLowerCase())) return false;
      const qSearch = listSearch.trim().toLowerCase();
      if (qSearch) {
        const hay = [q.title, q.customerName, q.customerPhone, q.address, formatQuoteNumber(q), q.workflowStage]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(qSearch)) return false;
      }
      return true;
    })
    .slice()
    .sort((a: any, b: any) => {
      // 報價日期＝createdAt：新→舊；同時間再依 id DESC
      const ca = a.createdAt ? String(a.createdAt) : "";
      const cb = b.createdAt ? String(b.createdAt) : "";
      if (ca !== cb) return cb.localeCompare(ca);
      return (b.id ?? 0) - (a.id ?? 0);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const currentPage = Math.min(listPage, totalPages);
  const paged = filtered.slice(
    (currentPage - 1) * LIST_PAGE_SIZE,
    currentPage * LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setListPage(1);
  }, [statusFilter, docTypeFilter, stageFilter, listSearch, filterCustomerName]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  async function winQuoteAndDispatch(q: any) {
    if (!q?.id || winningId != null) return;
    setWinningId(q.id);
    try {
      const res = await authFetch(`/api/quotes/${q.id}/win-and-dispatch`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `成交失敗（HTTP ${res.status}）`);
      }
      invQuotes();
      qc.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
      setEditItem(null);
      toast({
        title: data.created === false ? "已成交，已關聯原派工單" : "已成交，派工單已建立",
        description: data.workOrderNumber
          ? `派工單 ${data.workOrderNumber}${data.created === false ? "" : "，施工日期待安排"}`
          : "請補施工日期與人員",
      });
      if (data.workOrderId) navigate(workOrderEditPath(data.workOrderId));
    } catch (err: any) {
      toast({
        title: "成交並建立派工單失敗",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setWinningId(null);
    }
  }

  async function submitMarkLost() {
    if (!lostQuote?.id || markingLost) return;
    setMarkingLost(true);
    try {
      const res = await authFetch(`/api/quotes/${lostQuote.id}/mark-lost`, {
        method: "POST",
        body: JSON.stringify({
          reason: lostReason,
          detail: lostReason === "其他" ? lostDetail : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `標記失敗（HTTP ${res.status}）`);
      }
      invQuotes();
      setLostQuote(null);
      setLostDetail("");
      if (editItem?.id === lostQuote.id) setEditItem(null);
      toast({ title: "已標記未成交" });
    } catch (err: any) {
      toast({
        title: "標記未成交失敗",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setMarkingLost(false);
    }
  }

  async function submitCancelWin() {
    if (!cancelWinQuote?.id || cancelingWin) return;
    setCancelingWin(true);
    try {
      const res = await authFetch(`/api/quotes/${cancelWinQuote.id}/cancel-win`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `取消成交失敗（HTTP ${res.status}）`);
      }
      invQuotes();
      qc.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
      const next = data.quote ?? {
        ...cancelWinQuote,
        status: "客戶確認中",
        workOrderId: data.workOrderId ?? cancelWinQuote.workOrderId,
        workOrderNumber: data.workOrderNumber ?? cancelWinQuote.workOrderNumber,
      };
      setCancelWinQuote(null);
      if (editItem?.id === next.id) {
        setEditItem(next);
        setForm(quoteToForm(next));
      }
      toast({ title: "已取消成交", description: "報價單已恢復為客戶確認中" });
    } catch (err: any) {
      toast({
        title: "取消成交失敗",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setCancelingWin(false);
    }
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
          toast({ title: "已複製報價單", description: "已開啟新報價單編輯（客戶確認中）" });
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

  function handleCopy(q: any) {
    if (!window.confirm("確定複製此報價單並建立新報價？")) return;
    const draft = {
      ...quoteToForm(q),
      title: `${q.title || "報價單"}（複製）`,
      status: "客戶確認中",
    };
    openEditAfterCopyRef.current = true;
    createMutation.mutate({ data: formToApi(draft) as any });
  }

  async function openEdit(q: any) {
    setForm(quoteToForm(q));
    setEditItem(q);
    try {
      const full = await loadQuoteForDocument(q.id);
      setForm(quoteToForm(full));
      setEditItem(full);
    } catch {
      /* keep list snapshot if GET /quotes/:id fails */
    }
  }

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
    toast({ title: "PDF 產生中…", description: "準備 LINE 分享內容" });
    let quote = q;
    try {
      quote = await loadQuoteForDocument(q.id);
    } catch (e: any) {
      toast({
        title: "無法載入原始報價單",
        description: String(e?.message || e),
        variant: "destructive",
      });
      return;
    }

    let shareUrl = "";
    try {
      shareUrl = await createQuoteShareUrl(quote.id);
    } catch (e: any) {
      toast({
        title: "無法建立公開分享連結",
        description: String(e?.message || e),
        variant: "destructive",
      });
      return;
    }

    const blob = await previewQuoteDocument(quote, setPdfPreview, toast as any);
    if (!blob) return;

    const message = buildLineShareMessage(quote, shareUrl);
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
    setForm(applyVoiceToQuoteForm(() => emptyForm("formal") as any, parsed) as any);
    setEditItem(null);
    setShowCreate(true);
  }

  useEffect(() => {
    if (!focusQuoteId) return;
    let cancelled = false;
    (async () => {
      try {
        const q = await loadQuoteForDocument(focusQuoteId);
        if (cancelled) return;
        setStatusFilter(quoteCategory(q));
        setForm(quoteToForm(q));
        setEditItem(q);
      } catch (e: any) {
        if (cancelled) return;
        toast({
          title: "無法載入來源報價單",
          description: String(e?.message || e),
          variant: "destructive",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [focusQuoteId]);

  async function openPublicLinkInNewTab(quoteId: number) {
    try {
      const url = await createQuoteShareUrl(quoteId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({
        title: "無法開啟公開連結",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  }

  async function handleCreateRevision(quoteId: number) {
    if (creatingRevision) return;
    setCreatingRevision(true);
    try {
      const res = await authFetch(`/api/quotes/${quoteId}/create-revision`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `建立新版失敗（HTTP ${res.status}）`);
      }
      invQuotes();
      if (data.quote) {
        setEditItem(data.quote);
        setForm(quoteToForm(data.quote));
      }
      toast({
        title: `已建立新版報價（v${data.confirmedVersion ?? ""}）`,
        description: "現在可修改價格或施工內容，儲存後再傳送給客戶重新確認",
      });
    } catch (err: any) {
      toast({
        title: "建立新版報價失敗",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setCreatingRevision(false);
    }
  }

  function addItem() { setForm(f => ({ ...f, items: [...f.items, { ...DEFAULT_ITEM(f.documentType), sortOrder: f.items.length }] })); }
  function cloneItemInGroup(idx: number) {
    setForm(f => {
      const src = f.items[idx];
      if (!src) return f;
      const cloned: QuoteItem = {
        ...DEFAULT_ITEM("intent"),
        inputMode: src.inputMode,
        category: src.category,
        quantity: src.quantity,
        unit: src.unit,
        installFee: src.installFee,
        workContent: src.workContent,
        optionGroupId: src.optionGroupId || "客廳方案",
        optionGroupName: src.optionGroupName || "客廳方案",
        isRequiredGroup: src.isRequiredGroup,
        selectionMode: src.selectionMode,
        sortOrder: f.items.length,
      };
      const next = [...f.items];
      next.splice(idx + 1, 0, cloned);
      return { ...f, items: next.map((it, i) => ({ ...it, sortOrder: i })) };
    });
  }
  function removeItem(idx: number) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }
  function updateItem(idx: number, updated: QuoteItem) { setForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? updated : item) })); }

  const { rawTotal, preTax, taxAmt, total } = computeTotals(form.items, form.discountAmount, form.taxType);

  const closeDialog = () => { if (editItem) setEditItem(null); else setShowCreate(false); };
  const dialogOpen = showCreate || !!editItem;

  return (
    <div className="space-y-4" data-release={QUOTE_INTENT_ESIGN_RELEASE_MARKER}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">報價單管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">支援意向選擇單（多方案客戶自選）與正式報價單（線上電子簽名確認自動派工）</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VoiceAssistantButton formType="quote" onApply={handleVoiceApply} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setForm(emptyForm("intent"));
              setShowCreate(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />新增意向選擇單
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm("formal"));
              setShowCreate(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />新增正式報價單
          </Button>
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

      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 space-y-2">
        <Input
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
          placeholder="搜尋報價單號、客戶、電話、工程名稱…"
          className="h-10"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={docTypeFilter} onValueChange={(v) => setDocTypeFilter(v as "all" | "formal" | "intent")}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="單據類型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部單據類型</SelectItem>
              <SelectItem value="formal">正式報價單</SelectItem>
              <SelectItem value="intent">意向選擇單</SelectItem>
            </SelectContent>
          </Select>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="報價流程狀態" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部流程狀態</SelectItem>
              {QUOTE_WORKFLOW_STAGES.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status filter — horizontal scroll; counts from mutually exclusive mapping */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {FILTER_TABS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
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
          {paged.map((q: any) => {
            const qItems = (q.items ?? []) as any[];
            const qRaw = qItems.length > 0 ? qItems.reduce((s: number, i: any) => s + Number(i.subtotal ?? 0), 0) : Number(q.finalAmount ?? q.amount ?? 0);
            const qDisc = Number(q.discountAmount ?? 0);
            const { total: qTotal } = computeQuoteAmounts(qRaw, qDisc, q.taxType ?? "未稅");
            const hasWo = quoteHasLinkedWorkOrder(q);
            const isIntent = normalizeQuoteDocumentType(q.documentType) === "intent";
            const canWin = !isIntent && canWinQuoteAndCreateWorkOrder(q);
            const statusLabel = quoteStatusLabel(q.status);
            const won = statusLabel === "已成交";
            const stageLabel = q.workflowStage || (isIntent ? "待客戶選擇" : statusLabel);
            const confirmedDateStr = q.customerConfirmedAt
              ? new Date(q.customerConfirmedAt).toLocaleString("zh-TW", { hour12: false })
              : q.wonAt
                ? new Date(q.wonAt).toLocaleString("zh-TW", { hour12: false })
                : null;
            const selectedDateStr = q.customerSelectedAt
              ? new Date(q.customerSelectedAt).toLocaleString("zh-TW", { hour12: false })
              : null;

            return (
              <Card key={q.id}>
                <CardContent className="p-3 sm:p-4 space-y-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        isIntent ? "bg-amber-100 text-amber-900" : "bg-slate-900 text-white"
                      }`}
                    >
                      {quoteDocumentTypeLabel(q.documentType)}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatQuoteNumber(q)} (v{q.confirmedVersion ?? 1})
                    </span>
                    <span className="font-medium text-sm">{q.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[stageLabel] ?? STATUS_COLORS[statusLabel] ?? "bg-gray-100 text-gray-700"}`}>
                      {stageLabel}
                    </span>
                    {won && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800">
                        ✓ 已成交
                      </span>
                    )}
                    {hasWo && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono">
                        派工單 {q.workOrderNumber || `#${q.workOrderId}`}（{q.dispatchStatus || "待派工"}）
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                    <span>客戶：<strong className="text-foreground">{q.customerName || "—"}</strong></span>
                    {q.customerPhone && <span>{q.customerPhone}</span>}
                    {q.salesRepName && <span>業務：{q.salesRepName}</span>}
                    <span>
                      {isIntent ? `方案合計試算 NT$${qTotal.toLocaleString()}` : `報價金額（含稅）NT$${qTotal.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {isIntent ? (
                      <span className={`px-2 py-0.5 rounded border ${q.customerSelectedAt ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                        客戶選擇：{q.customerSelectedAt ? `✓ 已選擇（${selectedDateStr}）` : "待客戶選擇"}
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded border ${q.customerConfirmedAt || won ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-sky-50 border-sky-200 text-sky-800"}`}>
                        客戶確認：
                        {q.customerConfirmedAt
                          ? `✓ 已確認${q.signatureDataUrl ? "（含手寫簽名）" : ""}`
                          : won
                            ? "✓ 已確認成交"
                            : "待客戶確認"}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded border ${hasWo ? "bg-indigo-50 border-indigo-200 text-indigo-800" : "bg-muted/40 border-border text-muted-foreground"}`}>
                      轉派工：{hasWo ? `✓ 已轉派工（${q.workOrderNumber || `#${q.workOrderId}`}）` : "尚未轉派工"}
                    </span>
                    {confirmedDateStr && (
                      <span className="px-2 py-0.5 rounded border bg-muted/40 border-border text-muted-foreground">
                        確認日期：{confirmedDateStr}
                      </span>
                    )}
                  </div>
                  {(q.convertedFormalQuoteId || q.sourceIntentQuoteId) && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {q.convertedFormalQuoteId && (
                        <button
                          type="button"
                          className="text-emerald-700 font-medium hover:underline"
                          onClick={() => navigate(`/quotes?focusId=${q.convertedFormalQuoteId}`)}
                        >
                          → 查看客戶選定產生之正式報價單 (#{q.convertedFormalQuoteId})
                        </button>
                      )}
                      {q.sourceIntentQuoteId && (
                        <button
                          type="button"
                          className="text-purple-700 font-medium hover:underline"
                          onClick={() => navigate(`/quotes?focusId=${q.sourceIntentQuoteId}`)}
                        >
                          ← 查看原始意向選擇單 (#{q.sourceIntentQuoteId})
                        </button>
                      )}
                    </div>
                  )}
                  {q.address && <div className="text-xs text-muted-foreground">{q.address}</div>}

                  {/* Compact action bar: 查看 + icon ops; ⋯ for rare/dangerous */}
                  <TooltipProvider delayDuration={300}>
                    <div className="flex flex-col gap-2">
                      {canWin && (
                        <Button
                          size="lg"
                          className="h-12 w-full sm:w-auto px-4 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={winningId != null}
                          onClick={() => void winQuoteAndDispatch(q)}
                        >
                          <Check className="h-5 w-5 mr-1.5" />
                          {winningId === q.id
                            ? "處理中…"
                            : hasWo
                              ? "客戶成交"
                              : "客戶成交・建立派工單"}
                        </Button>
                      )}
                      {hasWo && (
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-12 w-full sm:w-auto px-4 text-base font-semibold border-emerald-600 text-emerald-800 hover:bg-emerald-50"
                          onClick={() => navigate(workOrderEditPath(q.workOrderId))}
                        >
                          <FileText className="h-5 w-5 mr-1.5" />查看派工單
                        </Button>
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
                            void runPdfAction(q.id, async () => {
                              const quote = await loadQuoteForDocument(q.id);
                              await printQuoteDocument(quote, setPdfPreview, toast as any);
                            })
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

                        <QuoteIconButton label="編輯報價單" onClick={() => openEdit(q)}>
                          <Pencil className="h-4 w-4" />
                        </QuoteIconButton>

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
                            <DropdownMenuItem onClick={() => void openPublicLinkInNewTab(q.id)}>
                              <Eye className="h-3.5 w-3.5 mr-2" />開啟客戶公開連結
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={pdfBusyId != null}
                              onClick={() =>
                                void runPdfAction(q.id, async () => {
                                  const quote = await loadQuoteForDocument(q.id);
                                  await downloadQuoteDocument(quote, setPdfPreview, toast as any);
                                })
                              }
                            >
                              <Download className="h-3.5 w-3.5 mr-2" />下載 PDF
                            </DropdownMenuItem>
                            {canWin && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setLostReason("價格因素");
                                  setLostDetail("");
                                  setLostQuote(q);
                                }}
                              >
                                <X className="h-3.5 w-3.5 mr-2" />標記未成交
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

      {!isLoading && filtered.length > 0 && (
        <div className="flex flex-col items-center gap-2 max-w-3xl pt-1">
          <p className="text-xs text-muted-foreground">
            第 {currentPage} / {totalPages} 頁（共 {filtered.length} 筆）
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3"
              disabled={currentPage <= 1}
              onClick={() => setListPage(p => Math.max(1, p - 1))}
            >
              上一頁
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <Button
                key={page}
                size="sm"
                variant={page === currentPage ? "default" : "outline"}
                className="h-9 w-9 px-0"
                onClick={() => setListPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3"
              disabled={currentPage >= totalPages}
              onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
            >
              下一頁
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => !open && closeDialog()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem
                ? `編輯${quoteDocumentTypeLabel(form.documentType)}（v${editItem.confirmedVersion ?? 1}）`
                : `新增${quoteDocumentTypeLabel(form.documentType)}`}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded font-semibold ${
                    form.documentType === "intent" ? "bg-amber-100 text-amber-900" : "bg-slate-900 text-white"
                  }`}
                >
                  {quoteDocumentTypeLabel(form.documentType)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[editItem.workflowStage || quoteStatusLabel(editItem.status)] ?? "bg-gray-100 text-gray-700"}`}>
                  {editItem.workflowStage || quoteStatusLabel(editItem.status)}
                </span>
                {isQuoteWon(editItem.status) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    disabled={cancelingWin}
                    onClick={() => setCancelWinQuote(editItem)}
                  >
                    取消成交
                  </Button>
                )}
                {quoteHasLinkedWorkOrder(editItem) && (
                  <span className="text-xs font-mono text-indigo-700">
                    派工單 {editItem.workOrderNumber || `#${editItem.workOrderId}`}
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs ml-auto"
                  onClick={() => void openPublicLinkInNewTab(editItem.id)}
                >
                  開啟客戶公開連結
                </Button>
              </div>
              {editItem.customerConfirmedAt && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-950 space-y-1.5">
                  <div className="font-semibold">
                    ✓ 客戶已於 {new Date(editItem.customerConfirmedAt).toLocaleString("zh-TW", { hour12: false })} 完成正式確認（版本 v{editItem.confirmedVersion ?? 1}）
                  </div>
                  {editItem.signatureDataUrl && (
                    <div className="flex items-center gap-3">
                      <span>客戶手寫簽名：</span>
                      <img src={editItem.signatureDataUrl} alt="客戶簽名" className="h-12 bg-white border rounded px-2 py-0.5 object-contain" />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-emerald-800">正式確認後已鎖定版本。若需變更價格或施工內容，請建立新版報價再次請客戶確認。</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={creatingRevision}
                      onClick={() => void handleCreateRevision(editItem.id)}
                    >
                      {creatingRevision ? "建立中…" : `建立新版報價（v${(editItem.confirmedVersion ?? 1) + 1}）`}
                    </Button>
                  </div>
                </div>
              )}
              {form.documentType !== "intent" && canWinQuoteAndCreateWorkOrder(editItem) && (
                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={winningId != null}
                  onClick={() => void winQuoteAndDispatch(editItem)}
                >
                  <Check className="h-5 w-5 mr-1.5" />
                  {winningId === editItem.id
                    ? "處理中…"
                    : quoteHasLinkedWorkOrder(editItem)
                      ? "客戶成交"
                      : "客戶成交・建立派工單"}
                </Button>
              )}
              {quoteHasLinkedWorkOrder(editItem) && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="h-12 w-full text-base font-semibold border-emerald-600 text-emerald-800 hover:bg-emerald-50"
                  onClick={() => navigate(workOrderEditPath(editItem.workOrderId))}
                >
                  <FileText className="h-5 w-5 mr-1.5" />查看派工單
                </Button>
              )}
            </div>
          )}
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

            {/* Section: 單據模式與狀態 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1">單據模式</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>單據類型 *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm(f => ({
                          ...f,
                          documentType: "formal",
                          workflowStage: f.workflowStage === "待客戶選擇" ? "待客戶確認" : f.workflowStage,
                        }))
                      }
                      className={`px-3 py-2 rounded-md border text-xs font-semibold text-left transition-colors ${
                        form.documentType === "formal"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <div>B. 正式報價單</div>
                      <div className="text-[11px] font-normal opacity-80">直接報價 → 客戶確認簽名 → 自動派工</div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm(f => ({
                          ...f,
                          documentType: "intent",
                          workflowStage: f.workflowStage === "待客戶確認" ? "待客戶選擇" : f.workflowStage,
                          items: f.items.map(it => ({
                            ...it,
                            optionGroupName: it.optionGroupName || "客廳方案",
                            optionGroupId: it.optionGroupId || "客廳方案",
                            selectionMode: it.selectionMode === "fixed" ? "single" : it.selectionMode,
                          })),
                        }))
                      }
                      className={`px-3 py-2 rounded-md border text-xs font-semibold text-left transition-colors ${
                        form.documentType === "intent"
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <div>A. 意向選擇單</div>
                      <div className="text-[11px] font-normal opacity-85">多品牌機型方案 → 客戶自選 → 產生正式報價</div>
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>報價流程階段</Label>
                  <Select value={form.workflowStage} onValueChange={v => setForm(f => ({ ...f, workflowStage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUOTE_WORKFLOW_STAGES.map(st => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <Label>報價稅額方式</Label>
                  <Select value={form.taxType} onValueChange={v => setForm(f => ({ ...f, taxType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="不另加稅">○ 報價總額（不另加 5%）</SelectItem>
                      <SelectItem value="未稅">○ 未稅報價（另外加計 5%）</SelectItem>
                      <SelectItem value="含稅">○ 含稅報價（價格已含 5%）</SelectItem>
                    </SelectContent>
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
                    <ItemCard
                      key={idx}
                      item={item}
                      index={idx}
                      products={quoteProducts ?? []}
                      documentType={form.documentType}
                      onChange={updated => updateItem(idx, updated)}
                      onDelete={() => removeItem(idx)}
                      onCloneInGroup={() => cloneItemInGroup(idx)}
                    />
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
                    {form.taxType !== "不另加稅" && (<>
                      <div className="flex justify-between text-muted-foreground"><span>未稅小計</span><span>NT$ {preTax.toLocaleString()}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>稅額 5%</span><span>NT$ {taxAmt.toLocaleString()}</span></div>
                    </>)}
                    <div className="flex justify-between font-bold border-t pt-1 text-sm">
                      <span>{form.taxType === "不另加稅" ? "報價總計" : "含稅總計"}</span><span>NT$ {total.toLocaleString()}</span>
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
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending || Boolean(editItem?.customerConfirmedAt)}
                title={editItem?.customerConfirmedAt ? "此版本已由客戶確認鎖定，請先點選上方「建立新版報價」" : undefined}
              >
                {editItem?.customerConfirmedAt ? "已確認鎖定（請建立新版）" : "儲存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelWinQuote} onOpenChange={(open) => { if (!open && !cancelingWin) setCancelWinQuote(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定取消成交？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>此操作會將報價單恢復為「報價中」。</p>
                {cancelWinQuote && quoteHasLinkedWorkOrder(cancelWinQuote) && (
                  <>
                    <p>此報價單已建立派工單 {cancelWinQuote.workOrderNumber || `#${cancelWinQuote.workOrderId}`}。</p>
                    <p>取消成交不會刪除既有派工單。</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelingWin}>返回</AlertDialogCancel>
            <AlertDialogAction
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              disabled={cancelingWin}
              onClick={(e) => {
                e.preventDefault();
                void submitCancelWin();
              }}
            >
              {cancelingWin ? "處理中…" : "確認取消成交"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!lostQuote} onOpenChange={(open) => { if (!open) setLostQuote(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>標記未成交</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              不會建立派工單，報價單會保留供成交率統計。原因可選填。
            </p>
            <div className="space-y-1.5">
              <Label>未成交原因</Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUOTE_LOST_REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {lostReason === "其他" && (
              <div className="space-y-1.5">
                <Label>補充說明</Label>
                <Input value={lostDetail} onChange={e => setLostDetail(e.target.value)} placeholder="選填" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLostQuote(null)}>取消</Button>
            <Button type="button" disabled={markingLost} onClick={() => void submitMarkLost()}>
              {markingLost ? "儲存中…" : "確認標記未成交"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
