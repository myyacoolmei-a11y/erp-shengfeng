import { useState } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListPayments, useCreatePayment, useDeletePayment,
  useListQuotes, useListWorkOrders,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateStatistics } from "@/lib/invalidateStatistics";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const METHODS = ["現金", "銀行轉帳", "支票", "LINE Pay", "其他"];

function groupByMonth(payments: any[]) {
  const map: Record<string, number> = {};
  for (const p of payments) {
    const month = p.paymentDate.slice(0, 7);
    map[month] = (map[month] ?? 0) + Number(p.amount);
  }
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
}

export default function Payments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<number>(filterCustomerId ?? 0);
  const [formCustomer, setFormCustomer] = useState<CustomerSelectorValue | null>(null);

  const { data: payments, isLoading } = useListPayments(filterCustomerId ? { customerId: filterCustomerId } : {});
  const { data: quotes } = useListQuotes(selectedCustomer ? { customerId: selectedCustomer } : {});
  const { data: workOrders } = useListWorkOrders(selectedCustomer ? { customerId: selectedCustomer } : {});

  const createMutation = useCreatePayment({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(queryClient);
        setShowCreate(false);
        setSelectedCustomer(0);
        toast({ title: "收款紀錄已新增" });
      }
    }
  });
  const deleteMutation = useDeletePayment({
    mutation: {
      onSuccess: () => {
        invalidateStatistics(queryClient);
        setDeleteId(null);
        toast({ title: "收款紀錄已刪除" });
      }
    }
  });

  const emptyForm = { customerId: 0, quoteId: undefined as number | undefined, workOrderId: undefined as number | undefined, amount: 0, paymentDate: "", paymentMethod: "現金", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const total = payments?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
  const monthlyData = payments ? groupByMonth(payments) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">收款紀錄</h1>
          <p className="text-sm text-muted-foreground mt-0.5">總收款：<span className="font-semibold text-green-700">NT${total.toLocaleString("zh-TW")}</span></p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setSelectedCustomer(0); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增收款</Button>
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/payments")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      {/* Monthly breakdown */}
      {monthlyData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">月收款統計</span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {monthlyData.map(([month, amount]) => (
                <div key={month} className="text-center">
                  <p className="text-xs text-muted-foreground">{month.slice(5)}月</p>
                  <p className="text-sm font-semibold text-green-700">NT${(amount / 1000).toFixed(1)}K</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : payments && payments.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {payments.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-green-700">NT${Number(p.amount).toLocaleString()}</span>
                    {p.paymentMethod && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.paymentMethod}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                    <span className="font-medium text-foreground">{p.customerName}</span>
                    <span>{p.paymentDate}</span>
                    {p.notes && <span>{p.notes}</span>}
                    {p.quoteId && <span className="text-blue-600">報價單#{p.quoteId}</span>}
                    {p.workOrderId && <span className="text-purple-600">派工單#{p.workOrderId}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無收款紀錄</p></CardContent></Card>
      )}

      <Dialog open={showCreate} onOpenChange={open => { if (!open) { setShowCreate(false); setSelectedCustomer(0); setFormCustomer(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增收款紀錄</DialogTitle></DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            const data: any = { ...form };
            if (!data.quoteId) delete data.quoteId;
            if (!data.workOrderId) delete data.workOrderId;
            createMutation.mutate({ data });
          }} className="space-y-3">
            <div className="space-y-1.5">
              <Label>客戶 *</Label>
              <CustomerSelector
                value={formCustomer}
                onChange={v => {
                  setFormCustomer(v);
                  const cid = v?.customerId ?? 0;
                  setForm(f => ({ ...f, customerId: cid, quoteId: undefined, workOrderId: undefined }));
                  setSelectedCustomer(cid);
                }}
                allowTemp={false}
              />
            </div>

            {selectedCustomer > 0 && quotes && quotes.length > 0 && (
              <div className="space-y-1.5">
                <Label>關聯報價單</Label>
                <Select value={String(form.quoteId ?? "")} onValueChange={v => setForm(f => ({ ...f, quoteId: v ? parseInt(v) : undefined }))}>
                  <SelectTrigger><SelectValue placeholder="選擇報價單（可選）" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不關聯</SelectItem>
                    {quotes.map(q => <SelectItem key={q.id} value={String(q.id)}>{q.title} - NT${Number(q.finalAmount ?? q.amount).toLocaleString()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCustomer > 0 && workOrders && workOrders.length > 0 && (
              <div className="space-y-1.5">
                <Label>關聯派工單</Label>
                <Select value={String(form.workOrderId ?? "")} onValueChange={v => setForm(f => ({ ...f, workOrderId: v ? parseInt(v) : undefined }))}>
                  <SelectTrigger><SelectValue placeholder="選擇派工單（可選）" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不關聯</SelectItem>
                    {workOrders.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>金額 *</Label><Input required type="number" min="0" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="space-y-1.5"><Label>收款日期 *</Label><Input required type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>付款方式</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>備註</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowCreate(false); setSelectedCustomer(0); }}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除這筆收款紀錄嗎？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
