import { useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useListMaintenanceReminders, useCreateMaintenanceReminder, useUpdateMaintenanceReminder, useDeleteMaintenanceReminder, getListMaintenanceRemindersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, CheckCircle, Clock, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["待處理", "已完成"];

function isOverdue(date: string) { return new Date(date) < new Date() && new Date(date).setHours(0,0,0,0) < new Date().setHours(0,0,0,0); }
function isUpcoming(date: string) { const d = new Date(date); const diff = (d.getTime() - Date.now()) / 86400000; return diff >= 0 && diff <= 30; }

export default function Maintenance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const [statusFilter, setStatusFilter] = useState("全部");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const params: Record<string, string | number> = {};
  if (filterCustomerId) params.customerId = filterCustomerId;
  if (statusFilter !== "全部") params.status = statusFilter;
  if (upcomingOnly) params.upcoming = "true";
  const { data: reminders, isLoading } = useListMaintenanceReminders(params);
  const createMutation = useCreateMaintenanceReminder({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMaintenanceRemindersQueryKey() }); setShowCreate(false); toast({ title: "保養提醒已新增" }); } } });
  const updateMutation = useUpdateMaintenanceReminder({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMaintenanceRemindersQueryKey() }); toast({ title: "狀態已更新" }); } } });
  const deleteMutation = useDeleteMaintenanceReminder({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMaintenanceRemindersQueryKey() }); setDeleteId(null); toast({ title: "保養提醒已刪除" }); } } });

  const emptyForm = { customerId: 0, reminderDate: "", description: "", status: "待處理", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [formCustomer, setFormCustomer] = useState<CustomerSelectorValue | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">保養提醒</h1><p className="text-sm text-muted-foreground mt-0.5">管理所有冷氣保養排程</p></div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增提醒</Button>
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/maintenance")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {["全部", ...STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>{s}</button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-2">
          <input type="checkbox" checked={upcomingOnly} onChange={e => setUpcomingOnly(e.target.checked)} className="rounded" />
          只顯示30天內到期
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : reminders && reminders.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {reminders.map(r => {
              const overdue = r.status === "待處理" && isOverdue(r.reminderDate);
              const upcoming = r.status === "待處理" && !overdue && isUpcoming(r.reminderDate);
              return (
                <div key={r.id} className={`px-4 py-3 flex items-center justify-between ${overdue ? "bg-red-50" : upcoming ? "bg-amber-50" : ""}`}>
                  <div className="flex items-start gap-2 flex-1">
                    {r.status === "已完成" ? <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> :
                     overdue ? <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> :
                     <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.description}</p>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                        <span>{r.customerName}</span>
                        <span>{r.reminderDate}</span>
                        {overdue && <span className="text-red-600 font-medium">已逾期</span>}
                        {upcoming && <span className="text-amber-600 font-medium">即將到期</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {r.status === "待處理" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "已完成" } })}>完成</Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無保養提醒</p></CardContent></Card>
      )}

      <Dialog open={showCreate} onOpenChange={open => { setShowCreate(open); if (!open) { setFormCustomer(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增保養提醒</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ data: form }); }} className="space-y-3">
            <div className="space-y-1.5">
              <Label>客戶 *</Label>
              <CustomerSelector
                value={formCustomer}
                onChange={v => { setFormCustomer(v); setForm(f => ({ ...f, customerId: v?.customerId ?? 0 })); }}
                allowTemp={false}
              />
            </div>
            <div className="space-y-1.5"><Label>提醒日期 *</Label><Input required type="date" value={form.reminderDate} onChange={e => setForm(f => ({ ...f, reminderDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>說明 *</Label><Input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="例：年度冷氣清洗保養" /></div>
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
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除這筆保養提醒嗎？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
