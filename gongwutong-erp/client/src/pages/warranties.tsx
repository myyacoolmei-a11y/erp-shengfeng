import { useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useListWarranties, useCreateWarranty, useDeleteWarranty, getListWarrantiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function isExpiringSoon(endDate: string) {
  const end = new Date(endDate);
  const today = new Date();
  const diff = (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 90;
}
function isExpired(endDate: string) {
  return new Date(endDate) < new Date();
}

export default function Warranties() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: warranties, isLoading } = useListWarranties(filterCustomerId ? { customerId: filterCustomerId } : {});
  const createMutation = useCreateWarranty({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListWarrantiesQueryKey() }); setShowCreate(false); toast({ title: "保固資料已新增" }); } } });
  const deleteMutation = useDeleteWarranty({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListWarrantiesQueryKey() }); setDeleteId(null); toast({ title: "保固資料已刪除" }); } } });

  const emptyForm = { customerId: 0, startDate: "", endDate: "", description: "", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [formCustomer, setFormCustomer] = useState<CustomerSelectorValue | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">保固管理</h1><p className="text-sm text-muted-foreground mt-0.5">管理所有冷氣設備保固</p></div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增保固</Button>
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/warranties")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : warranties && warranties.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {warranties.map(w => {
              const expired = isExpired(w.endDate);
              const soon = !expired && isExpiringSoon(w.endDate);
              return (
                <div key={w.id} className={`px-4 py-3 flex items-center justify-between ${soon ? "bg-amber-50" : expired ? "bg-red-50" : ""}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {(soon || expired) && <AlertTriangle className={`h-3.5 w-3.5 ${expired ? "text-red-500" : "text-amber-500"}`} />}
                      <span className="font-medium text-sm">{w.customerName}</span>
                      {w.description && <span className="text-xs text-muted-foreground">{w.description}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                      <span>{w.startDate} 至 {w.endDate}</span>
                      {expired && <span className="text-red-600 font-medium">已過期</span>}
                      {soon && <span className="text-amber-600 font-medium">即將到期</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無保固資料</p></CardContent></Card>
      )}

      <Dialog open={showCreate} onOpenChange={open => { setShowCreate(open); if (!open) { setFormCustomer(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增保固資料</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ data: form }); }} className="space-y-3">
            <div className="space-y-1.5">
              <Label>客戶 *</Label>
              <CustomerSelector
                value={formCustomer}
                onChange={v => { setFormCustomer(v); setForm(f => ({ ...f, customerId: v?.customerId ?? 0 })); }}
                allowTemp={false}
              />
            </div>
            <div className="space-y-1.5"><Label>說明</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="保固內容說明..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>開始日期 *</Label><Input required type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>結束日期 *</Label><Input required type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
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
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除這筆保固資料嗎？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
