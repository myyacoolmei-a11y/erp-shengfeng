import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateWholesaleOrder,
  useListWholesaleCustomers,
  useListWholesaleProducts,
  getListWholesaleOrdersQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Building2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { currentMonth, formatTwd } from "../../../shared/wholesaleAccount.ts";
import {
  fetchCustomerSummary,
  fetchWholesaleSalesOptions,
  type CustomerSummary,
} from "@/lib/wholesaleAccountApi";
import { MonthSwitcher } from "@/components/wholesale/MonthSwitcher";
import { CustomerSearchSelect } from "@/components/wholesale/CustomerSearchSelect";

const ORDER_STATUSES = ["備貨中", "已出貨"];

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
  deliveryAddress: string;
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
    customerId: null,
    customerName: "",
    deliveryAddress: "",
    orderDate: new Date().toISOString().split("T")[0],
    expectedDelivery: "",
    salesperson: "",
    notes: "",
    taxRate: 0,
    shippingFee: 0,
    status: "備貨中",
    items: [makeItem()],
  };
}

function computedSubtotal(items: OItem[]) {
  return items.reduce((sum, it) => sum + it.qty * it.unitPrice * (1 - it.discount / 100), 0);
}

function fmtMoney(n: number) {
  return formatTwd(n);
}

function statusBadge(status: CustomerSummary["status"]) {
  if (status === "已結清") return <Badge className="bg-green-100 text-green-800">已結清</Badge>;
  if (status === "部分收款") return <Badge className="bg-amber-100 text-amber-800">部分收款</Badge>;
  return <Badge variant="outline">未結帳</Badge>;
}

function uniqueAddresses(customer: any): string[] {
  if (!customer) return [];
  const extras = Array.isArray(customer.deliveryAddresses) ? customer.deliveryAddresses : [];
  return Array.from(new Set([customer.address, ...extras].filter((x): x is string => Boolean(x && String(x).trim()))));
}

export default function WholesaleOrders() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user && ["super_admin", "owner", "admin", "sales"].includes(user.role);

  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [salesUser, setSalesUser] = useState("全部業務");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<OForm>(emptyForm());

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["/api/wholesale/customers/summary", month, search, salesUser],
    queryFn: () => fetchCustomerSummary({ month, search, salesUser }),
  });

  const { data: salesOptions = [] } = useQuery({
    queryKey: ["/api/wholesale/customers/sales-options"],
    queryFn: fetchWholesaleSalesOptions,
  });

  const { data: customers } = useListWholesaleCustomers({});
  const { data: products } = useListWholesaleProducts({ forSelection: "true" });

  const selectedCustomer = (customers ?? []).find((c: any) => c.id === form.customerId) as any;
  const addresses = uniqueAddresses(selectedCustomer);

  const createMut = useCreateWholesaleOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/wholesale/customers/summary"] });
        qc.invalidateQueries({ queryKey: getListWholesaleOrdersQueryKey() });
        close_();
        toast({ title: "批發訂單已建立" });
      },
      onError: (err: any) => {
        toast({ title: "新增失敗", description: err?.message ?? String(err), variant: "destructive" });
      },
    },
  });

  function close_() {
    setShowDialog(false);
    setForm(emptyForm());
  }

  useEffect(() => {
    if (!selectedCustomer) return;
    const salesName = salesOptions.find((s) => s.id === selectedCustomer.salesUserId)?.name
      ?? selectedCustomer.salesperson
      ?? "";
    setForm((f) => ({
      ...f,
      customerName: selectedCustomer.companyName ?? f.customerName,
      deliveryAddress: f.deliveryAddress || selectedCustomer.address || "",
      salesperson: f.salesperson || salesName,
    }));
  }, [selectedCustomer?.id]);

  function updateItem(idx: number, patch: Partial<OItem>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerId) {
      toast({ title: "請選擇批發客戶", variant: "destructive" });
      return;
    }
    const items = form.items.filter((it) => it.productName.trim());
    if (items.length === 0) {
      toast({ title: "請至少加入一筆品項", variant: "destructive" });
      return;
    }
    createMut.mutate({
      data: {
        customerId: form.customerId,
        customerName: form.customerName || undefined,
        deliveryAddress: form.deliveryAddress || undefined,
        orderDate: form.orderDate,
        expectedDelivery: form.expectedDelivery || undefined,
        salesperson: form.salesperson || undefined,
        notes: form.notes || undefined,
        taxRate: form.taxRate,
        shippingFee: form.shippingFee,
        status: form.status,
        items,
      } as any,
    });
  }

  const subtotal = computedSubtotal(form.items);
  const taxAmount = subtotal * form.taxRate / 100;
  const total = subtotal + taxAmount + form.shippingFee;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發訂單</h1>
          <p className="text-sm text-muted-foreground">以客戶公司為單位查看本月出貨與應收</p>
        </div>
        {canWrite && (
          <Button onClick={() => { setForm(emptyForm()); setShowDialog(true); }} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />新增出貨單
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="搜尋客戶公司名稱" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={salesUser} onValueChange={setSalesUser}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="全部業務" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部業務">全部業務</SelectItem>
            {salesOptions.map((opt) => (
              <SelectItem key={`${opt.id ?? "n"}-${opt.name}`} value={opt.name}>{opt.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : error ? (
        <p className="text-sm text-destructive">載入失敗：{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground text-sm">
            本月尚無批發客戶出貨或應收紀錄。
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">客戶公司</th>
                <th className="p-3 font-medium text-right">本月筆數</th>
                <th className="p-3 font-medium text-right">本月出貨</th>
                <th className="p-3 font-medium text-right">本月已收</th>
                <th className="p-3 font-medium text-right">本月待收</th>
                <th className="p-3 font-medium text-right">前期未收</th>
                <th className="p-3 font-medium text-right">累計應收</th>
                <th className="p-3 font-medium">最近叫貨</th>
                <th className="p-3 font-medium">業務</th>
                <th className="p-3 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = row.unbound || row.customerId == null ? "unbound" : row.customerId;
                return (
                  <tr
                    key={String(id) + row.customerName}
                    className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                    onClick={() => setLocation(`/wholesale/customers/${id}/orders?month=${encodeURIComponent(month)}`)}
                  >
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>
                          {row.customerName}
                          {row.unbound ? <span className="ml-2 text-xs font-normal text-amber-700">未綁定批發客戶</span> : null}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">{row.orderCount} 筆</td>
                    <td className="p-3 text-right tabular-nums">{fmtMoney(row.monthlySales)}</td>
                    <td className="p-3 text-right tabular-nums">{fmtMoney(row.monthlyPaid)}</td>
                    <td className="p-3 text-right tabular-nums">{fmtMoney(row.monthlyOutstanding)}</td>
                    <td className="p-3 text-right tabular-nums">{fmtMoney(row.previousOutstanding)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{fmtMoney(row.totalOutstanding)}</td>
                    <td className="p-3 whitespace-nowrap">{row.lastOrderDate ? String(row.lastOrderDate).slice(0, 10).replace(/-/g, "/") : "—"}</td>
                    <td className="p-3">{row.salesUser || "—"}</td>
                    <td className="p-3">{statusBadge(row.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => !open && close_()}>
        <DialogContent className="max-w-4xl w-full max-h-[95dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>新增批發出貨單</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">
            <div className="space-y-1">
              <Label>批發客戶 *</Label>
              <CustomerSearchSelect
                customers={customers ?? []}
                value={form.customerId}
                onChange={(c) => {
                  if (!c) {
                    setForm((f) => ({ ...f, customerId: null, customerName: "", deliveryAddress: "", salesperson: "" }));
                    return;
                  }
                  const full = (customers ?? []).find((x: any) => x.id === c.id) as any;
                  const salesName = salesOptions.find((s) => s.id === full?.salesUserId)?.name ?? "";
                  setForm((f) => ({
                    ...f,
                    customerId: c.id,
                    customerName: c.companyName,
                    deliveryAddress: full?.address ?? "",
                    salesperson: salesName,
                  }));
                }}
              />
            </div>
            {selectedCustomer && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1">
                <div>公司：{selectedCustomer.companyName}</div>
                <div>統編：{selectedCustomer.taxId || "—"}</div>
                <div>聯絡人：{selectedCustomer.contactPerson || "—"}　電話：{selectedCustomer.mobile || selectedCustomer.telephone || "—"}</div>
                <div>付款條件：{selectedCustomer.paymentTerms || "—"}</div>
                <div>負責業務：{form.salesperson || "—"}</div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>送貨地址</Label>
                {addresses.length > 1 ? (
                  <Select value={form.deliveryAddress} onValueChange={(v) => setForm((f) => ({ ...f, deliveryAddress: v }))}>
                    <SelectTrigger><SelectValue placeholder="選擇送貨地址" /></SelectTrigger>
                    <SelectContent>
                      {addresses.map((addr) => (
                        <SelectItem key={addr} value={addr}>{addr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.deliveryAddress} onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))} placeholder="送貨地址" />
                )}
              </div>
              <div className="space-y-1">
                <Label>出貨日期 *</Label>
                <Input type="date" required value={form.orderDate} onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>預計交貨日</Label>
                <Input type="date" value={form.expectedDelivery} onChange={(e) => setForm((f) => ({ ...f, expectedDelivery: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>負責業務</Label>
                <Input value={form.salesperson} onChange={(e) => setForm((f) => ({ ...f, salesperson: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>訂單狀態</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">商品明細</p>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setForm((f) => ({ ...f, items: [...f.items, makeItem()] }))}>
                  <Plus className="h-3 w-3" />新增品項
                </Button>
              </div>
              <Separator className="mb-3" />
              {form.items.map((it, idx) => {
                const amt = it.qty * it.unitPrice * (1 - it.discount / 100);
                return (
                  <div key={idx} className="border rounded-lg p-3 bg-muted/20 mb-2">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">商品名稱 *</Label>
                          <Input
                            list={`oprod-list-${idx}`}
                            className="h-8 text-sm"
                            value={it.productName}
                            onChange={(e) => {
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
                            }}
                          />
                          <datalist id={`oprod-list-${idx}`}>
                            {(products ?? []).map((p: any) => <option key={p.id} value={p.name} />)}
                          </datalist>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">數量</Label>
                          <Input type="number" min="1" className="h-8 text-sm" value={it.qty} onChange={(e) => updateItem(idx, { qty: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">單價</Label>
                          <Input type="number" min="0" step="1" className="h-8 text-sm" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">小計</Label>
                          <div className="h-8 flex items-center text-sm font-medium px-2">{fmtMoney(amt)}</div>
                        </div>
                      </div>
                      {form.items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>稅率 (%)</Label>
                    <Input type="number" min="0" max="100" step="0.1" value={form.taxRate} onChange={(e) => setForm((f) => ({ ...f, taxRate: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>運費</Label>
                    <Input type="number" min="0" step="1" value={form.shippingFee} onChange={(e) => setForm((f) => ({ ...f, shippingFee: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>備註</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
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
              <Button type="submit" disabled={createMut.isPending || !form.customerId}>{createMut.isPending ? "儲存中…" : "建立出貨單"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
