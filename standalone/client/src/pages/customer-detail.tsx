import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetCustomer, useUpdateCustomer, getGetCustomerQueryKey,
  useListAcUnits, useCreateAcUnit, useDeleteAcUnit, getListAcUnitsQueryKey,
  useListQuotes,
  useListEmployees,
  useListWorkOrders,
  useListReceivables,
  useListWarranties,
  useListMaintenanceReminders, getListMaintenanceRemindersQueryKey,
  useCreateMaintenanceReminder,
} from "@workspace/api-client-react";
import type { Quote, WorkOrder, Receivable, Warranty, MaintenanceReminder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil, Trash2, Plus, ExternalLink, Eye } from "lucide-react";
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
  "已收款": "bg-green-100 text-green-700",
};

const PROJECT_TYPE_COLORS: Record<string, string> = {
  "新裝": "bg-blue-100 text-blue-700",
  "維修": "bg-orange-100 text-orange-700",
  "保養": "bg-purple-100 text-purple-700",
  "遷機": "bg-cyan-100 text-cyan-700",
  "清洗": "bg-teal-100 text-teal-700",
  "保固服務": "bg-green-100 text-green-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function ProjectTypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${PROJECT_TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700"}`}>
      {type}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-20 shrink-0">{label}：</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function QuoteDetailModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>報價單詳情</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <InfoRow label="報價單名稱" value={quote.title} />
          <InfoRow label="建立日期" value={new Date(quote.createdAt).toLocaleDateString("zh-TW")} />
          <InfoRow label="報價金額" value={`NT$${Number(quote.amount).toLocaleString()}`} />
          <InfoRow label="負責業務" value={quote.salesRepName} />
          {quote.discountAmount ? <InfoRow label="折扣金額" value={`NT$${Number(quote.discountAmount).toLocaleString()}`} /> : null}
          <InfoRow label="最終金額" value={`NT$${Number(quote.finalAmount ?? quote.amount).toLocaleString()}`} />
          <div className="flex gap-2 items-center">
            <span className="text-muted-foreground min-w-20 shrink-0">狀態：</span>
            <StatusBadge status={quote.status} />
          </div>
          {quote.description && <InfoRow label="說明" value={quote.description} />}
          {quote.notes && <InfoRow label="備註" value={quote.notes} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkOrderDetailModal({ workOrder, onClose }: { workOrder: WorkOrder; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>派工單詳情</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">基本資訊</p>
            <div className="space-y-1.5">
              <InfoRow label="工程編號" value={workOrder.workOrderNumber ?? `#${workOrder.id}`} />
              <InfoRow label="工程名稱" value={workOrder.title} />
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground min-w-20 shrink-0">狀態：</span>
                <StatusBadge status={workOrder.status} />
              </div>
              {workOrder.projectType && (
                <div className="flex gap-2 items-center">
                  <span className="text-muted-foreground min-w-20 shrink-0">工程類型：</span>
                  <ProjectTypeBadge type={workOrder.projectType} />
                </div>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">客戶資訊</p>
            <div className="space-y-1.5">
              <InfoRow label="聯絡人" value={workOrder.contactPerson} />
              <InfoRow label="手機" value={workOrder.mobilePhone} />
              <InfoRow label="電話" value={workOrder.telephone} />
              <InfoRow label="施工地址" value={workOrder.installAddress} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">預約資訊</p>
            <div className="space-y-1.5">
              <InfoRow label="預約日期" value={workOrder.scheduledDate ?? "-"} />
              <InfoRow label="預約時間" value={workOrder.scheduledTime} />
              <InfoRow label="完工日期" value={workOrder.completedDate} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">派工資訊</p>
            <div className="space-y-1.5">
              <InfoRow label="負責師傅" value={workOrder.assignedTo} />
              <InfoRow label="協助師傅" value={workOrder.assistantTo} />
            </div>
          </div>
          {(workOrder.acBrand || workOrder.modelNumber) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">冷氣設備</p>
              <div className="space-y-1.5">
                <InfoRow label="冷氣品牌" value={workOrder.acBrand} />
                <InfoRow label="型號" value={workOrder.modelNumber} />
                <InfoRow label="數量" value={workOrder.quantity} />
                <InfoRow label="室內機" value={workOrder.indoorUnits} />
                <InfoRow label="室外機" value={workOrder.outdoorUnits} />
                <InfoRow label="樓層" value={workOrder.floorLevel} />
                <InfoRow label="電梯" value={workOrder.hasElevator} />
              </div>
            </div>
          )}
          {(workOrder.description || workOrder.notes) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">工程說明</p>
              <div className="space-y-1.5">
                <InfoRow label="說明" value={workOrder.description} />
                <InfoRow label="備註" value={workOrder.notes} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceivableQuickView({ rec, onClose }: { rec: Receivable; onClose: () => void }) {
  const unpaid = Number(rec.totalAmount) - Number(rec.receivedAmount);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>應收帳款詳情</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          {rec.workOrderNumber && <InfoRow label="派工單號" value={rec.workOrderNumber} />}
          <InfoRow label="應收金額" value={`NT$${Number(rec.totalAmount).toLocaleString()}`} />
          <InfoRow label="已收金額" value={`NT$${Number(rec.receivedAmount).toLocaleString()}`} />
          <InfoRow label="未收金額" value={`NT$${unpaid.toLocaleString()}`} />
          <InfoRow label="付款狀態" value={rec.paymentStatus} />
          {rec.expectedPaymentDate && <InfoRow label="預計收款日" value={rec.expectedPaymentDate} />}
          {rec.notes && <InfoRow label="備註" value={rec.notes} />}
          <InfoRow label="建立時間" value={new Date(rec.createdAt).toLocaleDateString("zh-TW")} />
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>關閉</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  const { data: receivables } = useListReceivables({ customerId: id });
  const { data: warranties } = useListWarranties({ customerId: id });
  const { data: reminders } = useListMaintenanceReminders({ customerId: id });
  const { data: employees } = useListEmployees({});
  const salesEmployees = employees?.filter(e => e.position === "業務" && e.status !== "離職") ?? [];

  const updateMutation = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(id) });
        setEditing(false);
        toast({ title: "客戶資料已更新" });
      }
    }
  });
  const createAcMutation = useCreateAcUnit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAcUnitsQueryKey(id) });
        setShowAcForm(false);
        toast({ title: "冷氣設備已新增" });
      }
    }
  });
  const deleteAcMutation = useDeleteAcUnit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAcUnitsQueryKey(id) });
        toast({ title: "設備已刪除" });
      }
    }
  });
  const createReminderMutation = useCreateMaintenanceReminder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaintenanceRemindersQueryKey({ customerId: id }) });
        setShowReminderForm(false);
        toast({ title: "保養提醒已新增" });
      }
    }
  });

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", email: "", discountScheme: "", notes: "", primarySalesRepId: 0 });
  const [showAcForm, setShowAcForm] = useState(false);
  const [acForm, setAcForm] = useState({ brand: "", model: "", serialNumber: "", purchaseDate: "", installationDate: "", notes: "" });
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderForm, setReminderForm] = useState({ reminderDate: "", description: "", status: "待處理", notes: "" });

  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
  if (!customer) return <div className="py-12 text-center text-muted-foreground">找不到客戶資料</div>;

  function startEdit() {
    setEditForm({
      name: customer!.name,
      phone: customer!.phone ?? "",
      address: customer!.address ?? "",
      email: customer!.email ?? "",
      discountScheme: customer!.discountScheme ?? "",
      notes: customer!.notes ?? "",
      primarySalesRepId: customer!.primarySalesRepId ?? 0,
    });
    setEditing(true);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{customer.name}</h1>
          <p className="text-xs text-muted-foreground truncate">{customer.phone} · {customer.address}</p>
        </div>
        <Button variant="outline" size="sm" onClick={startEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1" />編輯
        </Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="w-full flex">
          <TabsTrigger value="info" className="flex-1 text-xs">基本資料</TabsTrigger>
          <TabsTrigger value="ac" className="flex-1 text-xs">冷氣設備</TabsTrigger>
          <TabsTrigger value="quotes" className="flex-1 text-xs">
            報價單{quotes && quotes.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({quotes.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="work" className="flex-1 text-xs">
            派工單{workOrders && workOrders.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({workOrders.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 text-xs">
            收款{receivables && receivables.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({receivables.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="warranties" className="flex-1 text-xs">保固</TabsTrigger>
          <TabsTrigger value="reminders" className="flex-1 text-xs">保養提醒</TabsTrigger>
        </TabsList>

        {/* ── 基本資料 ── */}
        <TabsContent value="info">
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div><span className="text-muted-foreground">姓名：</span>{customer.name}</div>
                <div><span className="text-muted-foreground">電話：</span>{customer.phone}</div>
                <div className="col-span-2"><span className="text-muted-foreground">地址：</span>{customer.address}</div>
                {customer.email && <div><span className="text-muted-foreground">Email：</span>{customer.email}</div>}
                {customer.discountScheme && <div><span className="text-muted-foreground">折扣方案：</span>{customer.discountScheme}</div>}
                {customer.primarySalesRepName && <div><span className="text-muted-foreground">主要負責業務：</span>{customer.primarySalesRepName}</div>}
                {customer.notes && <div className="col-span-2"><span className="text-muted-foreground">備註：</span>{customer.notes}</div>}
                <div className="col-span-2 text-xs text-muted-foreground">建立時間：{new Date(customer.createdAt).toLocaleDateString("zh-TW")}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 冷氣設備 ── */}
        <TabsContent value="ac">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowAcForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />新增設備
              </Button>
            </div>
            {acUnits && acUnits.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {acUnits.map(u => (
                      <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{u.brand} {u.model}</p>
                          <p className="text-xs text-muted-foreground">
                            序號：{u.serialNumber ?? "-"} · 購買：{u.purchaseDate ?? "-"} · 安裝：{u.installationDate ?? "-"}
                          </p>
                          {u.notes && <p className="text-xs text-muted-foreground">{u.notes}</p>}
                        </div>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => deleteAcMutation.mutate({ id: u.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">尚無冷氣設備</CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* ── 報價單 ── */}
        <TabsContent value="quotes">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => navigate("/quotes")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />前往報價單管理
              </Button>
            </div>
            {quotes && quotes.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {quotes.map(q => (
                      <div key={q.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{q.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(q.createdAt).toLocaleDateString("zh-TW")}
                              {" · "}NT${Number(q.finalAmount ?? q.amount).toLocaleString()}
                            </p>
                          </div>
                          <StatusBadge status={q.status} />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline" size="sm" className="h-7 text-xs"
                            onClick={() => setSelectedQuote(q)}
                          >
                            <Eye className="h-3 w-3 mr-1" />查看詳情
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                            onClick={() => navigate("/quotes")}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />前往報價單
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">尚無報價單</CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* ── 派工單 ── */}
        <TabsContent value="work">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => navigate("/work-orders")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />前往派工單管理
              </Button>
            </div>
            {workOrders && workOrders.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {workOrders.map(w => (
                      <div key={w.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {w.workOrderNumber ?? `#${w.id}`}
                              </span>
                              {w.projectType && <ProjectTypeBadge type={w.projectType} />}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              預約：{w.scheduledDate ?? "-"}
                              {w.scheduledTime && ` ${w.scheduledTime}`}
                              {w.assignedTo && ` · 負責：${w.assignedTo}`}
                            </p>
                            {w.installAddress && (
                              <p className="text-xs text-muted-foreground truncate max-w-60">{w.installAddress}</p>
                            )}
                          </div>
                          <StatusBadge status={w.status} />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline" size="sm" className="h-7 text-xs"
                            onClick={() => setSelectedWorkOrder(w)}
                          >
                            <Eye className="h-3 w-3 mr-1" />查看詳情
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                            onClick={() => navigate("/work-orders")}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />前往派工單
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">尚無派工單</CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* ── 應收帳款 ── */}
        <TabsContent value="payments">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => navigate(`/receivables?customerId=${id}`)}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />前往應收帳款
              </Button>
            </div>
            {receivables && receivables.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {receivables.map((r: Receivable) => {
                      const unpaid = Number(r.totalAmount) - Number(r.receivedAmount);
                      return (
                        <div key={r.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">
                                應收 NT${Number(r.totalAmount).toLocaleString()}
                                {unpaid > 0 && <span className="text-xs text-amber-600 ml-2">未收 NT${unpaid.toLocaleString()}</span>}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {r.workOrderNumber && `${r.workOrderNumber} · `}
                                {r.expectedPaymentDate && `預計收款 ${r.expectedPaymentDate}`}
                              </p>
                            </div>
                            <StatusBadge status={r.paymentStatus} />
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="outline" size="sm" className="h-7 text-xs"
                              onClick={() => setSelectedReceivable(r)}
                            >
                              <Eye className="h-3 w-3 mr-1" />查看詳情
                            </Button>
                            <Button
                              variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                              onClick={() => navigate(`/receivables?customerId=${id}`)}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />前往應收帳款
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">尚無應收帳款</CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* ── 保固 ── */}
        <TabsContent value="warranties">
          <Card>
            <CardContent className="p-0">
              {warranties && warranties.length > 0 ? (
                <div className="divide-y">
                  {warranties.map(w => {
                    const now = new Date();
                    const end = new Date(w.endDate);
                    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
                    const isExpired = daysLeft < 0;
                    const isExpiring = !isExpired && daysLeft <= 30;
                    return (
                      <div key={w.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{w.description ?? "保固"}</p>
                            <p className="text-xs text-muted-foreground">{w.startDate} 至 {w.endDate}</p>
                            {w.notes && <p className="text-xs text-muted-foreground">{w.notes}</p>}
                          </div>
                          {isExpired ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium whitespace-nowrap">已過期</span>
                          ) : isExpiring ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium whitespace-nowrap">即將到期</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium whitespace-nowrap">保固中</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">尚無保固資料</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 保養提醒 ── */}
        <TabsContent value="reminders">
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowReminderForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />新增提醒
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {reminders && reminders.length > 0 ? (
                  <div className="divide-y">
                    {reminders.map(r => (
                      <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{r.description}</p>
                          <p className="text-xs text-muted-foreground">{r.reminderDate}</p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">尚無保養提醒</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Detail Modals ── */}
      {selectedQuote && <QuoteDetailModal quote={selectedQuote} onClose={() => setSelectedQuote(null)} />}
      {selectedWorkOrder && <WorkOrderDetailModal workOrder={selectedWorkOrder} onClose={() => setSelectedWorkOrder(null)} />}
      {selectedReceivable && <ReceivableQuickView rec={selectedReceivable} onClose={() => setSelectedReceivable(null)} />}

      {/* ── Edit Customer Dialog ── */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>編輯客戶資料</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              updateMutation.mutate({
                id,
                data: {
                  ...editForm,
                  primarySalesRepId: editForm.primarySalesRepId > 0 ? editForm.primarySalesRepId : null,
                } as any,
              });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>姓名</Label>
                <Input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>電話</Label>
                <Input required value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>地址</Label>
              <Input required value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>折扣方案</Label>
                <Input value={editForm.discountScheme} onChange={e => setEditForm(f => ({ ...f, discountScheme: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>主要負責業務</Label>
              <Select value={String(editForm.primarySalesRepId)} onValueChange={v => setEditForm(f => ({ ...f, primarySalesRepId: parseInt(v, 10) }))}>
                <SelectTrigger><SelectValue placeholder="選擇業務（選填）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">（不指定）</SelectItem>
                  {salesEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>取消</Button>
              <Button type="submit" disabled={updateMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add AC Unit Dialog ── */}
      <Dialog open={showAcForm} onOpenChange={setShowAcForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增冷氣設備</DialogTitle></DialogHeader>
          <form
            onSubmit={e => { e.preventDefault(); createAcMutation.mutate({ customerId: id, data: acForm }); }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>品牌 *</Label>
                <Input required value={acForm.brand} onChange={e => setAcForm(f => ({ ...f, brand: e.target.value }))} placeholder="大金、日立..." />
              </div>
              <div className="space-y-1.5">
                <Label>機型 *</Label>
                <Input required value={acForm.model} onChange={e => setAcForm(f => ({ ...f, model: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>序號</Label>
              <Input value={acForm.serialNumber} onChange={e => setAcForm(f => ({ ...f, serialNumber: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>購買日期</Label>
                <Input type="date" value={acForm.purchaseDate} onChange={e => setAcForm(f => ({ ...f, purchaseDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>安裝日期</Label>
                <Input type="date" value={acForm.installationDate} onChange={e => setAcForm(f => ({ ...f, installationDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Input value={acForm.notes} onChange={e => setAcForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAcForm(false)}>取消</Button>
              <Button type="submit" disabled={createAcMutation.isPending}>新增</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Reminder Dialog ── */}
      <Dialog open={showReminderForm} onOpenChange={setShowReminderForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新增保養提醒</DialogTitle></DialogHeader>
          <form
            onSubmit={e => { e.preventDefault(); createReminderMutation.mutate({ data: { ...reminderForm, customerId: id } }); }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>提醒日期 *</Label>
              <Input required type="date" value={reminderForm.reminderDate} onChange={e => setReminderForm(f => ({ ...f, reminderDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>說明 *</Label>
              <Input required value={reminderForm.description} onChange={e => setReminderForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Input value={reminderForm.notes} onChange={e => setReminderForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
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
