import { useState, useEffect, useMemo } from "react";
import {
  useListWholesaleQuotes, useCreateWholesaleQuote, useUpdateWholesaleQuote,
  useDeleteWholesaleQuote, useConvertWholesaleQuote, useGetWholesaleQuote,
  useListWholesaleCustomers, useListWholesaleProducts,
  getListWholesaleQuotesQueryKey, getListWholesaleOrdersQueryKey,
  getGetWholesaleQuoteQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, Search, FileText, X, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const STATUSES = ["草稿", "已送出", "已接受", "已拒絕", "已過期"];
const STATUS_COLORS: Record<string, string> = {
  "草稿": "bg-gray-100 text-gray-700",
  "已送出": "bg-blue-100 text-blue-700",
  "已接受": "bg-green-100 text-green-700",
  "已拒絕": "bg-red-100 text-red-700",
  "已過期": "bg-amber-100 text-amber-700",
};

interface QItem {
  productId: number | null;
  productName: string;
  brand: string;
  model: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

function makeItem(): QItem {
  return { productId: null, productName: "", brand: "", model: "", unit: "台", qty: 1, unitPrice: 0, discount: 0 };
}

interface QForm {
  customerId: number | null;
  customerName: string;
  quoteDate: string;
  expiryDate: string;
  salesperson: string;
  notes: string;
  taxRate: number;
  shippingFee: number;
  status: string;
  items: QItem[];
}

function emptyForm(): QForm {
  return {
    customerId: null, customerName: "", quoteDate: new Date().toISOString().split("T")[0],
    expiryDate: "", salesperson: "", notes: "", taxRate: 0, shippingFee: 0, status: "草稿", items: [],
  };
}

function fromData(d: any): QForm {
  return {
    customerId: d.customerId ?? null,
    customerName: d.customerName ?? "",
    quoteDate: d.quoteDate ?? new Date().toISOString().split("T")[0],
    expiryDate: d.expiryDate ?? "",
    salesperson: d.salesperson ?? "",
    notes: d.notes ?? "",
    taxRate: parseFloat(d.taxRate ?? "0"),
    shippingFee: parseFloat(d.shippingFee ?? "0"),
    status: d.status ?? "草稿",
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

function computedSubtotal(items: QItem[]) {
  return items.reduce((sum, it) => sum + it.qty * it.unitPrice * (1 - it.discount / 100), 0);
}

function fmtMoney(n: number) {
  return `NT$ ${Math.round(n).toLocaleString()}`;
}

function fmtMoneyStr(s: string | null | undefined) {
  if (!s) return "—";
  const n = parseFloat(s);
  return isNaN(n) ? "—" : `NT$ ${Math.round(n).toLocaleString()}`;
}

export default function WholesaleQuotes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user && ["super_admin", "owner", "admin", "sales"].includes(user.role);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [convertId, setConvertId] = useState<number | null>(null);
  const [form, setForm] = useState<QForm>(emptyForm());

  const { data: quotes, isLoading } = useListWholesaleQuotes({
    ...(search ? { search } : {}),
    ...(statusFilter !== "全部" ? { status: statusFilter } : {}),
  });

  const { data: editData, isLoading: editLoading } = useGetWholesaleQuote(
    editId ?? 0,
    { query: { enabled: !!editId, queryKey: getGetWholesaleQuoteQueryKey(editId ?? 0) } }
  );

  const { data: customers } = useListWholesaleCustomers({});
  const { data: products } = useListWholesaleProducts({ forSelection: "true" });

  useEffect(() => {
    if (editData && editId) setForm(fromData(editData));
  }, [editData, editId]);

  const invQuotes = () => qc.invalidateQueries({ queryKey: getListWholesaleQuotesQueryKey() });
  const invOrders = () => qc.invalidateQueries({ queryKey: getListWholesaleOrdersQueryKey() });

  const createMut = useCreateWholesaleQuote({ mutation: { onSuccess: () => { invQuotes(); close_(); toast({ title: "批發報價單已新增" }); } } });
  const updateMut = useUpdateWholesaleQuote({ mutation: { onSuccess: () => { invQuotes(); close_(); toast({ title: "已更新" }); } } });
  const deleteMut = useDeleteWholesaleQuote({ mutation: { onSuccess: () => { invQuotes(); setDeleteId(null); toast({ title: "已刪除" }); } } });
  const convertMut = useConvertWholesaleQuote({ mutation: { onSuccess: () => { invQuotes(); invOrders(); setConvertId(null); toast({ title: "已轉為批發訂單" }); } } });

  function close_() { setShowDialog(false); setEditId(null); setForm(emptyForm()); }
  function openCreate() { setForm(emptyForm()); setEditId(null); setShowDialog(true); }
  function openEdit(id: number) { setEditId(id); setShowDialog(true); }

  function updateItem(idx: number, patch: Partial<QItem>) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      customerId: form.customerId,
      customerName: form.customerName || undefined,
      quoteDate: form.quoteDate,
      expiryDate: form.expiryDate || undefined,
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

  const subtotal = computedSubtotal(form.items);
  const taxAmount = subtotal * form.taxRate / 100;
  const total = subtotal + taxAmount + form.shippingFee;
  const isPending = createMut.isPending || updateMut.isPending;
  const list = quotes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發報價單</h1>
          <p className="text-sm text-muted-foreground">共 {list.length} 筆</p>
        </div>
        {canWrite && <Button onClick={openCreate} className="shrink-0"><Plus className="h-4 w-4 mr-1" />新增報價單</Button>}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="搜尋報價單號、客戶名稱…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部">全部狀態</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-14 text-center">
          <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">尚無批發報價單</p>
          {canWrite && <Button className="mt-3" size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新增</Button>}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map((q: any) => (
            <Card key={q.id}>
              <CardContent className="p-4">
                <div className="flex gap-3 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-1">
                      {q.quoteNumber && <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{q.quoteNumber}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[q.status] ?? "bg-gray-100 text-gray-700"}`}>{q.status}</span>
                    </div>
                    <p className="font-semibold">{q.customerName || "（未指定客戶）"}</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                      <span>報價日：{q.quoteDate}</span>
                      {q.expiryDate && <span>有效至：{q.expiryDate}</span>}
                      {q.salesperson && <span>業務：{q.salesperson}</span>}
                    </div>
                    <p className="text-sm font-medium mt-1">合計：{fmtMoneyStr(q.total)}</p>
                  </div>
                  {canWrite && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openEdit(q.id)}><Pencil className="h-3 w-3" />編輯</Button>
                      {q.status === "草稿" || q.status === "已送出" ? (
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setConvertId(q.id)}><ArrowRight className="h-3 w-3" />轉訂單</Button>
                      ) : null}
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3 w-3" />刪除</Button>
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
        <DialogContent className="max-w-4xl w-full max-h-[95dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editId ? `編輯報價單` : "新增批發報價單"}</DialogTitle>
          </DialogHeader>
          {editId && editLoading ? (
            <div className="space-y-2 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-1">
              {/* Header */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label>客戶</Label>
                  <Select
                    value={form.customerId ? String(form.customerId) : "__none__"}
                    onValueChange={v => {
                      if (v === "__none__") { setForm(f => ({ ...f, customerId: null, customerName: "" })); return; }
                      const c = (customers ?? []).find((c: any) => c.id === parseInt(v));
                      setForm(f => ({ ...f, customerId: parseInt(v), customerName: c?.companyName ?? "" }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="選擇批發客戶" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">（不指定）</SelectItem>
                      {(customers ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>報價日期 *</Label>
                  <Input type="date" required value={form.quoteDate} onChange={e => setForm(f => ({ ...f, quoteDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>有效期限</Label>
                  <Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>業務</Label>
                  <Input value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>狀態</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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
                  <p className="text-sm text-muted-foreground text-center py-4">尚無品項，點擊「新增品項」加入</p>
                ) : (
                  <div className="space-y-2">
                    {form.items.map((it, idx) => {
                      const amt = it.qty * it.unitPrice * (1 - it.discount / 100);
                      return (
                        <div key={idx} className="border rounded-lg p-3 bg-muted/20">
                          <div className="flex gap-2 items-start">
                            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="col-span-2 sm:col-span-2 space-y-1">
                                <Label className="text-xs">商品名稱 *</Label>
                                <Input
                                  list={`prod-list-${idx}`}
                                  className="h-8 text-sm"
                                  placeholder="輸入或選擇商品"
                                  value={it.productName}
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
                                      : { productName: name }
                                    );
                                  }}
                                />
                                <datalist id={`prod-list-${idx}`}>
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

              {/* Totals + Notes */}
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
                <Button type="submit" disabled={isPending}>{editId ? "儲存" : "新增報價單"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定刪除此批發報價單？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert to Order */}
      <AlertDialog open={convertId !== null} onOpenChange={open => !open && setConvertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>轉為批發訂單</AlertDialogTitle>
            <AlertDialogDescription>確定將此報價單轉為批發訂單？報價單狀態將更新為「已接受」，並自動建立新訂單。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => convertId && convertMut.mutate({ id: convertId })}>確認轉換</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
