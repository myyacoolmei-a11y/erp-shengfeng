import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetCustomer, useUpdateCustomer, getGetCustomerQueryKey,
  useListAcUnits,
  useListQuotes,
  useListWorkOrders,
  useListPayments,
  useListWarranties,
  useListMaintenanceReminders,
} from "@workspace/api-client-react";
import type { Quote, WorkOrder, Payment, Warranty, MaintenanceReminder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Pencil, Printer, ChevronDown, ChevronUp,
  ExternalLink, Eye,
} from "lucide-react";
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
  "待保養": "bg-amber-100 text-amber-700",
  "已逾期": "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground min-w-24 shrink-0">{label}：</span>
      <span>{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-lg px-4 py-3 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionHeader({
  title, count, open, onToggle,
}: { title: string; count?: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 rounded-lg text-sm font-medium transition-colors"
      onClick={onToggle}
    >
      <span>{title}{count !== undefined ? ` (${count})` : ""}</span>
      {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

function QuoteDetailModal({ quote, onClose, onGoTo }: { quote: Quote; onClose: () => void; onGoTo: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>報價單詳情</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <InfoRow label="報價單名稱" value={quote.title} />
          <InfoRow label="建立日期" value={new Date(quote.createdAt).toLocaleDateString("zh-TW")} />
          <InfoRow label="報價金額" value={`NT$${Number(quote.amount).toLocaleString()}`} />
          {quote.discountAmount ? <InfoRow label="折扣金額" value={`NT$${Number(quote.discountAmount).toLocaleString()}`} /> : null}
          <InfoRow label="最終金額" value={`NT$${Number(quote.finalAmount ?? quote.amount).toLocaleString()}`} />
          <div className="flex gap-2 items-center text-sm">
            <span className="text-muted-foreground min-w-24 shrink-0">狀態：</span>
            <StatusBadge status={quote.status} />
          </div>
          {quote.description && <InfoRow label="說明" value={quote.description} />}
          {quote.notes && <InfoRow label="備註" value={quote.notes} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>關閉</Button>
          <Button size="sm" onClick={onGoTo}><ExternalLink className="h-3.5 w-3.5 mr-1" />前往報價單管理</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkOrderDetailModal({ workOrder, onClose, onGoTo }: { workOrder: WorkOrder; onClose: () => void; onGoTo: () => void }) {
  const mapsUrl = workOrder.installAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(workOrder.installAddress)}`
    : null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>派工單詳情</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">基本資訊</p>
            <div className="space-y-1.5">
              <InfoRow label="工程編號" value={workOrder.workOrderNumber ?? `#${workOrder.id}`} />
              <InfoRow label="工程名稱" value={workOrder.title} />
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground min-w-24 shrink-0">狀態：</span>
                <StatusBadge status={workOrder.status} />
              </div>
              <InfoRow label="工程類型" value={workOrder.projectType} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">客戶資訊</p>
            <div className="space-y-1.5">
              <InfoRow label="聯絡人" value={workOrder.contactPerson} />
              <InfoRow label="手機" value={workOrder.mobilePhone} />
              <InfoRow label="電話" value={workOrder.telephone} />
              {workOrder.installAddress && (
                <div className="flex gap-2 items-start">
                  <span className="text-muted-foreground min-w-24 shrink-0">施工地址：</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{workOrder.installAddress}</span>
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-xs flex items-center gap-0.5">
                        <ExternalLink className="h-3 w-3" />地圖
                      </a>
                    )}
                  </div>
                </div>
              )}
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
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>關閉</Button>
          <Button size="sm" onClick={onGoTo}><ExternalLink className="h-3.5 w-3.5 mr-1" />前往派工單管理</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDetailModal({ payment, onClose, onGoTo }: { payment: Payment; onClose: () => void; onGoTo: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>收款詳情</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <InfoRow label="收款日期" value={payment.paymentDate} />
          <InfoRow label="金額" value={`NT$${Number(payment.amount).toLocaleString()}`} />
          <InfoRow label="收款方式" value={payment.paymentMethod} />
          {payment.quoteId && <InfoRow label="關聯報價單" value={`#${payment.quoteId}`} />}
          {payment.workOrderId && <InfoRow label="關聯派工單" value={`#${payment.workOrderId}`} />}
          {payment.notes && <InfoRow label="備註" value={payment.notes} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>關閉</Button>
          <Button size="sm" onClick={onGoTo}><ExternalLink className="h-3.5 w-3.5 mr-1" />前往收款管理</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WarrantyDetailModal({ warranty, onClose, onGoTo }: { warranty: Warranty; onClose: () => void; onGoTo: () => void }) {
  const now = new Date();
  const end = new Date(warranty.endDate);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>保固詳情</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <InfoRow label="保固項目" value={warranty.description} />
          <InfoRow label="開始日期" value={warranty.startDate} />
          <InfoRow label="結束日期" value={warranty.endDate} />
          <div className="flex gap-2 items-center text-sm">
            <span className="text-muted-foreground min-w-24 shrink-0">狀態：</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${daysLeft < 0 ? "bg-red-100 text-red-700" : daysLeft <= 30 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
              {daysLeft < 0 ? "已過期" : daysLeft <= 30 ? `即將到期 (${daysLeft}天)` : `有效 (${daysLeft}天)`}
            </span>
          </div>
          {warranty.notes && <InfoRow label="備註" value={warranty.notes} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>關閉</Button>
          <Button size="sm" onClick={onGoTo}><ExternalLink className="h-3.5 w-3.5 mr-1" />前往保固管理</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderDetailModal({ reminder, onClose, onGoTo }: { reminder: MaintenanceReminder; onClose: () => void; onGoTo: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>保養提醒詳情</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <InfoRow label="提醒日期" value={reminder.reminderDate} />
          <InfoRow label="保養說明" value={reminder.description} />
          <div className="flex gap-2 items-center text-sm">
            <span className="text-muted-foreground min-w-24 shrink-0">狀態：</span>
            <StatusBadge status={reminder.status} />
          </div>
          {reminder.notes && <InfoRow label="備註" value={reminder.notes} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>關閉</Button>
          <Button size="sm" onClick={onGoTo}><ExternalLink className="h-3.5 w-3.5 mr-1" />前往保養管理</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomerHistory() {
  const [, params] = useRoute("/customers/:id/history");
  const [, navigate] = useLocation();
  const id = parseInt(params?.id ?? "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customer, isLoading: loadingCustomer } = useGetCustomer(id);
  const { data: acUnits } = useListAcUnits(id);
  const { data: quotes } = useListQuotes({ customerId: id });
  const { data: workOrders } = useListWorkOrders({ customerId: id });
  const { data: payments } = useListPayments({ customerId: id });
  const { data: warranties } = useListWarranties({ customerId: id });
  const { data: reminders } = useListMaintenanceReminders({ customerId: id });

  const updateMutation = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(id) });
        setEditOpen(false);
        toast({ title: "客戶資料已更新" });
      },
    },
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", email: "", discountScheme: "", notes: "" });

  const [open, setOpen] = useState({
    equipment: true, quotes: true, workOrders: true,
    payments: true, warranties: true, reminders: true,
  });

  const [detailQuote, setDetailQuote] = useState<Quote | null>(null);
  const [detailWorkOrder, setDetailWorkOrder] = useState<WorkOrder | null>(null);
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [detailWarranty, setDetailWarranty] = useState<Warranty | null>(null);
  const [detailReminder, setDetailReminder] = useState<MaintenanceReminder | null>(null);

  function openEdit() {
    if (!customer) return;
    setEditForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      email: customer.email ?? "",
      discountScheme: customer.discountScheme ?? "",
      notes: customer.notes ?? "",
    });
    setEditOpen(true);
  }

  function handlePrint() {
    setOpen({ equipment: true, quotes: true, workOrders: true, payments: true, warranties: true, reminders: true });
    setTimeout(() => window.print(), 200);
  }

  const totalQuoteAmount = quotes ? quotes.reduce((s, q) => s + Number(q.amount), 0) : 0;
  const totalPaid = payments ? payments.reduce((s, p) => s + Number(p.amount), 0) : 0;
  const outstanding = totalQuoteAmount - totalPaid;
  const completedOrders = workOrders?.filter(w => w.status === "已完成") ?? [];
  const lastServiceDate = completedOrders.length > 0
    ? completedOrders
        .map(w => w.completedDate ?? "")
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null
    : null;
  const pendingReminders = reminders?.filter(r => r.status !== "已完成") ?? [];
  const nextMaintenance = pendingReminders.length > 0
    ? [...pendingReminders].sort((a, b) => a.reminderDate.localeCompare(b.reminderDate))[0]?.reminderDate ?? null
    : null;
  const now = new Date();
  const expiredWarranties = warranties?.filter(w => new Date(w.endDate) < now) ?? [];
  const activeWarranties = warranties ? warranties.length - expiredWarranties.length : 0;

  if (loadingCustomer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">找不到此客戶資料</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/customers")}>返回客戶列表</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Print styles injected inline */}
      <style>{`
        @media print {
          aside, header, nav[role="navigation"], .no-print { display: none !important; }
          body { font-size: 11pt; }
          .print-page-title { display: block !important; }
        }
        .print-page-title { display: none; }
      `}</style>

      {/* Print-only title */}
      <div className="print-page-title mb-4">
        <h1 style={{ fontSize: "18pt", fontWeight: "bold", marginBottom: "4px" }}>晟風工程 客戶完整履歷</h1>
        <p style={{ fontSize: "10pt", color: "#666" }}>產生日期：{new Date().toLocaleDateString("zh-TW")}</p>
        <hr style={{ marginTop: "8px" }} />
      </div>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3 no-print">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => navigate("/customers")}>
              <ArrowLeft className="h-4 w-4 mr-1" />返回客戶列表
            </Button>
          </div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">客戶完整履歷</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" />編輯客戶
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1" />列印 / 匯出 PDF
          </Button>
        </div>
      </div>

      {/* 1. Customer Summary */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">客戶資料</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
            <InfoRow label="姓名" value={customer.name} />
            <InfoRow label="電話" value={customer.phone} />
            <InfoRow label="Email" value={customer.email} />
            <InfoRow label="折扣方案" value={customer.discountScheme} />
            <div className="sm:col-span-2"><InfoRow label="地址" value={customer.address} /></div>
            {customer.notes && <div className="sm:col-span-2"><InfoRow label="備註" value={customer.notes} /></div>}
            <InfoRow label="建立日期" value={new Date(customer.createdAt).toLocaleDateString("zh-TW")} />
            <InfoRow label="最後更新" value={new Date(customer.updatedAt).toLocaleDateString("zh-TW")} />
          </div>
        </CardContent>
      </Card>

      {/* 2. Statistics */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">統計摘要</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <StatCard label="報價單總額" value={`NT$${totalQuoteAmount.toLocaleString("zh-TW")}`} sub={`共 ${quotes?.length ?? 0} 筆`} />
          <StatCard label="已收款總額" value={`NT$${totalPaid.toLocaleString("zh-TW")}`} sub={`共 ${payments?.length ?? 0} 筆`} />
          <StatCard label="未收餘額" value={`NT$${outstanding.toLocaleString("zh-TW")}`} />
          <StatCard label="派工單" value={`${workOrders?.length ?? 0} 筆`} sub={`已完成 ${completedOrders.length} 筆`} />
          <StatCard label="有效保固" value={`${activeWarranties} 筆`} sub={`共 ${warranties?.length ?? 0} 筆`} />
          {lastServiceDate && <StatCard label="最後服務日期" value={lastServiceDate} />}
          {nextMaintenance && <StatCard label="下次保養日期" value={nextMaintenance} />}
          <StatCard label="保養提醒" value={`${reminders?.length ?? 0} 筆`} sub={`待處理 ${pendingReminders.length} 筆`} />
        </div>
      </div>

      {/* 3. Equipment */}
      <div>
        <SectionHeader
          title="冷氣設備"
          count={acUnits?.length}
          open={open.equipment}
          onToggle={() => setOpen(o => ({ ...o, equipment: !o.equipment }))}
        />
        {open.equipment && (
          <div className="mt-1">
            {!acUnits || acUnits.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3">尚無設備記錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left px-3 py-2 font-medium">品牌</th>
                      <th className="text-left px-3 py-2 font-medium">型號</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">序號</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">安裝日期</th>
                      <th className="text-left px-3 py-2 font-medium hidden md:table-cell">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {acUnits.map(u => (
                      <tr key={u.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{u.brand}</td>
                        <td className="px-3 py-2">{u.model}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{u.serialNumber ?? "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{u.installationDate ?? "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{u.notes ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Quotes */}
      <div>
        <SectionHeader
          title="報價單紀錄"
          count={quotes?.length}
          open={open.quotes}
          onToggle={() => setOpen(o => ({ ...o, quotes: !o.quotes }))}
        />
        {open.quotes && (
          <div className="mt-1">
            {!quotes || quotes.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3">尚無報價單</p>
            ) : (
              <div className="divide-y border rounded-lg mt-1">
                {quotes.map(q => (
                  <div key={q.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{q.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(q.createdAt).toLocaleDateString("zh-TW")} ·
                        NT${Number(q.finalAmount ?? q.amount).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={q.status} />
                    <div className="flex gap-1 shrink-0 no-print">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="查看詳情" onClick={() => setDetailQuote(q)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="前往報價單管理"
                        onClick={() => navigate(`/quotes?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Work Orders */}
      <div>
        <SectionHeader
          title="派工單紀錄"
          count={workOrders?.length}
          open={open.workOrders}
          onToggle={() => setOpen(o => ({ ...o, workOrders: !o.workOrders }))}
        />
        {open.workOrders && (
          <div className="mt-1">
            {!workOrders || workOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3">尚無派工單</p>
            ) : (
              <div className="divide-y border rounded-lg mt-1">
                {workOrders.map(w => (
                  <div key={w.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{w.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {w.scheduledDate ?? "-"}{w.projectType ? ` · ${w.projectType}` : ""}
                        {w.assignedTo ? ` · ${w.assignedTo}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={w.status} />
                    <div className="flex gap-1 shrink-0 no-print">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="查看詳情" onClick={() => setDetailWorkOrder(w)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="前往派工單管理"
                        onClick={() => navigate(`/work-orders?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Payments */}
      <div>
        <SectionHeader
          title="收款紀錄"
          count={payments?.length}
          open={open.payments}
          onToggle={() => setOpen(o => ({ ...o, payments: !o.payments }))}
        />
        {open.payments && (
          <div className="mt-1">
            {!payments || payments.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3">尚無收款紀錄</p>
            ) : (
              <div className="divide-y border rounded-lg mt-1">
                {payments.map(p => (
                  <div key={p.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">NT${Number(p.amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.paymentDate}{p.paymentMethod ? ` · ${p.paymentMethod}` : ""}
                        {p.workOrderId ? ` · 派工單 #${p.workOrderId}` : ""}
                        {p.quoteId ? ` · 報價單 #${p.quoteId}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0 no-print">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="查看詳情" onClick={() => setDetailPayment(p)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="前往收款管理"
                        onClick={() => navigate(`/payments?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. Warranties */}
      <div>
        <SectionHeader
          title="保固紀錄"
          count={warranties?.length}
          open={open.warranties}
          onToggle={() => setOpen(o => ({ ...o, warranties: !o.warranties }))}
        />
        {open.warranties && (
          <div className="mt-1">
            {!warranties || warranties.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3">尚無保固紀錄</p>
            ) : (
              <div className="divide-y border rounded-lg mt-1">
                {warranties.map(w => {
                  const daysLeft = Math.ceil((new Date(w.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={w.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{w.description ?? "保固項目"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{w.startDate} ~ {w.endDate}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${daysLeft < 0 ? "bg-red-100 text-red-700" : daysLeft <= 30 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                        {daysLeft < 0 ? "已過期" : daysLeft <= 30 ? `即將到期` : "有效"}
                      </span>
                      <div className="flex gap-1 shrink-0 no-print">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="查看詳情" onClick={() => setDetailWarranty(w)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="前往保固管理"
                          onClick={() => navigate(`/warranties?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 8. Maintenance Reminders */}
      <div>
        <SectionHeader
          title="保養提醒紀錄"
          count={reminders?.length}
          open={open.reminders}
          onToggle={() => setOpen(o => ({ ...o, reminders: !o.reminders }))}
        />
        {open.reminders && (
          <div className="mt-1">
            {!reminders || reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3">尚無保養提醒</p>
            ) : (
              <div className="divide-y border rounded-lg mt-1">
                {reminders.map(r => (
                  <div key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.reminderDate}</p>
                    </div>
                    <StatusBadge status={r.status} />
                    <div className="flex gap-1 shrink-0 no-print">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="查看詳情" onClick={() => setDetailReminder(r)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="前往保養管理"
                        onClick={() => navigate(`/maintenance?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail modals */}
      {detailQuote && (
        <QuoteDetailModal
          quote={detailQuote}
          onClose={() => setDetailQuote(null)}
          onGoTo={() => { setDetailQuote(null); navigate(`/quotes?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`); }}
        />
      )}
      {detailWorkOrder && (
        <WorkOrderDetailModal
          workOrder={detailWorkOrder}
          onClose={() => setDetailWorkOrder(null)}
          onGoTo={() => { setDetailWorkOrder(null); navigate(`/work-orders?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`); }}
        />
      )}
      {detailPayment && (
        <PaymentDetailModal
          payment={detailPayment}
          onClose={() => setDetailPayment(null)}
          onGoTo={() => { setDetailPayment(null); navigate(`/payments?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`); }}
        />
      )}
      {detailWarranty && (
        <WarrantyDetailModal
          warranty={detailWarranty}
          onClose={() => setDetailWarranty(null)}
          onGoTo={() => { setDetailWarranty(null); navigate(`/warranties?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`); }}
        />
      )}
      {detailReminder && (
        <ReminderDetailModal
          reminder={detailReminder}
          onClose={() => setDetailReminder(null)}
          onGoTo={() => { setDetailReminder(null); navigate(`/maintenance?customerId=${id}&customerName=${encodeURIComponent(customer.name)}`); }}
        />
      )}

      {/* Edit Customer Modal */}
      <Dialog open={editOpen} onOpenChange={open => !open && setEditOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>編輯客戶資料</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              updateMutation.mutate({ id, data: editForm });
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
              <Label>備註</Label>
              <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
              <Button type="submit" disabled={updateMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
