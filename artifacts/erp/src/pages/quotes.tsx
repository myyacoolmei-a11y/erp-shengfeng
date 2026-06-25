import { useState } from "react";
import { useListQuotes, useCreateQuote, useUpdateQuote, useDeleteQuote, useListCustomers, getListQuotesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["草稿", "已送出", "已接受", "已拒絕"];
const STATUS_COLORS: Record<string, string> = {
  "草稿": "bg-gray-100 text-gray-700",
  "已送出": "bg-blue-100 text-blue-700",
  "已接受": "bg-green-100 text-green-700",
  "已拒絕": "bg-red-100 text-red-700",
};

export default function Quotes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: quotes, isLoading } = useListQuotes(statusFilter !== "全部" ? { status: statusFilter } : {});
  const { data: customers } = useListCustomers({});
  const createMutation = useCreateQuote({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setShowCreate(false); toast({ title: "報價單已新增" }); } } });
  const updateMutation = useUpdateQuote({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setEditItem(null); toast({ title: "報價單已更新" }); } } });
  const deleteMutation = useDeleteQuote({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setDeleteId(null); toast({ title: "報價單已刪除" }); } } });

  const emptyForm = { customerId: 0, title: "", description: "", amount: 0, discountAmount: 0, finalAmount: 0, status: "草稿", notes: "" };
  const [form, setForm] = useState(emptyForm);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">報價單管理</h1><p className="text-sm text-muted-foreground mt-0.5">管理所有客戶報價單</p></div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增報價單</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["全部", ...STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>{s}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : quotes && quotes.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {quotes.map(q => (
              <div key={q.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{q.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[q.status] ?? "bg-gray-100 text-gray-700"}`}>{q.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                    <span>{q.customerName}</span>
                    <span>NT${Number(q.finalAmount ?? q.amount).toLocaleString()}</span>
                    <span>{new Date(q.createdAt).toLocaleDateString("zh-TW")}</span>
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm({ customerId: q.customerId, title: q.title, description: q.description ?? "", amount: Number(q.amount), discountAmount: Number(q.discountAmount ?? 0), finalAmount: Number(q.finalAmount ?? q.amount), status: q.status, notes: q.notes ?? "" }); setEditItem(q); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無報價單資料</p></CardContent></Card>
      )}

      {[showCreate && "create", editItem && "edit"].filter(Boolean).map(mode => (
        <Dialog key={mode as string} open={true} onOpenChange={() => mode === "create" ? setShowCreate(false) : setEditItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{mode === "create" ? "新增報價單" : "編輯報價單"}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); mode === "create" ? createMutation.mutate({ data: form }) : updateMutation.mutate({ id: editItem.id, data: form }); }} className="space-y-3">
              {mode === "create" && (
                <div className="space-y-1.5">
                  <Label>客戶 *</Label>
                  <Select value={String(form.customerId)} onValueChange={v => setForm(f => ({ ...f, customerId: parseInt(v) }))}>
                    <SelectTrigger><SelectValue placeholder="選擇客戶" /></SelectTrigger>
                    <SelectContent>{customers?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label>標題 *</Label><Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>說明</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>原價</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div>
                <div className="space-y-1.5"><Label>折扣</Label><Input type="number" value={form.discountAmount} onChange={e => setForm(f => ({ ...f, discountAmount: parseFloat(e.target.value) || 0 }))} /></div>
                <div className="space-y-1.5"><Label>成交價</Label><Input type="number" value={form.finalAmount} onChange={e => setForm(f => ({ ...f, finalAmount: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>狀態</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>備註</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => mode === "create" ? setShowCreate(false) : setEditItem(null)}>取消</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>儲存</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ))}

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除這筆報價單嗎？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
