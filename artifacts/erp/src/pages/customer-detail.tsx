import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetCustomer, useUpdateCustomer, getGetCustomerQueryKey,
  useListAcUnits, useCreateAcUnit, useDeleteAcUnit, getListAcUnitsQueryKey,
  useListQuotes, getListQuotesQueryKey,
  useListWorkOrders, getListWorkOrdersQueryKey,
  useListPayments, getListPaymentsQueryKey,
  useListWarranties, getListWarrantiesQueryKey,
  useListMaintenanceReminders, getListMaintenanceRemindersQueryKey,
  useCreateMaintenanceReminder,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  "草稿": "bg-gray-100 text-gray-700",
  "已送出": "bg-blue-100 text-blue-700",
  "已接受": "bg-green-100 text-green-700",
  "已拒絕": "bg-red-100 text-red-700",
  "待處理": "bg-amber-100 text-amber-700",
  "進行中": "bg-blue-100 text-blue-700",
  "已完成": "bg-green-100 text-green-700",
  "已取消": "bg-gray-100 text-gray-700",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const [, navigate] = useLocation();
  const id = parseInt(params?.id ?? "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useGetCustomer(id);
  const { data: acUnits } = useListAcUnits(id);
  const { data: quotes } = useListQuotes({ customerId: id });
  const { data: workOrders } = useListWorkOrders({ customerId: id });
  const { data: payments } = useListPayments({ customerId: id });
  const { data: warranties } = useListWarranties({ customerId: id });
  const { data: reminders } = useListMaintenanceReminders({ customerId: id });

  const updateMutation = useUpdateCustomer({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(id) }); setEditing(false); toast({ title: "客戶資料已更新" }); } } });
  const createAcMutation = useCreateAcUnit({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAcUnitsQueryKey(id) }); setShowAcForm(false); toast({ title: "冷氣設備已新增" }); } } });
  const deleteAcMutation = useDeleteAcUnit({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAcUnitsQueryKey(id) }); } } });
  const createReminderMutation = useCreateMaintenanceReminder({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMaintenanceRemindersQueryKey({ customerId: id }) }); setShowReminderForm(false); toast({ title: "保養提醒已新增" }); } } });

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", email: "", discountScheme: "", notes: "" });
  const [showAcForm, setShowAcForm] = useState(false);
  const [acForm, setAcForm] = useState({ brand: "", model: "", serialNumber: "", purchaseDate: "", installationDate: "", notes: "" });
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderForm, setReminderForm] = useState({ reminderDate: "", description: "", status: "待處理", notes: "" });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
  if (!customer) return <div className="py-12 text-center text-muted-foreground">找不到客戶資料</div>;

  function startEdit() {
    setEditForm({ name: customer!.name, phone: customer!.phone, address: customer!.address, email: customer!.email ?? "", discountScheme: customer!.discountScheme ?? "", notes: customer!.notes ?? "" });
    setEditing(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">{customer.name}</h1>
          <p className="text-xs text-muted-foreground">{customer.phone} · {customer.address}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={startEdit}><Pencil className="h-3.5 w-3.5 mr-1" />編輯</Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="w-full flex">
          <TabsTrigger value="info" className="flex-1 text-xs">基本資料</TabsTrigger>
          <TabsTrigger value="ac" className="flex-1 text-xs">冷氣設備</TabsTrigger>
          <TabsTrigger value="quotes" className="flex-1 text-xs">報價單</TabsTrigger>
          <TabsTrigger value="work" className="flex-1 text-xs">派工單</TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 text-xs">收款</TabsTrigger>
          <TabsTrigger value="warranties" className="flex-1 text-xs">保固</TabsTrigger>
          <TabsTrigger value="reminders" className="flex-1 text-xs">保養提醒</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card><CardContent className="pt-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div><span className="text-muted-foreground">姓名：</span>{customer.name}</div>
              <div><span className="text-muted-foreground">電話：</span>{customer.phone}</div>
              <div className="col-span-2"><span className="text-muted-foreground">地址：</span>{customer.address}</div>
              {customer.email && <div><span className="text-muted-foreground">Email：</span>{customer.email}</div>}
              {customer.discountScheme && <div><span className="text-muted-foreground">折扣方案：</span>{customer.discountScheme}</div>}
              {customer.notes && <div className="col-span-2"><span className="text-muted-foreground">備註：</span>{customer.notes}</div>}
              <div className="col-span-2 text-xs text-muted-foreground">建立時間：{new Date(customer.createdAt).toLocaleDateString("zh-TW")}</div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ac">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowAcForm(true)}><Plus className="h-3.5 w-3.5 mr-1" />新增設備</Button>
            </div>
            {acUnits && acUnits.length > 0 ? (
              <Card><CardContent className="p-0">
                <div className="divide-y">
                  {acUnits.map(u => (
                    <div key={u.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{u.brand} {u.model}</p>
                        <p className="text-xs text-muted-foreground">序號：{u.serialNumber ?? "-"} · 購買：{u.purchaseDate ?? "-"} · 安裝：{u.installationDate ?? "-"}</p>
                        {u.notes && <p className="text-xs text-muted-foreground">{u.notes}</p>}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAcMutation.mutate({ id: u.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            ) : <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">尚無冷氣設備</CardContent></Card>}
          </div>
        </TabsContent>

        <TabsContent value="quotes">
          <Card><CardContent className="p-0">
            {quotes && quotes.length > 0 ? (
              <div className="divide-y">
                {quotes.map(q => (
                  <div key={q.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{q.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(q.createdAt).toLocaleDateString("zh-TW")} · NT${Number(q.finalAmount ?? q.amount).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={q.status} />
                  </div>
                ))}
              </div>
            ) : <div className="py-8 text-center text-sm text-muted-foreground">尚無報價單</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="work">
          <Card><CardContent className="p-0">
            {workOrders && workOrders.length > 0 ? (
              <div className="divide-y">
                {workOrders.map(w => (
                  <div key={w.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{w.title}</p>
                      <p className="text-xs text-muted-foreground">{w.scheduledDate ?? "-"} · 負責人：{w.assignedTo ?? "-"}</p>
                    </div>
                    <StatusBadge status={w.status} />
                  </div>
                ))}
              </div>
            ) : <div className="py-8 text-center text-sm text-muted-foreground">尚無派工單</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card><CardContent className="p-0">
            {payments && payments.length > 0 ? (
              <div className="divide-y">
                {payments.map(p => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">NT${Number(p.amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{p.paymentDate} · {p.paymentMethod ?? "-"}</p>
                      {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="py-8 text-center text-sm text-muted-foreground">尚無收款紀錄</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="warranties">
          <Card><CardContent className="p-0">
            {warranties && warranties.length > 0 ? (
              <div className="divide-y">
                {warranties.map(w => (
                  <div key={w.id} className="px-4 py-3">
                    <p className="text-sm font-medium">{w.description ?? "保固"}</p>
                    <p className="text-xs text-muted-foreground">{w.startDate} 至 {w.endDate}</p>
                    {w.notes && <p className="text-xs text-muted-foreground">{w.notes}</p>}
                  </div>
                ))}
              </div>
            ) : <div className="py-8 text-center text-sm text-muted-foreground">尚無保固資料</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reminders">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowReminderForm(true)}><Plus className="h-3.5 w-3.5 mr-1" />新增提醒</Button>
            </div>
            <Card><CardContent className="p-0">
              {reminders && reminders.length > 0 ? (
                <div className="divide-y">
                  {reminders.map(r => (
                    <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{r.description}</p>
                        <p className="text-xs text-muted-foreground">{r.reminderDate}</p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              ) : <div className="py-8 text-center text-sm text-muted-foreground">尚無保養提醒</div>}
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Customer Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>編輯客戶資料</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id, data: editForm }); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>姓名</Label><Input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>電話</Label><Input required value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>地址</Label><Input required value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Email</Label><Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>折扣方案</Label><Input value={editForm.discountScheme} onChange={e => setEditForm(f => ({ ...f, discountScheme: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>備註</Label><Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>取消</Button>
              <Button type="submit" disabled={updateMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add AC Unit Dialog */}
      <Dialog open={showAcForm} onOpenChange={setShowAcForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增冷氣設備</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createAcMutation.mutate({ customerId: id, data: acForm }); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>品牌 *</Label><Input required value={acForm.brand} onChange={e => setAcForm(f => ({ ...f, brand: e.target.value }))} placeholder="大金、日立..." /></div>
              <div className="space-y-1.5"><Label>機型 *</Label><Input required value={acForm.model} onChange={e => setAcForm(f => ({ ...f, model: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>序號</Label><Input value={acForm.serialNumber} onChange={e => setAcForm(f => ({ ...f, serialNumber: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>購買日期</Label><Input type="date" value={acForm.purchaseDate} onChange={e => setAcForm(f => ({ ...f, purchaseDate: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>安裝日期</Label><Input type="date" value={acForm.installationDate} onChange={e => setAcForm(f => ({ ...f, installationDate: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>備註</Label><Input value={acForm.notes} onChange={e => setAcForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAcForm(false)}>取消</Button>
              <Button type="submit" disabled={createAcMutation.isPending}>新增</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Reminder Dialog */}
      <Dialog open={showReminderForm} onOpenChange={setShowReminderForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增保養提醒</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createReminderMutation.mutate({ data: { ...reminderForm, customerId: id } }); }} className="space-y-3">
            <div className="space-y-1.5"><Label>提醒日期 *</Label><Input required type="date" value={reminderForm.reminderDate} onChange={e => setReminderForm(f => ({ ...f, reminderDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>說明 *</Label><Input required value={reminderForm.description} onChange={e => setReminderForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>備註</Label><Input value={reminderForm.notes} onChange={e => setReminderForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowReminderForm(false)}>取消</Button>
              <Button type="submit" disabled={createReminderMutation.isPending}>新增</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
