import { useMemo, useState } from "react";
import {
  useListWholesaleSettlementSummary,
  useListWholesaleSettlementDetail,
  getListWholesaleSettlementSummaryQueryKey,
  getListWholesaleSettlementDetailQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, CreditCard, FileText, CalendarDays, Printer, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { handlePdfAction, isMobileDevice, openPrintWindow } from "@/components/pdf/pdf-service";
import { buildStatementHtml } from "@/components/pdf/templates/StatementTemplate";
import {
  createWholesalePayment,
  deleteWholesalePaymentRecord,
  updateWholesalePaymentRecord,
  type WholesalePaymentRecordDto,
} from "@/lib/wholesalePaymentsApi";
import {
  WHOLESALE_PAYMENT_METHODS,
  normalizeWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
} from "../../../shared/wholesalePaymentMath.ts";

function fmtMoney(n: number | string | null | undefined) {
  if (n == null) return "—";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(num)) return "—";
  return `NT$ ${Math.round(num).toLocaleString()}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return d.replace(/-/g, "/");
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function firstDayOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const STATUS_CLASS: Record<string, string> = {
  "未收款": "bg-red-100 text-red-700",
  "部分收款": "bg-amber-100 text-amber-700",
  "已收清": "bg-green-100 text-green-700",
};

function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  const label = normalizeWholesalePaymentStatus(status);
  return <Badge className={STATUS_CLASS[label]}>{label}</Badge>;
}

interface DetailItem {
  orderId: number;
  orderNumber: string | null;
  orderDate: string | null;
  productName: string;
  brand: string | null;
  model: string | null;
  spec: string | null;
  unit: string | null;
  qty: number;
  unitPrice: string | null;
  amount: string | null;
  notes: string | null;
}

type SettlementOrder = {
  id: number;
  orderNumber?: string | null;
  orderDate?: string | null;
  customerId?: number | null;
  notes?: string | null;
  taxRate?: string | null;
  total: string;
  orderAmount?: number;
  receivedAmount?: number;
  outstandingAmount?: number;
  paymentStatus?: string;
  items?: Array<{
    productName?: string;
    brand?: string | null;
    model?: string | null;
    spec?: string | null;
    unit?: string | null;
    qty?: number;
    unitPrice?: string | null;
    amount?: string | null;
  }>;
  payments?: WholesalePaymentRecordDto[];
};

type PayDialogState = {
  customerId: number;
  customerName: string;
  orderId?: number;
  orderNumber?: string | null;
  totalAmount: number;
  receivedAmount: number;
};

function buildInvoiceBody(
  customerName: string,
  fromDate: string,
  toDate: string,
  flat: DetailItem[],
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number
): string {
  const rows = flat.map((it) => `
    <tr>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${fmtDate(it.orderDate)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${it.orderNumber ?? "—"}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${it.productName}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${it.model ?? ""}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${it.spec ?? ""}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:center">${it.qty}${it.unit ? " " + it.unit : ""}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoney(it.unitPrice)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoney(it.amount)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${it.notes ?? ""}</td>
    </tr>
  `).join("");

  return `
    <div style="font-family:'Microsoft JhengHei','Heiti TC',sans-serif;padding:20px;max-width:720px;margin:0 auto;color:#000">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="font-size:20px;margin-bottom:4px;letter-spacing:2px">晟風工程有限公司</h1>
        <p style="font-size:11px;color:#333;margin:0">冷氣工程 / 批發請款單</p>
      </div>

      <div style="display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px">
        <div>
          <p style="margin:2px 0"><strong>客戶：</strong>${customerName}</p>
          <p style="margin:2px 0"><strong>日期區間：</strong>${fromDate} — ${toDate}</p>
        </div>
        <div style="text-align:right">
          <p style="margin:2px 0"><strong>匯款資訊</strong></p>
          <p style="margin:2px 0">國泰世華銀行</p>
          <p style="margin:2px 0">代號 013 / 帳號 047035012164</p>
          <p style="margin:2px 0">戶名：晟風工程行 洪宇風</p>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:70px">出貨日</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:80px">出貨單號</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left">商品</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:80px">型號</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:80px">規格</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:center;width:50px">數量</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:right;width:70px">單價</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:right;width:70px">金額</th>
            <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:80px">備註</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
        <div style="width:220px;font-size:12px">
          <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #ddd">
            <span>小計</span><span>${fmtMoney(subtotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #ddd">
            <span>稅額 (${taxRate}%)</span><span>${fmtMoney(taxAmount)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;font-size:14px">
            <span>總金額</span><span>${fmtMoney(total)}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px">
        <div>
          <p style="margin-bottom:4px"><strong>客戶簽收</strong></p>
          <div style="border-bottom:1px solid #000;width:160px;height:24px"></div>
        </div>
        <div style="text-align:right">
          <p>請款單日期：${todayStr()}</p>
        </div>
      </div>
    </div>
  `;
}

export default function WholesaleSettlements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fromDate, setFromDate] = useState(firstDayOfMonthStr());
  const [toDate, setToDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<{ id: number; name: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);

  const [payTarget, setPayTarget] = useState<PayDialogState | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [payMethod, setPayMethod] = useState<string>("現金");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

  const [editPayment, setEditPayment] = useState<WholesalePaymentRecordDto | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editMethod, setEditMethod] = useState("現金");
  const [editNote, setEditNote] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletePayment, setDeletePayment] = useState<WholesalePaymentRecordDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const summaryParams = { from: fromDate, to: toDate };
  const { data: summary, isLoading } = useListWholesaleSettlementSummary(
    summaryParams,
    { query: { enabled: !!fromDate && !!toDate, queryKey: getListWholesaleSettlementSummaryQueryKey(summaryParams) } }
  );

  const { data: rawDetail, isLoading: detailLoading, refetch: refetchDetail } = useListWholesaleSettlementDetail(
    detailCustomer?.id ?? 0,
    summaryParams,
    { query: { enabled: !!detailCustomer && !!fromDate && !!toDate, queryKey: getListWholesaleSettlementDetailQueryKey(detailCustomer?.id ?? 0, summaryParams) } }
  );
  const detailData = (rawDetail ?? []) as SettlementOrder[];

  const list = summary?.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.customerName ?? "").toLowerCase().includes(q);
  }) ?? [];

  const totalAll = list.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0);
  const receivedAll = list.reduce((sum, s) => sum + (s.receivedAmount ?? 0), 0);
  const receivableAll = list.reduce((sum, s) => sum + remainingAmount(s.totalAmount ?? 0, s.receivedAmount ?? 0), 0);

  const detailTotals = useMemo(() => {
    const total = detailData.reduce((sum, order) => sum + parseMoney(order.orderAmount ?? order.total), 0);
    const received = detailData.reduce((sum, order) => sum + parseMoney(order.receivedAmount), 0);
    return {
      total,
      received,
      outstanding: remainingAmount(total, received),
    };
  }, [detailData]);

  const allPayments = useMemo(() => {
    const rows: WholesalePaymentRecordDto[] = [];
    for (const order of detailData) {
      for (const payment of order.payments ?? []) {
        rows.push(payment);
      }
    }
    return rows.sort((a, b) => {
      const dateCmp = (a.paymentDate ?? "").localeCompare(b.paymentDate ?? "");
      if (dateCmp !== 0) return dateCmp;
      return a.id - b.id;
    });
  }, [detailData]);

  async function refreshSettlementData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListWholesaleSettlementSummaryQueryKey(summaryParams) }),
      detailCustomer
        ? queryClient.invalidateQueries({ queryKey: getListWholesaleSettlementDetailQueryKey(detailCustomer.id, summaryParams) })
        : Promise.resolve(),
    ]);
    if (detailCustomer) await refetchDetail();
  }

  function openDetail(customerId: number, customerName: string) {
    setDetailCustomer({ id: customerId, name: customerName });
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailCustomer(null);
  }

  function openPayDialog(target: PayDialogState) {
    const outstanding = remainingAmount(target.totalAmount, target.receivedAmount);
    setPayTarget(target);
    setPayAmount(outstanding > 0 ? String(outstanding) : "");
    setPayDate(todayStr());
    setPayMethod("現金");
    setPayNote("");
  }

  function flatItems(): DetailItem[] {
    if (!detailData) return [];
    const result: DetailItem[] = [];
    for (const order of detailData) {
      const items = order.items ?? [];
      if (items.length === 0) {
        result.push({
          orderId: order.id,
          orderNumber: order.orderNumber ?? null,
          orderDate: order.orderDate ?? null,
          productName: "—",
          brand: null,
          model: null,
          spec: null,
          unit: null,
          qty: 0,
          unitPrice: null,
          amount: null,
          notes: order.notes ?? null,
        });
      } else {
        for (const it of items) {
          result.push({
            orderId: order.id,
            orderNumber: order.orderNumber ?? null,
            orderDate: order.orderDate ?? null,
            productName: it.productName ?? "",
            brand: it.brand ?? null,
            model: it.model ?? null,
            spec: it.spec ?? null,
            unit: it.unit ?? null,
            qty: it.qty ?? 0,
            unitPrice: it.unitPrice ?? null,
            amount: it.amount ?? null,
            notes: order.notes ?? null,
          });
        }
      }
    }
    return result;
  }

  async function printInvoice() {
    if (!detailCustomer || !detailData.length) return;
    const flat = flatItems();
    const subtotal = flat.reduce((sum, it) => sum + parseFloat(it.amount ?? "0"), 0);
    const taxRate = detailData[0]?.taxRate ? parseFloat(detailData[0].taxRate) : 0;
    const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100;
    const total = subtotal + taxAmount;
    const docNo = `${detailCustomer.name}_${fromDate}`;
    const html = buildStatementHtml(detailCustomer.name, fromDate, toDate, flat, subtotal, taxRate, taxAmount, total, 0, total);
    if (isMobileDevice()) {
      await handlePdfAction({
        html,
        docNo,
        filename: `請款單_${docNo}.pdf`,
        title: "晟風工程批發請款單",
        action: "download",
        setPdfPreview,
        toast: toast as any,
        pageFormat: "a4",
      });
    } else {
      openPrintWindow(html, `晟風工程批發請款單 — ${docNo}`);
    }
  }

  async function sendLinePDF() {
    if (!detailCustomer || !detailData.length) return;
    const flat = flatItems();
    const subtotal = flat.reduce((sum, it) => sum + parseFloat(it.amount ?? "0"), 0);
    const taxRate = detailData[0]?.taxRate ? parseFloat(detailData[0].taxRate) : 0;
    const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100;
    const total = subtotal + taxAmount;
    const docNo = `${detailCustomer.name}_${fromDate}`;
    const html = buildStatementHtml(detailCustomer.name, fromDate, toDate, flat, subtotal, taxRate, taxAmount, total, 0, total);
    await handlePdfAction({
      html,
      docNo,
      filename: `請款單_${docNo}.pdf`,
      title: "晟風工程批發請款單",
      action: "share",
      setPdfPreview,
      toast: toast as any,
      pageFormat: "a4",
    });
  }

  async function submitPayment() {
    if (!payTarget) return;
    const amount = parseMoney(payAmount);
    if (!(amount > 0)) {
      toast({ title: "請輸入本次收款金額", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      await createWholesalePayment({
        customerId: payTarget.customerId,
        orderId: payTarget.orderId,
        amount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        note: payNote.trim() || undefined,
        from: payTarget.orderId ? undefined : fromDate,
        to: payTarget.orderId ? undefined : toDate,
      });
      toast({ title: "已登記收款" });
      setPayTarget(null);
      await refreshSettlementData();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "登記收款失敗", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  }

  async function submitEditPayment() {
    if (!editPayment) return;
    const amount = parseMoney(editAmount);
    if (!(amount > 0)) {
      toast({ title: "請輸入收款金額", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      await updateWholesalePaymentRecord(editPayment.id, {
        amount,
        paymentDate: editDate,
        paymentMethod: editMethod,
        note: editNote.trim() ? editNote.trim() : null,
      });
      toast({ title: "已修改收款紀錄" });
      setEditPayment(null);
      await refreshSettlementData();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "修改失敗", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDeletePayment() {
    if (!deletePayment) return;
    setDeleting(true);
    try {
      await deleteWholesalePaymentRecord(deletePayment.id);
      toast({ title: "已刪除收款紀錄" });
      setDeletePayment(null);
      await refreshSettlementData();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "刪除失敗", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const payOutstanding = payTarget ? remainingAmount(payTarget.totalAmount, payTarget.receivedAmount) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發月結 / 應收</h1>
          <p className="text-sm text-muted-foreground">依日期區間統計已出貨訂單，並登記實際收款</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex gap-2 items-center">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">起始日</Label>
                <Input type="date" className="h-9 w-40" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground">—</span>
              <div>
                <Label className="text-xs text-muted-foreground">截止日</Label>
                <Input type="date" className="h-9 w-40" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>
            <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="搜尋客戶名稱…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">客戶數</p>
          <p className="text-2xl font-bold mt-1">{list.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">訂單總金額</p>
          <p className="text-2xl font-bold mt-1">{fmtMoney(totalAll)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">已收金額</p>
          <p className="text-2xl font-bold mt-1 text-green-700">{fmtMoney(receivedAll)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">待收總額</p>
          <p className="text-2xl font-bold mt-1 text-red-600">{fmtMoney(receivableAll)}</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-14 text-center">
          <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">該日期區間無已出貨紀錄</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map((s) => {
            const outstanding = remainingAmount(s.totalAmount ?? 0, s.receivedAmount ?? 0);
            return (
              <Card key={s.customerId} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openDetail(s.customerId, s.customerName)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{s.customerName}</p>
                        <Badge variant="outline">{s.orderCount} 筆</Badge>
                        <PaymentStatusBadge status={(s as { paymentStatus?: string }).paymentStatus ?? (outstanding <= 0 ? "已收清" : (s.receivedAmount ?? 0) > 0 ? "部分收款" : "未收款")} />
                      </div>
                      <div className="flex flex-wrap gap-4 mt-1 text-sm">
                        <span className="text-muted-foreground">訂單總額 <span className="text-foreground font-medium">{fmtMoney(s.totalAmount)}</span></span>
                        <span className="text-muted-foreground">待收 <span className="text-red-600 font-medium">{fmtMoney(outstanding)}</span></span>
                        <span className="text-muted-foreground">已收 <span className="text-green-600 font-medium">{fmtMoney(s.receivedAmount)}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={outstanding <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPayDialog({
                            customerId: s.customerId,
                            customerName: s.customerName,
                            totalAmount: s.totalAmount ?? 0,
                            receivedAmount: s.receivedAmount ?? 0,
                          });
                        }}
                      >
                        登記收款
                      </Button>
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailCustomer?.name} — 出貨明細</DialogTitle>
          </DialogHeader>
          <Separator />
          {detailLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !detailData.length ? (
            <p className="text-muted-foreground text-center py-8">無出貨紀錄</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span>訂單總額 <strong>{fmtMoney(detailTotals.total)}</strong></span>
                <span>已收 <strong className="text-green-700">{fmtMoney(detailTotals.received)}</strong></span>
                <span>待收 <strong className="text-red-600">{fmtMoney(detailTotals.outstanding)}</strong></span>
              </div>

              {detailData.map((order) => {
                const total = parseMoney(order.orderAmount ?? order.total);
                const received = parseMoney(order.receivedAmount);
                const outstanding = remainingAmount(total, received);
                return (
                  <div key={order.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{order.orderNumber ?? `出貨單 #${order.id}`}</p>
                          <span className="text-sm text-muted-foreground">{fmtDate(order.orderDate)}</span>
                          <PaymentStatusBadge status={order.paymentStatus} />
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-sm">
                          <span>出貨金額 {fmtMoney(total)}</span>
                          <span>已收金額 {fmtMoney(received)}</span>
                          <span>未收金額 <span className="text-red-600">{fmtMoney(outstanding)}</span></span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={outstanding <= 0 || !detailCustomer}
                        onClick={() => detailCustomer && openPayDialog({
                          customerId: detailCustomer.id,
                          customerName: detailCustomer.name,
                          orderId: order.id,
                          orderNumber: order.orderNumber,
                          totalAmount: total,
                          receivedAmount: received,
                        })}
                      >
                        登記收款
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground text-xs">
                            <th className="py-2 pr-3">商品</th>
                            <th className="py-2 pr-3">型號</th>
                            <th className="py-2 pr-3">規格</th>
                            <th className="py-2 pr-3 text-right">數量</th>
                            <th className="py-2 pr-3 text-right">單價</th>
                            <th className="py-2 text-right">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(order.items ?? []).map((it, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="py-2 pr-3">{it.productName ?? "—"}</td>
                              <td className="py-2 pr-3">{it.model ?? "—"}</td>
                              <td className="py-2 pr-3">{it.spec ?? "—"}</td>
                              <td className="py-2 pr-3 text-right">{it.qty ?? 0}{it.unit ? ` ${it.unit}` : ""}</td>
                              <td className="py-2 pr-3 text-right">{fmtMoney(it.unitPrice)}</td>
                              <td className="py-2 text-right">{fmtMoney(it.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <div>
                <h3 className="font-medium mb-2">收款紀錄</h3>
                {allPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚未登記收款</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground text-xs">
                          <th className="py-2 pr-3">日期</th>
                          <th className="py-2 pr-3 text-right">收款金額</th>
                          <th className="py-2 pr-3">方式</th>
                          <th className="py-2 pr-3">備註</th>
                          <th className="py-2 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPayments.map((payment) => (
                          <tr key={payment.id} className="border-b">
                            <td className="py-2 pr-3">{fmtDate(payment.paymentDate)}</td>
                            <td className="py-2 pr-3 text-right">{fmtMoney(payment.amount)}</td>
                            <td className="py-2 pr-3">{payment.paymentMethod ?? "—"}</td>
                            <td className="py-2 pr-3">{payment.note ?? "—"}</td>
                            <td className="py-2 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditPayment(payment);
                                  setEditAmount(String(parseMoney(payment.amount)));
                                  setEditDate(payment.paymentDate);
                                  setEditMethod(payment.paymentMethod || "現金");
                                  setEditNote(payment.note ?? "");
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />修改
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeletePayment(payment)}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" />刪除
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={closeDetail}>關閉</Button>
            <Button size="sm" variant="secondary" onClick={sendLinePDF}>
              <MessageCircle className="h-4 w-4 mr-1" />LINE 傳送 PDF
            </Button>
            <Button size="sm" onClick={printInvoice}>
              <Printer className="h-4 w-4 mr-1" />列印請款單
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>登記收款{payTarget?.orderNumber ? ` — ${payTarget.orderNumber}` : payTarget ? ` — ${payTarget.customerName}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>本期應收金額</Label>
              <Input value={fmtMoney(payTarget?.totalAmount)} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>已收金額</Label>
              <Input value={fmtMoney(payTarget?.receivedAmount)} readOnly className="bg-muted" />
            </div>
            <p className="text-xs text-muted-foreground">未收 {fmtMoney(payOutstanding)}</p>
            <div>
              <Label>本次收款金額</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>收款日期</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div>
              <Label>收款方式</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WHOLESALE_PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>{method}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>備註</Label>
              <Textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="選填" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>取消</Button>
            <Button onClick={submitPayment} disabled={paying || payOutstanding <= 0}>
              {paying ? "處理中…" : "確認收款"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPayment} onOpenChange={(open) => !open && setEditPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>修改收款紀錄</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>收款金額</Label>
              <Input type="number" min="0" step="1" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            </div>
            <div>
              <Label>收款日期</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div>
              <Label>收款方式</Label>
              <Select value={editMethod} onValueChange={setEditMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WHOLESALE_PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>{method}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>備註</Label>
              <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)}>取消</Button>
            <Button onClick={submitEditPayment} disabled={savingEdit}>{savingEdit ? "儲存中…" : "儲存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletePayment} onOpenChange={(open) => !open && setDeletePayment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除收款紀錄？</AlertDialogTitle>
            <AlertDialogDescription>
              將刪除 {fmtDate(deletePayment?.paymentDate)} {fmtMoney(deletePayment?.amount)} 這筆收款，待收金額會立刻重算。列印請款單不會受影響。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDeletePayment();
              }}
              disabled={deleting}
            >
              {deleting ? "刪除中…" : "刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
