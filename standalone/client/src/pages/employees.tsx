import { useState } from "react";
import {
  useListEmployees, useCreateEmployee, useUpdateEmployee,
  useListEmployeesPerformance, useGetEmployeePerformance,
  getListEmployeesQueryKey,
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
import { Plus, Pencil, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POSITIONS = ["業務", "師傅技師", "行政", "會計", "老闆"];

const POSITION_COLORS: Record<string, string> = {
  "業務": "bg-blue-100 text-blue-700",
  "師傅技師": "bg-purple-100 text-purple-700",
  "行政": "bg-orange-100 text-orange-700",
  "會計": "bg-pink-100 text-pink-700",
  "老闆": "bg-amber-100 text-amber-700",
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMoney(n: number) {
  return `NT$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function PerformanceSummary({ perf }: { perf?: { sales: any; technician: any } }) {
  if (!perf) return null;
  return (
    <div className="text-[11px] text-muted-foreground mt-1 flex gap-x-3 gap-y-0.5 flex-wrap">
      <span>業績 {fmtMoney(perf.sales.performanceAmount)}</span>
      <span>報價 {perf.sales.quoteCount}</span>
      <span>成交 {perf.sales.wonCount}</span>
      <span>安裝 {perf.technician.installCount}</span>
      <span>保養 {perf.technician.maintenanceCount}</span>
      <span>維修 {perf.technician.repairCount}</span>
    </div>
  );
}

function PerformanceCards({ perf }: { perf: { sales: any; technician: any } }) {
  return (
    <div className="space-y-3 pt-2 border-t">
      <p className="text-xs font-semibold text-muted-foreground">業務績效</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["報價件數", perf.sales.quoteCount],
          ["報價金額", fmtMoney(perf.sales.quoteAmount)],
          ["成交件數", perf.sales.wonCount],
          ["成交金額", fmtMoney(perf.sales.wonAmount)],
          ["成交率", fmtPct(perf.sales.winRate)],
          ["平均客單價", fmtMoney(perf.sales.avgTicket)],
          ["本月業績", fmtMoney(perf.sales.performanceAmount)],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-md border px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs font-semibold text-muted-foreground">技師績效</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["安裝件數", perf.technician.installCount],
          ["保養件數", perf.technician.maintenanceCount],
          ["維修件數", perf.technician.repairCount],
          ["完成派工", perf.technician.completedWorkOrderCount],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-md border px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Employees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("在職");
  const [month, setMonth] = useState(currentMonth());
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [disableId, setDisableId] = useState<number | null>(null);

  const { data: employees, isLoading } = useListEmployees({});
  const { data: performanceList } = useListEmployeesPerformance({ month });
  const { data: editPerformance } = useGetEmployeePerformance(editItem?.id ?? 0, { month }, { query: { enabled: !!editItem } as any });

  const perfByEmployeeId = new Map((performanceList ?? []).map(p => [p.employeeId, p]));

  const createMutation = useCreateEmployee({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        setShowCreate(false);
        toast({ title: "員工已新增" });
      },
    },
  });
  const updateMutation = useUpdateEmployee({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        setEditItem(null);
        setDisableId(null);
        toast({ title: "員工資料已更新" });
      },
    },
  });

  const emptyForm = { name: "", phone: "", position: "業務", status: "在職", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const filtered = (employees ?? []).filter(
    e => statusFilter === "全部" || e.status === statusFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">員工管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理公司員工資料</p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" />新增員工
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {["全部", "在職", "配合", "離職"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            {s}
          </button>
        ))}
        <Input type="month" className="h-8 w-36 text-xs ml-auto" value={month} onChange={e => setMonth(e.target.value)} />
        <span className="text-xs text-muted-foreground self-center">共 {filtered.length} 人</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map(e => (
                <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{e.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${POSITION_COLORS[e.position] ?? "bg-gray-100 text-gray-700"}`}>
                        {e.position}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        e.status === "在職" ? "bg-green-100 text-green-700"
                        : e.status === "配合" ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-500"
                      }`}>
                        {e.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                      {e.phone && <span>{e.phone}</span>}
                      {e.notes && <span className="truncate max-w-xs">{e.notes}</span>}
                    </div>
                    <PerformanceSummary perf={perfByEmployeeId.get(e.id)} />
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => {
                        setForm({ name: e.name, phone: e.phone ?? "", position: e.position, status: e.status, notes: e.notes ?? "" });
                        setEditItem(e);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {e.status !== "離職" && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-orange-600 hover:text-orange-700"
                        title="標記為離職" onClick={() => setDisableId(e.id)}
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {statusFilter === "全部" ? "尚無員工資料" : `目前無「${statusFilter}」的員工`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      {[showCreate && "create", editItem && "edit"].filter(Boolean).map(mode => (
        <Dialog key={mode as string} open={true} onOpenChange={() => mode === "create" ? setShowCreate(false) : setEditItem(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{mode === "create" ? "新增員工" : "編輯員工"}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={e => {
                e.preventDefault();
                if (mode === "create") {
                  createMutation.mutate({ data: form });
                } else {
                  updateMutation.mutate({ id: editItem.id, data: form });
                }
              }}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label>姓名 *</Label>
                <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>電話</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>職務</Label>
                  <Select value={form.position} onValueChange={v => setForm(f => ({ ...f, position: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>狀態</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="在職">在職</SelectItem>
                      <SelectItem value="配合">配合</SelectItem>
                      <SelectItem value="離職">離職</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>備註</Label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {mode === "edit" && editPerformance && <PerformanceCards perf={editPerformance} />}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => mode === "create" ? setShowCreate(false) : setEditItem(null)}>取消</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>儲存</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ))}

      {/* Disable Confirm */}
      <AlertDialog open={disableId !== null} onOpenChange={open => !open && setDisableId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認停用</AlertDialogTitle>
            <AlertDialogDescription>
              確定要將此員工標記為「離職」？歷史資料與派工紀錄將完整保留，之後仍可透過編輯重新調整狀態。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disableId && updateMutation.mutate({ id: disableId, data: { status: "離職" } })}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              停用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
