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
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard, Printer, Share2, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const STATUSES = ["待處理", "進行中", "已完成", "已取消"];
const PROJECT_TYPES = ["新裝", "維修", "保養", "遷機", "清洗", "保固服務"];
const ELEVATOR_OPTIONS = ["有電梯", "無電梯"];

const STATUS_COLORS: Record<string, string> = {
  "待處理": "bg-amber-100 text-amber-700",
  "進行中": "bg-blue-100 text-blue-700",
  "已完成": "bg-green-100 text-green-700",
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

// ─── Print work order in new window ────────────────────────────────────────
function printWorkOrder(order: any) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${woNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei',Arial,sans-serif;font-size:11pt;color:#111;background:#fff}
.page{padding:14mm 18mm}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:5mm;margin-bottom:5mm}
.co-name{font-size:20pt;font-weight:700}
.co-sub{font-size:9pt;color:#555;margin-top:2px}
.wo-right{text-align:right}
.wo-num{font-size:15pt;font-weight:700}
.wo-meta{font-size:9pt;color:#555;margin-top:2px}
h2{font-size:10.5pt;font-weight:700;background:#f3f3f3;padding:2mm 4mm;margin:4mm 0 3mm;border-left:3px solid #444}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm 12mm;margin:0 0 2mm}
.field{display:flex;gap:3mm;align-items:baseline}
.lbl{font-size:8.5pt;color:#666;min-width:52px;flex-shrink:0}
.val{font-size:10pt;font-weight:500}
.full{grid-column:1/-1}
.box{border:1px solid #ccc;border-radius:2px;padding:2.5mm 3mm;min-height:16mm;font-size:10pt;white-space:pre-wrap;line-height:1.5}
.sigs{margin-top:12mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10mm}
.sig{text-align:center;border-top:1px solid #555;padding-top:2mm;font-size:8.5pt;color:#555}
@media print{@page{size:A4;margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div>
      <div class="co-name">晟風工程</div>
      <div class="co-sub">冷氣空調工程專業服務</div>
    </div>
    <div class="wo-right">
      <div class="wo-num">派工單 ${woNum}</div>
      <div class="wo-meta">狀態：${order.status}　工程類型：${order.projectType || '—'}</div>
      <div class="wo-meta">開單：${(order.createdAt || '').slice(0,10) || '—'}</div>
    </div>
  </div>

  <h2>客戶資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">客戶名稱</span><span class="val">${order.customerName || '—'}</span></div>
    <div class="field"><span class="lbl">聯絡人</span><span class="val">${order.contactPerson || '—'}</span></div>
    <div class="field"><span class="lbl">行動電話</span><span class="val">${order.mobilePhone || '—'}</span></div>
    <div class="field"><span class="lbl">聯絡電話</span><span class="val">${order.telephone || '—'}</span></div>
    <div class="field full"><span class="lbl">施工地址</span><span class="val">${order.installAddress || '—'}</span></div>
  </div>

  <h2>預約資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">預約日期</span><span class="val">${order.scheduledDate || '—'}</span></div>
    <div class="field"><span class="lbl">預約時間</span><span class="val">${order.scheduledTime || '—'}</span></div>
    <div class="field"><span class="lbl">完成日期</span><span class="val">${order.completedDate || '—'}</span></div>
  </div>

  <h2>技師資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">負責師傅</span><span class="val">${order.assignedTo || '—'}</span></div>
    <div class="field"><span class="lbl">協助師傅</span><span class="val">${order.assistantTo || '—'}</span></div>
  </div>

  <h2>設備資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">冷氣品牌</span><span class="val">${order.acBrand || '—'}</span></div>
    <div class="field"><span class="lbl">型號</span><span class="val">${order.modelNumber || '—'}</span></div>
    <div class="field"><span class="lbl">數量</span><span class="val">${order.quantity != null ? order.quantity + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">室內機</span><span class="val">${order.indoorUnits != null ? order.indoorUnits + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">室外機</span><span class="val">${order.outdoorUnits != null ? order.outdoorUnits + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">樓層</span><span class="val">${order.floorLevel || '—'}</span></div>
    <div class="field"><span class="lbl">電梯</span><span class="val">${order.hasElevator || '—'}</span></div>
  </div>

  <h2>工程說明</h2>
  <div class="box">${(order.description || '（無）').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>

  <h2>特別注意事項</h2>
  <div class="box">${(order.notes || '（無）').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>

  <div class="sigs">
    <div class="sig">派工人員簽名</div>
    <div class="sig">技師簽名</div>
    <div class="sig">客戶確認簽名</div>
  </div>
</div>
<script>window.onload=function(){window.print();}</script>
</body>
</html>`;
  const w = window.open("", "_blank", "width=820,height=1060");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── LINE Share ─────────────────────────────────────────────────────────────
function shareViaLine(order: any) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const mapsUrl = order.installAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.installAddress)}`
    : "";
  const lines = [
    "【晟風工程 派工通知】",
    "",
    `派工單號：${woNum}`,
    `客戶：${order.customerName || "—"}`,
    `行動電話：${order.mobilePhone || "—"}`,
    `施工地址：${order.installAddress || "—"}`,
    mapsUrl ? `地圖導航：${mapsUrl}` : "",
    "",
    `預約日期：${order.scheduledDate || "—"}`,
    `預約時間：${order.scheduledTime || "—"}`,
    "",
    `負責師傅：${order.assignedTo || "—"}`,
    order.assistantTo ? `協助師傅：${order.assistantTo}` : "",
    "",
    `工程說明：${order.description || "—"}`,
    order.notes ? `\n特別注意：${order.notes}` : "",
  ].filter(l => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
  window.open(`https://line.me/R/msg/text?${encodeURIComponent(lines)}`, "_blank");
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

// ─── Section heading ─────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 pb-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</p>
      <Separator className="mt-1" />
    </div>
  );
}

// ─── Empty form ──────────────────────────────────────────────────────────────
function makeEmpty() {
  return {
    customerId: 0,
    title: "",
    status: "待處理",
    contactPerson: "",
    mobilePhone: "",
    telephone: "",
    installAddress: "",
    scheduledDate: "",
    scheduledTime: "",
    completedDate: "",
    assignedTo: "",
    assistantTo: "",
    projectType: "",
    acBrand: "",
    modelNumber: "",
    quantity: undefined as number | undefined,
    indoorUnits: undefined as number | undefined,
    outdoorUnits: undefined as number | undefined,
    floorLevel: "",
    hasElevator: "",
    description: "",
    notes: "",
  };
}

type WOForm = ReturnType<typeof makeEmpty>;

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function WorkOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === "owner" || user?.role === "admin";
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<WOForm>(makeEmpty());

  const { data: orders, isLoading } = useListWorkOrders(statusFilter !== "全部" ? { status: statusFilter } : {});
  const { data: customers } = useListCustomers({ includeOld: "true" });

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

  function handleCustomerChange(v: string) {
    const cid = parseInt(v);
    const cust = customers?.find(c => c.id === cid);
    setForm(f => ({
      ...f,
      customerId: cid,
      mobilePhone: f.mobilePhone || cust?.phone || "",
      installAddress: f.installAddress || cust?.address || "",
    }));
  }

  function openCreate() {
    setForm(makeEmpty());
    setShowCreate(true);
  }

  function openEdit(o: any) {
    setForm({
      customerId: o.customerId,
      title: o.title ?? "",
      status: o.status,
      contactPerson: o.contactPerson ?? "",
      mobilePhone: o.mobilePhone ?? "",
      telephone: o.telephone ?? "",
      installAddress: o.installAddress ?? "",
      scheduledDate: o.scheduledDate ?? "",
      scheduledTime: o.scheduledTime ?? "",
      completedDate: o.completedDate ?? "",
      assignedTo: o.assignedTo ?? "",
      assistantTo: o.assistantTo ?? "",
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

  function buildPayload(f: WOForm) {
    const title = f.title.trim() || `${f.projectType || "派工"} 派工單`;
    return {
      customerId: f.customerId,
      title,
      status: f.status,
      contactPerson: f.contactPerson || undefined,
      mobilePhone: f.mobilePhone || undefined,
      telephone: f.telephone || undefined,
      installAddress: f.installAddress || undefined,
      scheduledDate: f.scheduledDate || undefined,
      scheduledTime: f.scheduledTime || undefined,
      completedDate: f.completedDate || undefined,
      assignedTo: f.assignedTo || undefined,
      assistantTo: f.assistantTo || undefined,
      projectType: f.projectType || undefined,
      acBrand: f.acBrand || undefined,
      modelNumber: f.modelNumber || undefined,
      quantity: f.quantity,
      indoorUnits: f.indoorUnits,
      outdoorUnits: f.outdoorUnits,
      floorLevel: f.floorLevel || undefined,
      hasElevator: f.hasElevator || undefined,
      description: f.description || undefined,
      notes: f.notes || undefined,
    };
  }

  function handleSubmit(e: React.FormEvent, mode: "create" | "edit") {
    e.preventDefault();
    if (!form.customerId) { toast({ title: "請選擇客戶", variant: "destructive" }); return; }
    const payload = buildPayload(form);
    if (mode === "create") {
      createMutation.mutate({ data: payload });
    } else {
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
            {orders.map(o => (
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
                        <span>預約：{o.scheduledDate}{o.scheduledTime ? ` ${o.scheduledTime}` : ""}</span>
                      )}
                      {o.assignedTo && <span>師傅：{o.assignedTo}{o.assistantTo ? ` / ${o.assistantTo}` : ""}</span>}
                      {o.completedDate && <span className="text-green-600">完成：{o.completedDate}</span>}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-0.5 shrink-0 flex-wrap justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="列印" onClick={() => printWorkOrder(o)}>
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="LINE 分享" onClick={() => shareViaLine(o)}>
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
                    {user?.role === "owner" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="刪除" onClick={() => setDeleteId(o.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress panel */}
                {expandedId === o.id && (
                  <ProgressPanel workOrderId={o.id} customerId={o.customerId} workOrderTitle={o.workOrderNumber || o.title} />
                )}
              </div>
            ))}
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
            {/* ── 客戶資訊 ── */}
            <SectionHeading>客戶資訊</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>客戶 *</Label>
                <Select
                  value={form.customerId ? String(form.customerId) : ""}
                  onValueChange={handleCustomerChange}
                  disabled={dialogMode === "edit"}
                >
                  <SelectTrigger><SelectValue placeholder="選擇客戶" /></SelectTrigger>
                  <SelectContent>
                    {customers?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dialogMode === "create" && form.customerId > 0 && (
                  <p className="text-xs text-muted-foreground">已自動帶入電話及地址，可修改</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>聯絡人</Label>
                <Input placeholder="聯絡人姓名" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>行動電話</Label>
                <Input type="tel" placeholder="0912-345-678" value={form.mobilePhone} onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>聯絡電話</Label>
                <Input type="tel" placeholder="(02) 1234-5678" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>施工地址</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="施工地址"
                    value={form.installAddress}
                    onChange={e => setForm(f => ({ ...f, installAddress: e.target.value }))}
                  />
                  {form.installAddress && (
                    <Button type="button" variant="outline" size="icon" asChild title="Google Maps 導航">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.installAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* ── 預約資訊 ── */}
            <SectionHeading>預約資訊</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>預約日期</Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>預約時間</Label>
                <Input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>完成日期</Label>
                <Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} />
              </div>
            </div>

            {/* ── 派工資訊 ── */}
            <SectionHeading>派工資訊</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>狀態</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>工程類型</Label>
                <Select value={form.projectType} onValueChange={v => setForm(f => ({ ...f, projectType: v }))}>
                  <SelectTrigger><SelectValue placeholder="選擇類型" /></SelectTrigger>
                  <SelectContent>{PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>工程標題</Label>
                <Input
                  placeholder={`${form.projectType || "派工"} 派工單`}
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>負責師傅</Label>
                <Input placeholder="技師姓名" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>協助師傅</Label>
                <Input placeholder="協助技師（選填）" value={form.assistantTo} onChange={e => setForm(f => ({ ...f, assistantTo: e.target.value }))} />
              </div>
            </div>

            {/* ── 設備資訊 ── */}
            <SectionHeading>冷氣設備</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>冷氣品牌</Label>
                <Input placeholder="大金、日立…" value={form.acBrand} onChange={e => setForm(f => ({ ...f, acBrand: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>型號</Label>
                <Input placeholder="型號" value={form.modelNumber} onChange={e => setForm(f => ({ ...f, modelNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>數量（台）</Label>
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={form.quantity ?? ""}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value ? parseInt(e.target.value) : undefined }))}
                />
              </div>
              <div className="space-y-1">
                <Label>室內機（台）</Label>
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={form.indoorUnits ?? ""}
                  onChange={e => setForm(f => ({ ...f, indoorUnits: e.target.value ? parseInt(e.target.value) : undefined }))}
                />
              </div>
              <div className="space-y-1">
                <Label>室外機（台）</Label>
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={form.outdoorUnits ?? ""}
                  onChange={e => setForm(f => ({ ...f, outdoorUnits: e.target.value ? parseInt(e.target.value) : undefined }))}
                />
              </div>
              <div className="space-y-1">
                <Label>樓層</Label>
                <Input placeholder="例：3樓" value={form.floorLevel} onChange={e => setForm(f => ({ ...f, floorLevel: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>電梯</Label>
                <Select value={form.hasElevator} onValueChange={v => setForm(f => ({ ...f, hasElevator: v }))}>
                  <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">（未填）</SelectItem>
                    {ELEVATOR_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── 工程說明 ── */}
            <SectionHeading>工程說明</SectionHeading>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>工程說明</Label>
                <Textarea
                  rows={3}
                  placeholder="描述工程內容、施工要求…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>特別注意事項</Label>
                <Textarea
                  rows={2}
                  placeholder="停車、進出限制、注意事項…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

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
    </div>
  );
}
