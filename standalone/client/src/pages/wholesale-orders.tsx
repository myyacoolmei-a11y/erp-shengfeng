import { useState, useEffect } from "react";
import {
  useListWholesaleOrders, useCreateWholesaleOrder, useUpdateWholesaleOrder,
  useDeleteWholesaleOrder, useGetWholesaleOrder,
  useListWholesaleCustomers, useListWholesaleProducts,
  getListWholesaleOrdersQueryKey,
  getGetWholesaleOrderQueryKey, getWholesaleOrder,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, ShoppingCart, X, CreditCard, Printer, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { handlePdfAction, isMobileDevice, openPrintWindow } from "@/components/pdf/pdf-service";
import { buildDeliveryHtml } from "@/components/pdf/templates/DeliveryTemplate";
import { loadPrintCalibration } from "@/lib/printPaperConfig";
import {
  createWholesalePayment,
  deleteWholesalePaymentRecord,
  listWholesalePaymentsByOrder,
} from "@/lib/wholesalePaymentsApi";
import {
  WHOLESALE_PAYMENT_METHODS,
  deriveWholesalePaymentStatus,
  normalizeWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
} from "../../../shared/wholesalePaymentMath.ts";

const ORDER_STATUSES = ["備貨中", "已出貨"];
const STATUS_COLORS: Record<string, string> = {
  "備貨中": "bg-amber-100 text-amber-700",
  "已出貨": "bg-indigo-100 text-indigo-700",
};

interface OItem {
  productId: number | null;
  productName: string;
  brand: string;
  model: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

function makeItem(): OItem {
  return { productId: null, productName: "", brand: "", model: "", unit: "台", qty: 1, unitPrice: 0, discount: 0 };
}

interface OForm {
  customerId: number | null;
  customerName: string;
  orderDate: string;
  expectedDelivery: string;
  salesperson: string;
  notes: string;
  taxRate: number;
  shippingFee: number;
  status: string;
  items: OItem[];
}

function emptyForm(): OForm {
  return {
    customerId: null, customerName: "", orderDate: new Date().toISOString().split("T")[0],
    expectedDelivery: "", salesperson: "", notes: "", taxRate: 0, shippingFee: 0, status: "備貨中", items: [],
  };
}

/** 列表 API 刻意不帶 items；列印前一律抓單筆完整訂單（含商品明細與客戶聯絡）。 */
async function loadOrderForPrint(order: any, customers?: any[]): Promise<any> {
  if (!order?.id) throw new Error("找不到出貨單");
  const full = await getWholesaleOrder(order.id);
  if (!full) throw new Error("找不到出貨單");
  const cust = (customers ?? []).find((c: any) => c.id === full.customerId);
  return {
    ...full,
    customerName: full.customerName || cust?.companyName || "",
    customerPhone: full.customerPhone || cust?.mobile || cust?.telephone || "",
    customerAddress: full.customerAddress || cust?.address || "",
  };
}

async function printOrder(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
  customers?: any[],
) {
  let full: any;
  try {
    full = await loadOrderForPrint(order, customers);
  } catch {
    toast({ title: "無法載入出貨單", description: "請稍後再試", variant: "destructive" });
    return;
  }
  const orderNo = full.orderNumber || `WO-${String(full.id).padStart(4, "0")}`;
  if (isMobileDevice()) {
    const html = buildDeliveryHtml(full);
    await handlePdfAction({
      html,
      docNo: orderNo,
      filename: `出貨單_${orderNo}.pdf`,
      title: "晟風工程出貨單",
      action: "download",
      setPdfPreview,
      toast,
      pageFormat: "custom-240x140-landscape",
    });
  } else {
    const html = buildDeliveryHtml(full, {
      mode: "continuous-print",
      calibration: loadPrintCalibration(),
    });
    openPrintWindow(html, `晟風工程出貨單 — ${orderNo}`);
  }
}

async function shareOrderViaLine(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
  customers?: any[],
) {
  let full: any;
  try {
    full = await loadOrderForPrint(order, customers);
  } catch {
    toast({ title: "無法載入出貨單", description: "請稍後再試", variant: "destructive" });
    return;
  }
  const orderNo = full.orderNumber || `WO-${String(full.id).padStart(4, "0")}`;
  const html = buildDeliveryHtml(full);
  await handlePdfAction({
    html,
    docNo: orderNo,
    filename: `出貨單_${orderNo}.pdf`,
    title: "晟風工程出貨單",
    action: "share",
    setPdfPreview,
    toast,
    pageFormat: "custom-240x140-landscape",
  });
}

function fromData(d: any): OForm {
  return {
    customerId: d.customerId ?? null,
    customerName: d.customerName ?? "",
    orderDate: d.orderDate ?? new Date().toISOString().split("T")[0],
    expectedDelivery: d.expectedDelivery ?? "",
    salesperson: d.salesperson ?? "",
    notes: d.notes ?? "",
    taxRate: parseFloat(d.taxRate ?? "0"),
    shippingFee: parseFloat(d.shippingFee ?? "0"),
    status: d.status ?? "備貨中",
    items: (d.items ?? []).map((it: any) => ({
      productId: it.productId ?? null,
      productName: it.productName ?? "",
      brand: it.brand ?? "",
      model: it.model ?? "",
      unit: it.unit ?? "台",
      qty: it.qty ?? 1,
      unitPrice: parseFloat(it.unitPrice ?? "0"),
      discount: parseFloat(it.discount ?? "0"),
    })),
  };
}

function computedSubtotal(items: OItem[]) {
  return items.reduce((sum, it) => sum + it.qty * it.unitPrice * (1 - it.discount / 100), 0);
}

function fmtMoney(n: number) { return `NT$ ${Math.round(n).toLocaleString()}`; }
function fmtMoneyStr(s: string | null | undefined) {
  if (!s) return "—";
  const n = parseFloat(s);
  return isNaN(n) ? "—" : `NT$ ${Math.round(n).toLocaleString()}`;
}
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

const PAY_STATUS_CLASS: Record<string, string> = {
  "未收款": "bg-red-100 text-red-700",
  "部分收款": "bg-amber-100 text-amber-700",
  "已收清": "bg-green-100 text-green-700",
};

function receivableButtonLabel(order: any): string {
  if (order.status !== "已出貨") return "應收款";
  const total = parseMoney(order.total);
  const received = parseMoney(order.receivedAmount);
  const outstanding = remainingAmount(total, received);
  const status = normalizeWholesalePaymentStatus(order.paymentStatus) || deriveWholesalePaymentStatus(received, total);
  if (status === "已收清") return "已收清";
  if (status === "部分收款") return `待收 ${fmtMoney(outstanding)}`;
  return `應收 ${fmtMoney(total)}`;
}

export default function WholesaleOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user && ["super_admin", "owner", "admin", "sales"].includes(user.role);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [receivableOrderId, setReceivableOrderId] = useState<number | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [form, setForm] = useState<OForm>(emptyForm());
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [payMethod, setPayMethod] = useState("現金");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);

  const { data: orders, isLoading } = useListWholesaleOrders({
    ...(search ? { search } : {}),
    ...(statusFilter !== "全部" ? { status: statusFilter } : {}),
  });

  const { data: editData, isLoading: editLoading } = useGetWholesaleOrder(
    editId ?? 0,
    { query: { enabled: !!editId, queryKey: getGetWholesaleOrderQueryKey(editId ?? 0) } }
  );

  const { data: customers } = useListWholesaleCustomers({});
  const { data: products } = useListWholesaleProducts({ forSelection: "true" });
  const { data: orderPayments = [], isPending: paymentsPending, refetch: refetchOrderPayments } = useQuery({
    queryKey: ["wholesale-order-payments", receivableOrderId],
    queryFn: () => listWholesalePaymentsByOrder(receivableOrderId!),
    enabled: !!receivableOrderId,
  });

  const receivableOrder = (orders ?? []).find((o: any) => o.id === receivableOrderId) ?? null;

  useEffect(() => {
    if (editData && editId) setForm(fromData(editData));
  }, [editData, editId]);

  const invOrders = () => qc.invalidateQueries({ queryKey: getListWholesaleOrdersQueryKey() });

  const createMut = useCreateWholesaleOrder({ mutation: { onSuccess: () => { invOrders(); close_(); toast({ title: "批發訂單已建立" }); } } });
  const updateMut = useUpdateWholesaleOrder({ mutation: { onSuccess: () => { invOrders(); close_(); toast({ title: "已更新" }); } } });
  const deleteMut = useDeleteWholesaleOrder({ mutation: { onSuccess: () => { invOrders(); setDeleteId(null); toast({ title: "已刪除" }); } } });

  function close_() { setShowDialog(false); setEditId(null); setForm(emptyForm()); }
  function openCreate() { setForm(emptyForm()); setEditId(null); setShowDialog(true); }
  function openEdit(id: number) { setEditId(id); setShowDialog(true); }

  function updateItem(idx: number, patch: Partial<OItem>) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      customerId: form.customerId,
      customerName: form.customerName || undefined,
      orderDate: form.orderDate,
      expectedDelivery: form.expectedDelivery || undefined,
      salesperson: form.salesperson || undefined,
      notes: form.notes || undefined,
      taxRate: form.taxRate,
      shippingFee: form.shippingFee,
      status: form.status,
      items: form.items.filter(it => it.productName.trim()),
    };
    if (editId) updateMut.mutate({ id: editId, data: payload });
    else createMut.mutate({ data: payload });
  }

  function openReceivable(order: any) {
    setReceivableOrderId(order.id);
    const outstanding = remainingAmount(parseMoney(order.total), parseMoney(order.receivedAmount));
    setPayAmount(outstanding > 0 ? String(outstanding) : "");
    setPayDate(todayStr());
    setPayMethod("現金");
    setPayNote("");
  }

  const recTotal = parseMoney(receivableOrder?.total);
  const recReceived = paymentsPending
    ? parseMoney(receivableOrder?.receivedAmount)
    : orderPayments.reduce((sum, p) => sum + parseMoney(p.amount), 0);
  const recOutstanding = remainingAmount(recTotal, recReceived);
  const recStatus = deriveWholesalePaymentStatus(recReceived, recTotal);

  async function refreshReceivableView() {
    await Promise.all([
      invOrders(),
      receivableOrderId ? refetchOrderPayments() : Promise.resolve(),
    ]);
  }

  async function submitOrderPayment() {
    if (!receivableOrder) return;
    if (receivableOrder.status !== "已出貨") {
      toast({ title: "請先將訂單狀態改為「已出貨」", variant: "destructive" });
      return;
    }
    if (!receivableOrder.customerId) {
      toast({ title: "此出貨單沒有客戶，無法登記收款", variant: "destructive" });
      return;
    }
    const amount = parseMoney(payAmount);
    if (!(amount > 0)) {
      toast({ title: "請輸入本次收款金額", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      await createWholesalePayment({
        customerId: receivableOrder.customerId,
        orderId: receivableOrder.id,
        amount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        note: payNote.trim() || undefined,
      });
      toast({ title: "已登記收款" });
      const nextOutstanding = remainingAmount(recTotal, recReceived + amount);
      setPayAmount(nextOutstanding > 0 ? String(nextOutstanding) : "");
      setPayNote("");
      setPayDate(todayStr());
      await refreshReceivableView();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "登記收款失敗", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  }

  async function removeOrderPayment(id: number) {
    setDeletingPaymentId(id);
    try {
      await deleteWholesalePaymentRecord(id);
      toast({ title: "已刪除收款紀錄" });
      await refreshReceivableView();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "刪除失敗", variant: "destructive" });
    } finally {
      setDeletingPaymentId(null);
    }
  }

  const subtotal = computedSubtotal(form.items);
  const taxAmount = subtotal * form.taxRate / 100;
  const total = subtotal + taxAmount + form.shippingFee;
  const isPending = createMut.isPending || updateMut.isPending;
  const list = orders ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發訂單</h1>
          <p className="text-sm text-muted-foreground">共 {list.length} 筆</p>
        </div>
        {canWrite && <Button onClick={openCreate} className="shrink-0"><Plus className="h-4 w-4 mr-1" />新增訂單</Button>}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="搜尋訂單號、客戶名稱…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部">全部狀態</SelectItem>
            {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-14 text-center">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">尚無批發訂單</p>
          {canWrite && <Button className="mt-3" size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新增</Button>}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map((o: any) => (
            <Card key={o.id}>
              <CardContent className="p-4">
                <div className="flex gap-3 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-1">
                      {o.orderNumber && <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{o.orderNumber}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-700"}`}>{o.status}</span>
                      {o.quoteNumber && <span className="text-xs text-muted-foreground">來源：{o.quoteNumber}</span>}
                    </div>
                    <p className="font-semibold">{o.customerName || "（未指定客戶）"}</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                      <span>訂單日：{o.orderDate}</span>
                      {o.expectedDelivery && <span>預計交貨：{o.expectedDelivery}</span>}
                      {o.salesperson && <span>業務：{o.salesperson}</span>}
                    </div>
                    <p className="text-sm font-medium mt-1">合計：{fmtMoneyStr(o.total)}</p>
                  </div>
                  {canWrite && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openEdit(o.id)}><Pencil className="h-3 w-3" />編輯</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-7 gap-1 text-xs ${
                          o.status === "已出貨" && normalizeWholesalePaymentStatus(o.paymentStatus) === "已收清"
                            ? "text-green-700 border-green-200 hover:bg-green-50"
                            : o.status === "已出貨" && normalizeWholesalePaymentStatus(o.paymentStatus) === "部分收款"
                              ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                              : "text-blue-600 border-blue-200 hover:bg-blue-50"
                        }`}
                        onClick={() => openReceivable(o)}
                      >
                        <CreditCard className="h-3 w-3" />{receivableButtonLabel(o)}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteId(o.id)}><Trash2 className="h-3 w-3" />刪除</Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" title="列印出貨單" onClick={() => printOrder(o, setPdfPreview, toast, customers)}><Printer className="h-3 w-3" />列印</Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-green-600 hover:text-green-700" title="LINE 分享出貨單" onClick={() => shareOrderViaLine(o, setPdfPreview, toast, customers)}><Share2 className="h-3 w-3" />LINE</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={open => !open && close_()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{editId ? "編輯批發訂單" : "新增批發訂單"}</DialogTitle></DialogHeader>
          {editId && editLoading ? (
            <div className="space-y-2 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label>客戶</Label>
                  <Select value={form.customerId ? String(form.customerId) : "__none__"}
                    onValueChange={v => {
                      if (v === "__none__") { setForm(f => ({ ...f, customerId: null, customerName: "" })); return; }
                      const c = (customers ?? []).find((c: any) => c.id === parseInt(v));
                      setForm(f => ({ ...f, customerId: parseInt(v), customerName: c?.companyName ?? "" }));
                    }}>
                    <SelectTrigger><SelectValue placeholder="選擇批發客戶" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">（不指定）</SelectItem>
                      {(customers ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>訂單日期 *</Label>
                  <Input type="date" required value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>預計交貨日</Label>
                  <Input type="date" value={form.expectedDelivery} onChange={e => setForm(f => ({ ...f, expectedDelivery: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>業務</Label>
                  <Input value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>訂單狀態</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">商品明細</p>
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    onClick={() => setForm(f => ({ ...f, items: [...f.items, makeItem()] }))}>
                    <Plus className="h-3 w-3" />新增品項
                  </Button>
                </div>
                <Separator className="mb-3" />
                {form.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">尚無品項</p>
                ) : (
                  <div className="space-y-2">
                    {form.items.map((it, idx) => {
                      const amt = it.qty * it.unitPrice * (1 - it.discount / 100);
                      return (
                        <div key={idx} className="border rounded-lg p-3 bg-muted/20">
                          <div className="flex gap-2 items-start">
                            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">商品名稱 *</Label>
                                <Input list={`oprod-list-${idx}`} className="h-8 text-sm" value={it.productName}
                                  onChange={e => {
                                    const name = e.target.value;
                                    const found = (products ?? []).find((p: any) => p.name === name);
                                    updateItem(idx, found
                                      ? {
                                          productName: found.name,
                                          productId: found.id,
                                          brand: found.brand ?? "",
                                          model: found.model ?? "",
                                          unit: found.unit ?? "台",
                                          unitPrice: found.effectivePrice ?? parseFloat(found.wholesalePrice ?? found.retailPrice ?? "0"),
                                        }
                                      : { productName: name });
                                  }} />
                                <datalist id={`oprod-list-${idx}`}>
                                  {(products ?? []).map((p: any) => <option key={p.id} value={p.name} />)}
                                </datalist>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">品牌</Label>
                                <Input className="h-8 text-sm" value={it.brand} onChange={e => updateItem(idx, { brand: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">型號</Label>
                                <Input className="h-8 text-sm" value={it.model} onChange={e => updateItem(idx, { model: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">單位</Label>
                                <Input className="h-8 text-sm" value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">數量</Label>
                                <Input type="number" min="1" className="h-8 text-sm" value={it.qty} onChange={e => updateItem(idx, { qty: parseInt(e.target.value) || 1 })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">單價</Label>
                                <Input type="number" min="0" step="1" className="h-8 text-sm" value={it.unitPrice} onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">折扣 %</Label>
                                <Input type="number" min="0" max="100" step="0.1" className="h-8 text-sm" value={it.discount} onChange={e => updateItem(idx, { discount: parseFloat(e.target.value) || 0 })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">小計</Label>
                                <div className="h-8 flex items-center text-sm font-medium px-2">{fmtMoney(amt)}</div>
                              </div>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>稅率 (%)</Label>
                      <Input type="number" min="0" max="100" step="0.1" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>運費</Label>
                      <Input type="number" min="0" step="1" value={form.shippingFee} onChange={e => setForm(f => ({ ...f, shippingFee: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>備註</Label>
                    <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">小計</span><span>{fmtMoney(subtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">稅額 ({form.taxRate}%)</span><span>{fmtMoney(taxAmount)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">運費</span><span>{fmtMoney(form.shippingFee)}</span></div>
                  <Separator />
                  <div className="flex justify-between font-bold text-base"><span>合計</span><span>{fmtMoney(total)}</span></div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={close_}>取消</Button>
                <Button type="submit" disabled={isPending}>{editId ? "儲存" : "新增訂單"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Receivable + payment */}
      <Dialog open={receivableOrderId !== null} onOpenChange={open => !open && setReceivableOrderId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>應收款明細{receivableOrder?.orderNumber ? ` — ${receivableOrder.orderNumber}` : ""}</DialogTitle>
          </DialogHeader>
          {!receivableOrder ? (
            <p className="text-sm text-muted-foreground text-center py-6">找不到出貨單</p>
          ) : receivableOrder.status !== "已出貨" ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              尚無應收款。<br />將訂單狀態更新為「已出貨」後即可直接在此登記收款。
            </p>
          ) : (
            <div className="space-y-4">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{receivableOrder.customerName || "（未指定客戶）"}</span>
                  <Badge className={PAY_STATUS_CLASS[recStatus]}>{recStatus}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">總金額</p>
                    <p className="font-medium">{fmtMoney(recTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">已收金額</p>
                    <p className="font-medium text-green-700">{fmtMoney(recReceived)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">待收金額</p>
                    <p className="font-medium text-red-600">{fmtMoney(recOutstanding)}</p>
                  </div>
                </div>
              </div>

              {recOutstanding > 0 && (
                <div className="space-y-3 border rounded-lg p-3">
                  <p className="text-sm font-medium">登記收款</p>
                  <div className="space-y-1">
                    <Label>本次收款金額</Label>
                    <Input type="number" min="0" step="1" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>收款日期</Label>
                    <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>收款方式</Label>
                    <Select value={payMethod} onValueChange={setPayMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WHOLESALE_PAYMENT_METHODS.map(method => (
                          <SelectItem key={method} value={method}>{method}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>備註</Label>
                    <Textarea value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="選填" />
                  </div>
                  <Button className="w-full" onClick={submitOrderPayment} disabled={paying}>
                    {paying ? "處理中…" : "確認收款"}
                  </Button>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium mb-2">收款紀錄</h3>
                {orderPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚未登記收款</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-1 pr-2">日期</th>
                        <th className="py-1 pr-2 text-right">金額</th>
                        <th className="py-1 pr-2">方式</th>
                        <th className="py-1 pr-2">備註</th>
                        <th className="py-1 text-right">刪除</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderPayments.map(payment => (
                        <tr key={payment.id} className="border-b">
                          <td className="py-1.5 pr-2">{(payment.paymentDate ?? "").replace(/-/g, "/")}</td>
                          <td className="py-1.5 pr-2 text-right">{fmtMoney(parseMoney(payment.amount))}</td>
                          <td className="py-1.5 pr-2">{payment.paymentMethod ?? "—"}</td>
                          <td className="py-1.5 pr-2">{payment.note ?? "—"}</td>
                          <td className="py-1.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-red-600"
                              disabled={deletingPaymentId === payment.id}
                              onClick={() => void removeOrderPayment(payment.id)}
                            >
                              刪除
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceivableOrderId(null)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定刪除此批發訂單？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
