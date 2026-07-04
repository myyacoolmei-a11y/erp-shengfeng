import { useState, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useDeleteWorkOrder,
  useListCustomers, useListProgress, useCreateProgress,
  useCreatePayment, useCreateReceivable,
  useListEmployees, useListQuotes,
  getListWorkOrdersQueryKey, getListProgressQueryKey, getListPaymentsQueryKey, getListReceivablesQueryKey,
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
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard, Printer, Share2, MapPin, X, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { WO_STATUSES, makeEmpty, type WOForm, buildPayload, WorkOrderFormFields } from "@/components/work-order-form";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { handlePdfAction, isMobileDevice, openPrintWindow } from "@/components/pdf/pdf-service";
import { buildWorkOrderHtml } from "@/components/pdf/templates/WorkOrderTemplate";

const STATUSES = WO_STATUSES;

const STATUS_COLORS: Record<string, string> = {
  "待施工": "bg-amber-100 text-amber-700",
  "已完成": "bg-green-100 text-green-700",
  // backward compat for old statuses
  "待處理": "bg-amber-100 text-amber-700",
  "進行中": "bg-blue-100 text-blue-700",
  "已取消": "bg-gray-100 text-gray-700",
};

const PT_COLORS: Record<string, string> = {
  "新裝": "bg-purple-100 text-purple-700",
  "維修": "bg-red-100 text-red-700",
  "保養": "bg-teal-100 text-teal-700",
  "遷機": "bg-orange-100 text-orange-700",
  "清洗": "bg-sky-100 text-sky-700",
  "保固服務": "bg-green-100 text-green-700",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"); }
function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(data)}`;
}
function stampHtml(status: string) {
  if (status !== "已完成" && status !== "已取消") return "";
  const color = status === "已完成" ? "#16a34a" : "#6b7280";
  return `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:36pt;font-weight:900;color:${color};opacity:0.12;pointer-events:none;white-space:nowrap;user-select:none">${status}</div>`;
}

function getTechDisplay(order: any): string {
  try {
    const techs = order.technicians ? JSON.parse(order.technicians) : null;
    if (Array.isArray(techs) && techs.length) return techs.join("、");
  } catch { /* ignore */ }
  if (order.assignedTo) {
    return order.assignedTo + (order.assistantTo ? ` / ${order.assistantTo}` : "");
  }
  return "—";
}

// ─── PDF V2 helpers ──────────────────────────────────────────────────────
async function printWorkOrderPDF(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const html = buildWorkOrderHtml(order);
  if (isMobileDevice()) {
    await handlePdfAction({
      html,
      docNo: woNum,
      filename: `派工單_${woNum}.pdf`,
      title: "景風工程派工單",
      action: "download",
      setPdfPreview,
      toast,
      pageFormat: "custom-240x140-landscape",
    });
  } else {
    openPrintWindow(html, `景風工程派工單 — ${woNum}`);
  }
}

async function shareWorkOrderViaLine(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const html = buildWorkOrderHtml(order);
  await handlePdfAction({
    html,
    docNo: woNum,
    filename: `派工單_${woNum}.pdf`,
    title: "景風工程派工單",
    action: "share",
    setPdfPreview,
    toast,
    pageFormat: "custom-240x140-landscape",
  });
}

// ─── Progress + Quick Payment Panel ────────────────────────────────────────
function ProgressPanel({ workOrderId, customerId, workOrderTitle }: {
  workOrderId: number; customerId: number; workOrderTitle: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isTechnician = user?.role === "technician";
  const { data: progress } = useListProgress(workOrderId);
  const [note, setNote] = useState("");
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: 0,
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "現金",
    notes: "",
  });

  const createProgress = useCreateProgress({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProgressQueryKey(workOrderId) });
        setNote("");
        toast({ title: "進度紀錄已新增" });
      },
    },
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
        setShowPayForm(false);
        toast({ title: "收款已登錄" });
      },
    },
  });

  const METHODS = ["現金", "銀行轉帳", "支票", "LINE Pay", "其他"];

  return (
    <div className="mt-3 ml-2 pl-3 border-l-2 border-muted space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">工程進度紀錄</p>
        {progress && progress.length > 0 ? progress.map(p => (
          <div key={p.id} className="text-xs bg-muted/30 rounded p-2">
            <p className="font-medium">{p.description}</p>
            <p className="text-muted-foreground mt-0.5">
              {new Date(p.createdAt).toLocaleString("zh-TW")}
              {p.recordedBy && ` · ${p.recordedBy}`}
            </p>
          </div>
        )) : <p className="text-xs text-muted-foreground">尚無進度紀錄</p>}
      </div>
      <div className="flex gap-2">
        <Input
          className="text-xs h-8 flex-1"
          placeholder="新增進度說明..."
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && note) createProgress.mutate({ workOrderId, data: { description: note } });
          }}
        />
        <Button
          size="sm" className="h-8 text-xs px-3"
          disabled={!note || createProgress.isPending}
          onClick={() => createProgress.mutate({ workOrderId, data: { description: note } })}
        >新增</Button>
      </div>
      {!isTechnician && !showPayForm && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowPayForm(true)}>
          <CreditCard className="h-3 w-3 mr-1" />登錄收款
        </Button>
      )}
      {!isTechnician && showPayForm && (
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
            <Button size="sm" className="h-7 text-xs" variant="ghost" onClick={() => setShowPayForm(false)}>取消</Button>
            <Button size="sm" className="h-7 text-xs" disabled={!payForm.amount || createPayment.isPending}
              onClick={() => createPayment.mutate({ data: { customerId, workOrderId, ...payForm } })}>
              儲存收款
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Main Page ───────────────────────────────────────────────────────────────
export default function WorkOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === "super_admin" || user?.role === "owner" || user?.role === "admin";
  const queryClient = useQueryClient();

  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const [statusFilter, setStatusFilter] = useState("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<WOForm>(makeEmpty());
  const [arModal, setArModal] = useState<{ order: any; amount: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const pendingARRef = useRef<any>(null);

  const { data: orders, isLoading } = useListWorkOrders({
    ...(filterCustomerId ? { customerId: filterCustomerId } : {}),
    ...(statusFilter !== "全部" ? { status: statusFilter } : {}),
  });
  const { data: customers } = useListCustomers({ includeOld: "true" });
  const { data: employees } = useListEmployees();
  const { data: quotes } = useListQuotes({ includeOld: "true" } as any);

  // Technician options: employees whose position contains "技師" and are active
  const technicianOptions = (employees ?? []).filter(e => e.position?.includes("技師") && e.status !== "離職");

  const createMutation = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setShowCreate(false);
        toast({ title: "派工單已新增" });
      },
    },
  });
  const updateMutation = useUpdateWorkOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setEditItem(null);
        toast({ title: "派工單已更新" });
        if (pendingARRef.current) {
          const o = pendingARRef.current;
          pendingARRef.current = null;
          setArModal({ order: o, amount: "" });
        }
      },
    },
  });

  const createARMutation = useCreateReceivable({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
        setArModal(null);
        toast({ title: "應收帳款已建立", description: "可至「應收帳款」頁面查看" });
      },
      onError: (err: any) => {
        if (err?.status === 409) {
          toast({ title: "此派工單已有應收帳款紀錄" });
          setArModal(null);
        } else {
          toast({ title: "建立失敗，請稍後再試", variant: "destructive" });
        }
      },
    },
  });
  const deleteMutation = useDeleteWorkOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setDeleteId(null);
        toast({ title: "派工單已刪除" });
      },
    },
  });

  function openCreate() {
    setForm(makeEmpty());
    setShowCreate(true);
  }

  function openEdit(o: any) {
    let technicians: string[] = [];
    try {
      const parsed = o.technicians ? JSON.parse(o.technicians) : null;
      if (Array.isArray(parsed)) technicians = parsed;
    } catch { /* ignore */ }

    setForm({
      quoteId: o.quoteId ?? undefined,
      customerId: o.customerId ?? 0,
      customerName: o.customerName ?? "",
      title: o.title ?? "",
      status: o.status,
      contactPerson: o.contactPerson ?? "",
      mobilePhone: o.mobilePhone ?? "",
      telephone: o.telephone ?? "",
      installAddress: o.installAddress ?? "",
      scheduledDate: o.scheduledDate ?? "",
      scheduledTime: o.scheduledTime ?? "",
      completedDate: o.completedDate ?? "",
      technicians,
      projectType: o.projectType ?? "",
      acBrand: o.acBrand ?? "",
      modelNumber: o.modelNumber ?? "",
      quantity: o.quantity ?? undefined,
      indoorUnits: o.indoorUnits ?? undefined,
      outdoorUnits: o.outdoorUnits ?? undefined,
      floorLevel: o.floorLevel ?? "",
      hasElevator: o.hasElevator ?? "",
      description: o.description ?? "",
      notes: o.notes ?? "",
    });
    setEditItem(o);
  }

  function handleSubmit(e: React.FormEvent, mode: "create" | "edit") {
    e.preventDefault();
    if (!form.customerId) { toast({ title: "請選擇客戶", variant: "destructive" }); return; }
    const payload = buildPayload(form);
    if (mode === "create") {
      createMutation.mutate({ data: payload });
    } else {
      if (form.status === "已完成" && editItem?.status !== "已完成") {
        pendingARRef.current = { ...editItem, ...payload };
      }
      updateMutation.mutate({ id: editItem.id, data: payload });
    }
  }

  const isDialogOpen = showCreate || !!editItem;
  const dialogMode = showCreate ? "create" : "edit";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">派工單管理</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">冷氣工程派工管理</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />新增派工單
          </Button>
        )}
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/work-orders")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {["全部", ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >{s}</button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : orders && orders.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {orders.map(o => {
              const techDisplay = getTechDisplay(o);
              return (
                <div key={o.id} className="px-3 sm:px-4 py-3">
                  {/* Row 1: number + badges + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-mono font-semibold text-muted-foreground">
                          {o.workOrderNumber || `#${o.id}`}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {o.status}
                        </span>
                        {o.projectType && (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${PT_COLORS[o.projectType] ?? "bg-gray-100 text-gray-600"}`}>
                            {o.projectType}
                          </span>
                        )}
                      </div>

                      {/* Row 2: customer + address */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="text-sm font-semibold">{o.customerName}</span>
                        {o.installAddress && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{o.installAddress}</span>
                        )}
                      </div>

                      {/* Row 3: date/time + technician */}
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {o.scheduledDate && (
                          <span>施工：{o.scheduledDate}{o.scheduledTime ? ` ${o.scheduledTime}` : ""}</span>
                        )}
                        {techDisplay !== "—" && <span>技師：{techDisplay}</span>}
                        {o.completedDate && <span className="text-green-600">完成：{o.completedDate}</span>}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-0.5 shrink-0 flex-wrap justify-end">
                      {/* AR button for completed orders */}
                      {canWrite && o.status === "已完成" && (
                        <Button
                          variant="outline" size="sm"
                          className="h-7 text-xs px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => setArModal({ order: o, amount: "" })}
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1" />建立帳款
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="列印">
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => printWorkOrderPDF(o, setPdfPreview, toast)}>
                            <Printer className="h-3.5 w-3.5 mr-2" />列印派工單
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="LINE 分享" onClick={() => shareWorkOrderViaLine(o, setPdfPreview, toast)}>
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      {o.installAddress && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700" title="導航" asChild>
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.installAddress)}`} target="_blank" rel="noopener noreferrer">
                            <MapPin className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="進度" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                        {expandedId === o.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      {canWrite && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="編輯" onClick={() => openEdit(o)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(user?.role === "owner" || user?.role === "super_admin") && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="刪除" onClick={() => setDeleteId(o.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress panel */}
                  {expandedId === o.id && (
                    <ProgressPanel workOrderId={o.id} customerId={o.customerId ?? 0} workOrderTitle={o.workOrderNumber || o.title} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center">
          <p className="text-muted-foreground">尚無派工單資料</p>
        </CardContent></Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={open => { if (!open) { setShowCreate(false); setEditItem(null); } }}>
        <DialogContent className="max-w-2xl w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "新增派工單" : `編輯派工單 ${editItem?.workOrderNumber || ""}`}</DialogTitle>
          </DialogHeader>

          <form onSubmit={e => handleSubmit(e, dialogMode)} className="space-y-4 mt-1">
            <WorkOrderFormFields
              form={form}
              setForm={setForm}
              customers={customers ?? []}
              technicianOptions={technicianOptions}
              quotes={quotes ?? []}
              showQuoteSelector={true}
              customerDisabled={dialogMode === "edit"}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreate(false); setEditItem(null); }}
              >取消</Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除這筆派工單嗎？相關進度紀錄也會一併刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AR creation modal */}
      <Dialog open={!!arModal} onOpenChange={open => { if (!open) setArModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>建立應收帳款</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            是否為此派工單建立應收帳款？
          </p>
          {arModal && (
            <div className="text-xs text-muted-foreground bg-muted rounded p-2 space-y-1">
              {arModal.order.workOrderNumber && <div>派工單號：{arModal.order.workOrderNumber}</div>}
              <div>工程：{arModal.order.title}</div>
              {arModal.order.customerName && <div>客戶：{arModal.order.customerName}</div>}
              {arModal.order.projectType && <div>類別：{arModal.order.projectType}</div>}
            </div>
          )}
          <div className="space-y-1">
            <Label>應收金額 (NT$)</Label>
            <Input
              type="number"
              placeholder="請輸入金額"
              value={arModal?.amount ?? ""}
              onChange={e => setArModal(m => m ? { ...m, amount: e.target.value } : m)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArModal(null)}>略過</Button>
            <Button
              disabled={createARMutation.isPending}
              onClick={() => {
                if (!arModal) return;
                const o = arModal.order;
                createARMutation.mutate({ data: {
                  customerId: o.customerId,
                  workOrderId: o.id,
                  workOrderNumber: o.workOrderNumber ?? undefined,
                  projectName: o.title,
                  projectType: o.projectType ?? undefined,
                  completionDate: o.completedDate ?? undefined,
                  totalAmount: parseFloat(arModal.amount) || 0,
                }});
              }}
            >確認建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdfPreviewDialog
        open={!!pdfPreview}
        pdfUrl={pdfPreview?.url ?? ""}
        filename={pdfPreview?.filename ?? ""}
        onClose={() => setPdfPreview(null)}
        onDownload={() => {
          if (!pdfPreview) return;
          const a = document.createElement("a");
          a.href = pdfPreview.url;
          a.download = pdfPreview.filename;
          a.click();
        }}
      />
    </div>
  );
}
