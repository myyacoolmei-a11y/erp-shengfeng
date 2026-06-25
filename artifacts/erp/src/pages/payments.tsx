import { useState } from "react";
import { useListPayments, useCreatePayment, useDeletePayment, useListCustomers, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const METHODS = ["現金", "銀行轉帳", "支票", "LINE Pay", "其他"];

export default function Payments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: payments, isLoading } = useListPayments({});
  const { data: customers } = useListCustomers({});
  const createMutation = useCreatePayment({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() }); setShowCreate(false); toast({ title: "收款紀錄已新增" }); } } });
  const deleteMutation = useDeletePayment({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() }); setDeleteId(null); toast({ title: "收款紀錄已刪除" }); } } });

  const emptyForm = { customerId: 0, amount: 0, paymentDate: "", paymentMethod: "現金", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const total = payments?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">收款紀錄</h1>
          <p className="text-sm text-muted-foreground mt-0.5">總收款：NT${total.toLocaleString("zh-TW")}</p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增收款</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : payments && payments.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {payments.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-green-700">NT${Number(p.amount).toLocaleString()}</span>
                    {p.paymentMethod && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.paymentMethod}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                    <span>{p.customerName}</span>
                    <span>{p.paymentDate}</span>
                    {p.notes && <span>{p.notes}</span>}
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增收款紀錄</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ data: form }); }} className="space-y-3">
            <div className="space-y-1.5">
              <Label>客戶 *</Label>
              <Select value={String(form.customerId)} onValueChange={v => setForm(f => ({ ...f, customerId: parseInt(v) }))}>
                <SelectTrigger><SelectValue placeholder="選擇客戶" /></SelectTrigger>
                <SelectContent>{customers?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>金額 *</Label><Input required type="number" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div>
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
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
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
