import { useState } from "react";
import {
  useListWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useDeleteWorkOrder,
  useListCustomers, useListProgress, useCreateProgress,
  useCreatePayment,
  getListWorkOrdersQueryKey, getListProgressQueryKey, getListPaymentsQueryKey,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["待處理", "進行中", "已完成", "已取消"];
const STATUS_COLORS: Record<string, string> = {
  "待處理": "bg-amber-100 text-amber-700",
  "進行中": "bg-blue-100 text-blue-700",
  "已完成": "bg-green-100 text-green-700",
  "已取消": "bg-gray-100 text-gray-700",
};

function ProgressPanel({ workOrderId, customerId, workOrderTitle }: { workOrderId: number; customerId: number; workOrderTitle: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: progress } = useListProgress(workOrderId);
  const [note, setNote] = useState("");
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, paymentDate: new Date().toISOString().split("T")[0], paymentMethod: "現金", notes: "" });

  const createProgress = useCreateProgress({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProgressQueryKey(workOrderId) });
        setNote("");
        toast({ title: "進度紀錄已新增" });
      }
    }
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
        setShowPayForm(false);
        toast({ title: "收款已登錄" });
      }
    }
  });

  const METHODS = ["現金", "銀行轉帳", "支票", "LINE Pay", "其他"];

  return (
    <div className="mt-3 ml-2 pl-3 border-l-2 border-muted space-y-3">
      {/* Progress history */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">工程進度紀錄</p>
        {progress && progress.length > 0 ? progress.map(p => (
          <div key={p.id} className="text-xs bg-muted/30 rounded p-2">
            <p className="font-medium">{p.description}</p>
            <p className="text-muted-foreground mt-0.5">{new Date(p.createdAt).toLocaleString("zh-TW")} {p.recordedBy && `· ${p.recordedBy}`}</p>
          </div>
        )) : <p className="text-xs text-muted-foreground">尚無進度紀錄</p>}
      </div>

      {/* Add progress */}
      <div className="flex gap-2">
        <Input className="text-xs h-8 flex-1" placeholder="新增進度說明..." value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && note) { createProgress.mutate({ workOrderId, data: { description: note } }); } }} />
        <Button size="sm" className="h-8 text-xs px-3" disabled={!note || createProgress.isPending} onClick={() => createProgress.mutate({ workOrderId, data: { description: note } })}>新增</Button>
      </div>

      {/* Quick payment button */}
      {!showPayForm && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowPayForm(true)}>
          <CreditCard className="h-3 w-3 mr-1" />登錄收款
        </Button>
      )}

      {showPayForm && (
        <div className="bg-muted/30 rounded p-3 space-y-2">
          <p className="text-xs font-medium">快速登錄收款</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">金額</Label>
              <Input className="h-7 text-xs" type="number" value={payForm.amount || ""} onChange={e => setPayForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">日期</Label>
              <Input className="h-7 text-xs" type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">付款方式</Label>
            <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">備註</Label>
            <Input className="h-7 text-xs" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder={workOrderTitle} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowPayForm(false)} variant="ghost">取消</Button>
            <Button size="sm" className="h-7 text-xs" disabled={!payForm.amount || createPayment.isPending} onClick={() => createPayment.mutate({ data: { customerId, workOrderId, ...payForm } })}>儲存收款</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: orders, isLoading } = useListWorkOrders(statusFilter !== "全部" ? { status: statusFilter } : {});
  const { data: customers } = useListCustomers({});
  const createMutation = useCreateWorkOrder({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() }); setShowCreate(false); toast({ title: "派工單已新增" }); } } });
  const updateMutation = useUpdateWorkOrder({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() }); setEditItem(null); toast({ title: "派工單已更新" }); } } });
  const deleteMutation = useDeleteWorkOrder({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() }); setDeleteId(null); toast({ title: "派工單已刪除" }); } } });

  const emptyForm = { customerId: 0, title: "", description: "", assignedTo: "", scheduledDate: "", completedDate: "", status: "待處理", notes: "" };
  const [form, setForm] = useState(emptyForm);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">派工單管理</h1><p className="text-sm text-muted-foreground mt-0.5">管理所有施工派工單</p></div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增派工單</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["全部", ...STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>{s}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : orders && orders.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {orders.map(o => (
              <div key={o.id} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{o.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[o.status] ?? ""}`}>{o.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                      <span className="font-medium text-foreground">{o.customerName}</span>
                      {o.assignedTo && <span>負責：{o.assignedTo}</span>}
                      {o.scheduledDate && <span>預定：{o.scheduledDate}</span>}
                      {o.completedDate && <span className="text-green-600">完成：{o.completedDate}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="展開進度" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                      {expandedId === o.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm({ customerId: o.customerId, title: o.title, description: o.description ?? "", assignedTo: o.assignedTo ?? "", scheduledDate: o.scheduledDate ?? "", completedDate: o.completedDate ?? "", status: o.status, notes: o.notes ?? "" }); setEditItem(o); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(o.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                {expandedId === o.id && (
                  <ProgressPanel workOrderId={o.id} customerId={o.customerId} workOrderTitle={o.title} />
                )}
              </div>
            ))}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無派工單資料</p></CardContent></Card>
      )}

      {/* Create / Edit Dialog */}
      {[showCreate && "create", editItem && "edit"].filter(Boolean).map(mode => (
        <Dialog key={mode as string} open={true} onOpenChange={() => mode === "create" ? setShowCreate(false) : setEditItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{mode === "create" ? "新增派工單" : "編輯派工單"}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); mode === "create" ? createMutation.mutate({ data: form }) : updateMutation.mutate({ id: editItem.id, data: { ...form, completedDate: form.completedDate || undefined } }); }} className="space-y-3">
              {mode === "create" && (
                <div className="space-y-1.5">
                  <Label>客戶 *</Label>
                  <Select value={String(form.customerId || "")} onValueChange={v => setForm(f => ({ ...f, customerId: parseInt(v) }))}>
                    <SelectTrigger><SelectValue placeholder="選擇客戶" /></SelectTrigger>
                    <SelectContent>{customers?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label>標題 *</Label><Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>說明</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>負責師傅</Label><Input value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>狀態</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>預定日期</Label><Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>完成日期</Label><Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} /></div>
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
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除這筆派工單嗎？相關進度紀錄也會一併刪除。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
