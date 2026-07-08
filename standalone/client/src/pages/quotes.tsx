import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListQuotes, useCreateQuote, useUpdateQuote, useDeleteQuote,
  useListCustomers, useUpdateCustomer, useCreateWorkOrder, useListEmployees,
  useListProducts,
  getListWorkOrdersQueryKey, getListCustomersQueryKey, getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, Pencil, Trash2, Printer, Wrench, Copy, Share2, Download, FileText } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { makeEmpty, buildPayload, hasWorkOrderCustomer, type WOForm } from "@/components/work-order-form";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import {
  handlePdfAction,
  isMobileDevice,
  openPrintWindow,
} from "@/components/pdf/pdf-service";
import { buildQuotationHtml } from "@/components/pdf/templates/QuotationTemplate";
import { computeQuoteAmounts } from "@/components/pdf/quote-amounts";
import { invalidateStatistics } from "@/lib/invalidateStatistics";
import {
  formatQuoteNumber,
  buildWorkOrderFormFromQuote,
  canConvertQuoteToWorkOrder,
  normalizeQuoteStatus,
} from "@/lib/quoteToWorkOrder";
import { VoiceAssistantButton } from "@/components/voice-assistant/VoiceAssistantDialog";
import { applyVoiceToQuoteForm } from "@/lib/voice/applyVoiceToQuote";
import type { VoiceAssistantApplyPayload } from "@/components/voice-assistant/types";

// ── Constants ──────────────────────────────────────────────────────────────
const STATUSES = ["草稿", "已送出", "已成交", "已拒絕"];
const FILTER_TABS = ["全部", "草稿", "已送出", "已成交", "待派工", "已派工", "已拒絕"];
const STATUS_COLORS: Record<string, string> = {
  "草稿": "bg-gray-100 text-gray-700",
  "已送出": "bg-blue-100 text-blue-700",
  "已成交": "bg-green-100 text-green-700",
  "已拒絕": "bg-red-100 text-red-700",
};
const DISPATCH_COLORS: Record<string, string> = {
  "未派工": "bg-slate-100 text-slate-600",
  "待派工": "bg-orange-100 text-orange-700",
  "已派工": "bg-green-100 text-green-700",
  "施工中": "bg-blue-100 text-blue-700",
  "已完工": "bg-emerald-100 text-emerald-700",
};

function quoteMatchesFilter(q: any, filter: string): boolean {
  if (filter === "全部") return true;
  if (["待派工", "已派工"].includes(filter)) return q.dispatchStatus === filter;
  if (filter === "已成交") return normalizeQuoteStatus(q.status) === "已成交";
  return q.status === filter;
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

// ── Shared PDF V2 helpers ────────────────────────────────────────────────
function getQuoteNo(quote: any): string {
  return formatQuoteNumber(quote);
}

async function printQuote(
  quote: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const quoteNo = getQuoteNo(quote);
  const html = buildQuotationHtml(quote);
  if (isMobileDevice()) {
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
  } else {
    openPrintWindow(html, `晟風工程報價單 — ${quoteNo}`);
  }
}

async function shareQuoteViaLine(
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
    action: "share",
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
  const [form, setForm] = useState<QuoteForm>(emptyForm());
  const [woForm, setWoForm] = useState<WOForm>(makeEmpty());

  const [statusFilter, setStatusFilter] = useState("全部");
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);

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

  const filtered = (quotes ?? []).filter((q: any) => {
    if (!quoteMatchesFilter(q, statusFilter)) return false;
    if (filterCustomerName && !q.customerName?.toLowerCase().includes(filterCustomerName.toLowerCase())) return false;
    return true;
  });

  const invQuotes = () => invalidateStatistics(qc);
  const createMutation = useCreateQuote({ mutation: { onSuccess: () => { invQuotes(); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); setShowCreate(false); toast({ title: "報價單已新增" }); } } });
  const updateMutation = useUpdateQuote({ mutation: { onSuccess: () => { invQuotes(); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); setEditItem(null); toast({ title: "報價單已更新" }); } } });
  const deleteMutation = useDeleteQuote({ mutation: { onSuccess: () => { invQuotes(); setDeleteId(null); toast({ title: "報價單已刪除" }); } } });
  const createWoMutation = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(qc);
        invQuotes();
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
    setForm({ ...quoteToForm(q), title: `${q.title}（複製）`, status: "草稿" });
    setShowCreate(true);
  }

  function openEdit(q: any) { setForm(quoteToForm(q)); setEditItem(q); }

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
    if (!hasWorkOrderCustomer(woForm)) {
      toast({ title: "請填寫客戶資訊", description: "請選擇現有客戶或輸入臨時客戶名稱", variant: "destructive" });
      return;
    }
    const payload = buildPayload(woForm);
    console.log("[work-order submit]", { customerId: payload.customerId, quoteId: payload.quoteId, customerName: payload.customerName });
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

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_TABS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {filtered.map(q => {
              const qItems = (q.items ?? []) as any[];
              const qRaw = qItems.length > 0 ? qItems.reduce((s: number, i: any) => s + Number(i.subtotal ?? 0), 0) : Number(q.finalAmount ?? q.amount ?? 0);
              const qDisc = Number(q.discountAmount ?? 0);
              const { total: qTotal } = computeQuoteAmounts(qRaw, qDisc, q.taxType ?? "未稅");
              return (
                <div key={q.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm">{q.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[normalizeQuoteStatus(q.status)] ?? "bg-gray-100 text-gray-700"}`}>{normalizeQuoteStatus(q.status)}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${DISPATCH_COLORS[q.dispatchStatus ?? "未派工"] ?? "bg-slate-100 text-slate-600"}`}>
                        {q.dispatchStatus === "待派工" ? "🟠 " : q.dispatchStatus === "已派工" ? "🟢 " : ""}{q.dispatchStatus ?? "未派工"}
                      </span>
                      {q.workOrderNumber && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono">{q.workOrderNumber}</span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{q.taxType ?? "未稅"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                      {q.customerName && <span>{q.customerName}</span>}
                      {q.customerPhone && <span>{q.customerPhone}</span>}
                      {q.salesRepName && <span>業務：{q.salesRepName}</span>}
                      {qItems.length > 0
                        ? <span>{qItems.length} 項工程・含稅 NT${qTotal.toLocaleString()}</span>
                        : <span>含稅 NT${qTotal.toLocaleString()}</span>
                      }
                      <span>{new Date(q.createdAt).toLocaleDateString("zh-TW")}</span>
                    </div>
                    {q.address && <div className="text-xs text-muted-foreground truncate max-w-sm mt-0.5">{q.address}</div>}
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="列印/PDF" onClick={() => printQuote(q, setPdfPreview, toast)}><Printer className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="LINE 分享" onClick={() => shareQuoteViaLine(q, setPdfPreview, toast)}><Share2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="複製" onClick={() => handleCopy(q)}><Copy className="h-3.5 w-3.5" /></Button>
                    {canConvertQuoteToWorkOrder(q) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="轉為派工單" onClick={() => {
                        setConvertItem(q);
                        setWoForm(buildWorkOrderFormFromQuote(q));
                      }}><Wrench className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="編輯" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="刪除" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">{statusFilter === "全部" ? "尚無報價單資料" : `目前無「${statusFilter}」的報價單`}</p></CardContent></Card>
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
          <DialogContent className="max-w-lg w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader><DialogTitle>由報價單建立派工單</DialogTitle></DialogHeader>
            <form onSubmit={handleConvert} className="space-y-4 mt-1">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                <p className="font-mono text-xs text-muted-foreground">{formatQuoteNumber(convertItem)}</p>
                <p className="font-semibold">{convertItem.title}</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>客戶：{convertItem.customerName ?? "—"} · {convertItem.customerPhone ?? "—"}</p>
                  <p>聯絡人：{convertItem.contactPerson ?? "—"} · 業務：{convertItem.salesRepName ?? "—"}</p>
                  <p>地址：{convertItem.address ?? "—"}</p>
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
              <p className="text-xs text-muted-foreground">以上資料將自動帶入派工單，僅需確認施工排程（選填）。</p>
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConvertItem(null)}>取消</Button>
                <Button type="submit" disabled={createWoMutation.isPending}><Wrench className="h-3.5 w-3.5 mr-1" />建立派工單</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

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
    </div>
  );
}
