import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListReceivables, useCreateReceivable, useUpdateReceivable, useDeleteReceivable,
  useRecordReceivablePayment, useListCustomers,
} from "@workspace/api-client-react";
import type { Receivable } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateStatistics } from "@/lib/invalidateStatistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, CreditCard, FileText, Bell, CheckCircle, Copy, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const PAYMENT_STATUSES = ["未收款", "部分收款", "已收款"];
const PAYMENT_METHODS = ["現金", "銀行轉帳", "支票", "信用卡", "LINE Pay", "其他"];
const INVOICE_STATUSES = ["未開立", "已開立", "免開立", "待確認"];
const INVOICE_TYPES = ["二聯式發票", "三聯式發票", "電子發票", "免發票"];
const FILTER_TABS = ["全部", "未收款", "部分收款", "已收款", "逾期", "發票未開立"];

const STATUS_COLORS: Record<string, string> = {
  "未收款": "bg-red-100 text-red-700",
  "部分收款": "bg-amber-100 text-amber-700",
  "已收款": "bg-green-100 text-green-700",
};
const INVOICE_COLORS: Record<string, string> = {
  "未開立": "bg-orange-100 text-orange-700",
  "已開立": "bg-green-100 text-green-700",
  "免開立": "bg-gray-100 text-gray-600",
  "待確認": "bg-blue-100 text-blue-700",
};

function fmtAmt(n: number) {
  return "NT$" + n.toLocaleString("zh-TW", { minimumFractionDigits: 0 });
}

function overdueDays(expectedDate: string | null | undefined): number {
  if (!expectedDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expectedDate);
  exp.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - exp.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

type TabFilter = typeof FILTER_TABS[number];

export default function Receivables() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === "owner" || user?.role === "admin" || user?.role === "accountant";
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const queryClient = useQueryClient();

  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";
  const focusReceivableId = parseInt(urlParams.get("receivableId") ?? "0", 10) || null;

  const [tabFilter, setTabFilter] = useState<TabFilter>("全部");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewItem, setViewItem] = useState<Receivable | null>(null);
  const [paymentModal, setPaymentModal] = useState<Receivable | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<Receivable | null>(null);
  const [lineModal, setLineModal] = useState<Receivable | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Receivable | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState(makeEmptyForm());
  const [payForm, setPayForm] = useState({ amount: "", paymentDate: new Date().toISOString().split("T")[0], paymentMethod: "", notes: "" });
  const [invForm, setInvForm] = useState(makeInvForm());

  const apiFilter: Record<string, string | number | undefined> = {};
  if (filterCustomerId) apiFilter.customerId = filterCustomerId;
  if (tabFilter === "逾期") apiFilter.status = "逾期";
  else if (tabFilter === "發票未開立") apiFilter.status = "發票未開立";
  else if (tabFilter !== "全部") apiFilter.status = tabFilter;

  const { data: items = [], isLoading } = useListReceivables(apiFilter as any);
  const { data: customers = [] } = useListCustomers({ includeOld: "true" });

  useEffect(() => {
    if (!focusReceivableId || !items.length || viewItem) return;
    const target = items.find(i => i.id === focusReceivableId);
    if (target) setViewItem(target);
  }, [focusReceivableId, items, viewItem]);

  const invalidate = () => invalidateStatistics(queryClient);

  const createMutation = useCreateReceivable({ mutation: { onSuccess: () => { invalidate(); setShowCreate(false); toast({ title: "應收帳款已建立" }); } } });
  const updateMutation = useUpdateReceivable({ mutation: { onSuccess: () => { invalidate(); setEditItem(null); toast({ title: "已更新" }); } } });
  const deleteMutation = useDeleteReceivable({ mutation: { onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "已刪除" }); } } });
  const paymentMutation = useRecordReceivablePayment({ mutation: { onSuccess: () => { invalidate(); setPaymentModal(null); toast({ title: "收款記錄已更新" }); } } });

  function openCreate() { setForm(makeEmptyForm()); setShowCreate(true); }
  function openEdit(item: Receivable) {
    setForm({
      customerId: item.customerId,
      projectName: item.projectName ?? "",
      projectType: item.projectType ?? "",
      completionDate: item.completionDate ?? "",
      totalAmount: String(item.totalAmount ?? ""),
      expectedPaymentDate: item.expectedPaymentDate ?? "",
      paymentMethod: item.paymentMethod ?? "",
      notes: item.notes ?? "",
    });
    setEditItem(item);
  }

  function openInvoice(item: Receivable) {
    setInvForm({
      invoiceStatus: item.invoiceStatus ?? "未開立",
      invoiceType: item.invoiceType ?? "",
      taxId: item.taxId ?? "",
      invoiceTitle: item.invoiceTitle ?? "",
      invoiceNumber: item.invoiceNumber ?? "",
      invoiceDate: item.invoiceDate ?? "",
      invoiceNotes: item.invoiceNotes ?? "",
    });
    setInvoiceModal(item);
  }

  function openPayment(item: Receivable) {
    setPayForm({ amount: "", paymentDate: new Date().toISOString().split("T")[0], paymentMethod: item.paymentMethod ?? "", notes: "" });
    setPaymentModal(item);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerId) { toast({ title: "請選擇客戶", variant: "destructive" }); return; }
    createMutation.mutate({ data: {
      customerId: form.customerId,
      projectName: form.projectName || undefined,
      projectType: form.projectType || undefined,
      completionDate: form.completionDate || undefined,
      totalAmount: parseFloat(form.totalAmount) || 0,
      expectedPaymentDate: form.expectedPaymentDate || undefined,
      paymentMethod: form.paymentMethod || undefined,
      notes: form.notes || undefined,
    }});
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    updateMutation.mutate({ id: editItem.id, data: {
      totalAmount: parseFloat(form.totalAmount) || undefined,
      expectedPaymentDate: form.expectedPaymentDate || undefined,
      paymentMethod: form.paymentMethod || undefined,
      notes: form.notes || undefined,
    }});
  }

  function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentModal) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { toast({ title: "請輸入有效金額", variant: "destructive" }); return; }
    paymentMutation.mutate({ id: paymentModal.id, data: {
      amount,
      paymentDate: payForm.paymentDate,
      paymentMethod: payForm.paymentMethod || undefined,
      notes: payForm.notes || undefined,
    }});
  }

  function handleInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceModal) return;
    updateMutation.mutate({ id: invoiceModal.id, data: {
      invoiceStatus: invForm.invoiceStatus,
      invoiceType: invForm.invoiceType || undefined,
      taxId: invForm.taxId || undefined,
      invoiceTitle: invForm.invoiceTitle || undefined,
      invoiceNumber: invForm.invoiceNumber || undefined,
      invoiceDate: invForm.invoiceDate || undefined,
      invoiceNotes: invForm.invoiceNotes || undefined,
    } as any }, { onSuccess: () => { invalidate(); setInvoiceModal(null); toast({ title: "發票資料已更新" }); } });
  }

  function handleMarkPaid(item: Receivable) {
    const remaining = item.totalAmount - item.receivedAmount;
    if (remaining <= 0) { toast({ title: "此筆已全額收款" }); return; }
    paymentMutation.mutate({ id: item.id, data: {
      amount: remaining,
      paymentDate: new Date().toISOString().split("T")[0],
    }});
  }

  function buildLineMessage(item: Receivable): string {
    const today = new Date().toISOString().split("T")[0];
    const od = overdueDays(item.expectedPaymentDate);
    const remaining = item.totalAmount - item.receivedAmount;
    return `【晟風工程收款提醒】
客戶：${item.customerName ?? "—"}
派工單號：${item.workOrderNumber ?? "—"}
工程名稱：${item.projectName ?? "—"}
完工日期：${item.completionDate ?? "—"}
應收金額：${fmtAmt(item.totalAmount)}
已收金額：${fmtAmt(item.receivedAmount)}
未收金額：${fmtAmt(remaining)}
預計收款日：${item.expectedPaymentDate ?? "—"}
逾期天數：${od > 0 ? `${od} 天` : "未逾期"}
發票狀態：${item.invoiceStatus ?? "—"}
備註：${item.notes ?? "—"}`;
  }

  function copyLine(item: Receivable) {
    navigator.clipboard.writeText(buildLineMessage(item)).then(() => {
      setCopied(true);
      toast({ title: "訊息已複製" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareToLine(item: Receivable) {
    const msg = encodeURIComponent(buildLineMessage(item));
    window.open(`https://line.me/R/share?text=${msg}`, "_blank");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">應收帳款</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">收款追蹤與發票管理</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />新增帳款
          </Button>
        )}
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/receivables")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_TABS.map(t => (
          <button key={t} onClick={() => setTabFilter(t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${tabFilter === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map(item => {
            const remaining = item.totalAmount - item.receivedAmount;
            const od = overdueDays(item.expectedPaymentDate);
            const isOverdue = od > 0 && item.paymentStatus !== "已收款";
            return (
              <Card key={item.id} className={isOverdue ? "border-red-200" : ""}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-semibold text-sm truncate">{item.customerName ?? "—"}</span>
                        {item.workOrderNumber && <span className="text-xs text-muted-foreground">#{item.workOrderNumber}</span>}
                        <Badge className={`text-xs px-1.5 py-0 ${STATUS_COLORS[item.paymentStatus] ?? "bg-gray-100 text-gray-700"}`}>
                          {item.paymentStatus}
                        </Badge>
                        <Badge className={`text-xs px-1.5 py-0 ${INVOICE_COLORS[item.invoiceStatus] ?? "bg-gray-100 text-gray-600"}`}>
                          發票：{item.invoiceStatus}
                        </Badge>
                      </div>
                      {item.projectName && <p className="text-xs text-muted-foreground mb-1">{item.projectName}{item.projectType ? ` · ${item.projectType}` : ""}</p>}
                      <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-xs mt-1">
                        <div><span className="text-muted-foreground">應收：</span><span className="font-medium">{fmtAmt(item.totalAmount)}</span></div>
                        <div><span className="text-muted-foreground">已收：</span><span className="font-medium text-green-700">{fmtAmt(item.receivedAmount)}</span></div>
                        <div><span className="text-muted-foreground">未收：</span><span className={`font-medium ${remaining > 0 ? "text-red-600" : "text-gray-500"}`}>{fmtAmt(remaining)}</span></div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mt-1 text-muted-foreground">
                        {item.expectedPaymentDate && <span>預計收款：{item.expectedPaymentDate}</span>}
                        {isOverdue && <span className="text-red-600 font-medium">逾期 {od} 天</span>}
                        {item.invoiceNumber && <span>發票號：{item.invoiceNumber}</span>}
                      </div>
                    </div>
                  </div>
                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t">
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setViewItem(item)}>
                      詳情
                    </Button>
                    {canWrite && item.paymentStatus !== "已收款" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-green-700 border-green-300 hover:bg-green-50" onClick={() => openPayment(item)}>
                        <CreditCard className="h-3 w-3 mr-1" />記錄收款
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-blue-700 border-blue-300 hover:bg-blue-50" onClick={() => openInvoice(item)}>
                        <FileText className="h-3 w-3 mr-1" />發票
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={() => setLineModal(item)}>
                      <Bell className="h-3 w-3 mr-1" />LINE 提醒
                    </Button>
                    {canWrite && item.paymentStatus !== "已收款" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-gray-600" onClick={() => handleMarkPaid(item)}>
                        <CheckCircle className="h-3 w-3 mr-1" />標記已付清
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => openEdit(item)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {tabFilter === "全部" ? "尚無應收帳款紀錄" : `無「${tabFilter}」帳款`}
        </CardContent></Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate || !!editItem} onOpenChange={open => { if (!open) { setShowCreate(false); setEditItem(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "編輯應收帳款" : "新增應收帳款"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editItem ? handleEdit : handleCreate} className="space-y-3 mt-1">
            {!editItem && (
              <div className="space-y-1">
                <Label>客戶 *</Label>
                <Select value={String(form.customerId || "")} onValueChange={v => setForm(f => ({ ...f, customerId: parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="選擇客戶" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>工程名稱</Label>
              <Input value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} placeholder="例：新裝冷氣工程" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>工程類別</Label>
                <Input value={form.projectType} onChange={e => setForm(f => ({ ...f, projectType: e.target.value }))} placeholder="例：新裝" />
              </div>
              <div className="space-y-1">
                <Label>完工日期</Label>
                <Input type="date" value={form.completionDate} onChange={e => setForm(f => ({ ...f, completionDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>應收金額 *</Label>
                <Input type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} placeholder="0" required />
              </div>
              <div className="space-y-1">
                <Label>預計收款日</Label>
                <Input type="date" value={form.expectedPaymentDate} onChange={e => setForm(f => ({ ...f, expectedPaymentDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowCreate(false); setEditItem(null); }}>取消</Button>
              <Button type="submit">{editItem ? "儲存" : "新增"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={!!paymentModal} onOpenChange={open => { if (!open) setPaymentModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>記錄收款</DialogTitle>
          </DialogHeader>
          {paymentModal && (
            <div className="text-xs text-muted-foreground mb-2">
              <span>{paymentModal.customerName}</span>
              {paymentModal.projectName && <span> · {paymentModal.projectName}</span>}
              <div className="mt-1">未收金額：<strong className="text-red-600">{fmtAmt(paymentModal.totalAmount - paymentModal.receivedAmount)}</strong></div>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-3">
            <div className="space-y-1">
              <Label>收款金額 *</Label>
              <Input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" required />
            </div>
            <div className="space-y-1">
              <Label>收款日期 *</Label>
              <Input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <Label>付款方式</Label>
              <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue placeholder="選擇方式" /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentModal(null)}>取消</Button>
              <Button type="submit">確認收款</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={!!invoiceModal} onOpenChange={open => { if (!open) setInvoiceModal(null); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>發票資料</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvoice} className="space-y-3 mt-1">
            <div className="space-y-1">
              <Label>發票狀態</Label>
              <Select value={invForm.invoiceStatus} onValueChange={v => setInvForm(f => ({ ...f, invoiceStatus: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INVOICE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>發票類型</Label>
              <Select value={invForm.invoiceType} onValueChange={v => setInvForm(f => ({ ...f, invoiceType: v }))}>
                <SelectTrigger><SelectValue placeholder="選擇類型" /></SelectTrigger>
                <SelectContent>{INVOICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>統一編號</Label>
                <Input value={invForm.taxId} onChange={e => setInvForm(f => ({ ...f, taxId: e.target.value }))} placeholder="買方統編" />
              </div>
              <div className="space-y-1">
                <Label>發票抬頭</Label>
                <Input value={invForm.invoiceTitle} onChange={e => setInvForm(f => ({ ...f, invoiceTitle: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>發票號碼</Label>
                <Input value={invForm.invoiceNumber} onChange={e => setInvForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="AB-12345678" />
              </div>
              <div className="space-y-1">
                <Label>開立日期</Label>
                <Input type="date" value={invForm.invoiceDate} onChange={e => setInvForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>發票備註</Label>
              <Textarea value={invForm.invoiceNotes} onChange={e => setInvForm(f => ({ ...f, invoiceNotes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInvoiceModal(null)}>取消</Button>
              <Button type="submit">儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* LINE Reminder Dialog */}
      <Dialog open={!!lineModal} onOpenChange={open => { if (!open) { setLineModal(null); setCopied(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-emerald-600" />LINE 收款提醒</DialogTitle>
          </DialogHeader>
          {lineModal && (
            <div className="space-y-3">
              <pre className="text-xs bg-muted rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-sans">
                {buildLineMessage(lineModal)}
              </pre>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => copyLine(lineModal)}>
                  <Copy className="h-4 w-4 mr-1.5" />{copied ? "已複製！" : "複製訊息"}
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => shareToLine(lineModal)}>
                  分享至 LINE
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!viewItem} onOpenChange={open => { if (!open) setViewItem(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>應收帳款詳情</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <DetailRow label="客戶" value={viewItem.customerName ?? "—"} />
                <DetailRow label="派工單號" value={viewItem.workOrderNumber ?? "—"} />
                <DetailRow label="工程名稱" value={viewItem.projectName ?? "—"} />
                <DetailRow label="工程類別" value={viewItem.projectType ?? "—"} />
                <DetailRow label="完工日期" value={viewItem.completionDate ?? "—"} />
                <DetailRow label="預計收款" value={viewItem.expectedPaymentDate ?? "—"} />
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-2">
                <AmtCard label="應收" amount={viewItem.totalAmount} color="text-foreground" />
                <AmtCard label="已收" amount={viewItem.receivedAmount} color="text-green-700" />
                <AmtCard label="未收" amount={viewItem.totalAmount - viewItem.receivedAmount} color="text-red-600" />
              </div>
              <div className="flex gap-2">
                <Badge className={STATUS_COLORS[viewItem.paymentStatus] ?? "bg-gray-100"}>{viewItem.paymentStatus}</Badge>
                {viewItem.paymentMethod && <Badge variant="outline">{viewItem.paymentMethod}</Badge>}
                {viewItem.actualPaymentDate && <span className="text-xs text-muted-foreground self-center">完款：{viewItem.actualPaymentDate}</span>}
              </div>
              {overdueDays(viewItem.expectedPaymentDate) > 0 && viewItem.paymentStatus !== "已收款" && (
                <div className="text-xs text-red-600 font-medium">⚠ 已逾期 {overdueDays(viewItem.expectedPaymentDate)} 天</div>
              )}
              {viewItem.notes && <div className="text-xs text-muted-foreground bg-muted rounded p-2">{viewItem.notes}</div>}
              <Separator />
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <DetailRow label="發票狀態" value={viewItem.invoiceStatus} />
                <DetailRow label="發票類型" value={viewItem.invoiceType ?? "—"} />
                <DetailRow label="統一編號" value={viewItem.taxId ?? "—"} />
                <DetailRow label="發票抬頭" value={viewItem.invoiceTitle ?? "—"} />
                <DetailRow label="發票號碼" value={viewItem.invoiceNumber ?? "—"} />
                <DetailRow label="開立日期" value={viewItem.invoiceDate ?? "—"} />
              </div>
              {viewItem.invoiceNotes && <div className="text-xs text-muted-foreground bg-muted rounded p-2">{viewItem.invoiceNotes}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除？</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原，應收帳款紀錄將永久刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}

function AmtCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{"NT$" + amount.toLocaleString("zh-TW")}</p>
    </div>
  );
}

function makeEmptyForm() {
  return {
    customerId: 0,
    projectName: "",
    projectType: "",
    completionDate: "",
    totalAmount: "",
    expectedPaymentDate: "",
    paymentMethod: "",
    notes: "",
  };
}

function makeInvForm() {
  return {
    invoiceStatus: "未開立",
    invoiceType: "",
    taxId: "",
    invoiceTitle: "",
    invoiceNumber: "",
    invoiceDate: "",
    invoiceNotes: "",
  };
}
