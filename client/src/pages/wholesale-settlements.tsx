import { useMemo, useState } from "react";
import {
  useListWholesaleSettlementSummary,
  useListWholesaleSettlementDetail,
  getListWholesaleSettlementSummaryQueryKey,
  getListWholesaleSettlementDetailQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
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
import {
  Search,
  CreditCard,
  FileText,
  CalendarDays,
  Printer,
  MessageCircle,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { handlePdfAction, isMobileDevice, openPrintWindow } from "@/components/pdf/pdf-service";
import { buildStatementHtml, type StatementLineItem } from "@/components/pdf/templates/StatementTemplate";
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
import { computeStatementTotalsFromOrders } from "../../../shared/wholesaleSettlementLogic.ts";

export const WHOLESALE_SETTLEMENT_RELEASE_MARKER = "wholesale-settlement-fix-v2";

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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

type SettlementOrder = {
  id: number;
  orderNumber?: string | null;
  orderDate?: string | null;
  expectedDelivery?: string | null;
  status?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  notes?: string | null;
  subtotal?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  shippingFee?: string | null;
  total: string;
  subtotalAmount?: number;
  taxAmountNum?: number;
  shippingFeeNum?: number;
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
    discount?: string | null;
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

export default function WholesaleSettlements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fromDate, setFromDate] = useState(firstDayOfMonthStr());
  const [toDate, setToDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<{ id: number; name: string } | null>(null);
  const [collapsedOrderIds, setCollapsedOrderIds] = useState<Record<number, boolean>>({});
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
  const detailParams = useMemo(
    () => ({
      from: fromDate,
      to: toDate,
      ...(detailCustomer?.name ? { customerName: detailCustomer.name } : {}),
    }),
    [fromDate, toDate, detailCustomer?.name],
  );

  const { data: summary, isLoading } = useListWholesaleSettlementSummary(
    summaryParams,
    { query: { enabled: !!fromDate && !!toDate, queryKey: getListWholesaleSettlementSummaryQueryKey(summaryParams) } }
  );

  const { data: rawDetail, isLoading: detailLoading, refetch: refetchDetail } = useListWholesaleSettlementDetail(
    detailCustomer?.id ?? 0,
    detailParams as any,
    {
      query: {
        enabled: !!detailCustomer && !!fromDate && !!toDate,
        queryKey: getListWholesaleSettlementDetailQueryKey(detailCustomer?.id ?? 0, detailParams as any),
      },
    }
  );
  const detailData = (rawDetail ?? []) as SettlementOrder[];

  const list = summary?.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.customerName ?? "").toLowerCase().includes(q);
  }) ?? [];

  const totalAll = list.reduce((sum, s) => sum + parseMoney(s.totalAmount ?? 0), 0);
  const receivedAll = list.reduce((sum, s) => sum + parseMoney(s.receivedAmount ?? 0), 0);
  const receivableAll = list.reduce((sum, s) => sum + remainingAmount(s.totalAmount ?? 0, s.receivedAmount ?? 0), 0);

  const detailTotals = useMemo(() => {
    return computeStatementTotalsFromOrders(detailData);
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
        ? queryClient.invalidateQueries({ queryKey: getListWholesaleSettlementDetailQueryKey(detailCustomer.id, detailParams as any) })
        : Promise.resolve(),
    ]);
    if (detailCustomer) await refetchDetail();
  }

  function openDetail(customerId: number, customerName: string) {
    setDetailCustomer({ id: customerId, name: customerName });
    setCollapsedOrderIds({});
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailCustomer(null);
  }

  function toggleOrderCollapse(orderId: number) {
    setCollapsedOrderIds((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  }

  function openPayDialog(target: PayDialogState) {
    const outstanding = remainingAmount(target.totalAmount, target.receivedAmount);
    setPayTarget(target);
    setPayAmount(outstanding > 0 ? String(outstanding) : "");
    setPayDate(todayStr());
    setPayMethod("現金");
    setPayNote("");
  }

  function flatItems(): StatementLineItem[] {
    if (!detailData) return [];
    const result: StatementLineItem[] = [];
    for (const order of detailData) {
      const items = order.items ?? [];
      if (items.length === 0) {
        result.push({
          orderId: order.id,
          orderNumber: order.orderNumber ?? null,
          orderDate: order.orderDate ?? null,
          productName: "（無品項明細）",
          brand: null,
          model: null,
          spec: null,
          unit: null,
          qty: 1,
          unitPrice: order.total ?? null,
          amount: order.total ?? null,
          notes: order.notes ?? null,
        });
      } else {
        for (const it of items) {
          const displayName = it.brand && it.productName && !it.productName.includes(it.brand)
            ? `${it.brand} ${it.productName}`
            : (it.productName ?? "");
          result.push({
            orderId: order.id,
            orderNumber: order.orderNumber ?? null,
            orderDate: order.orderDate ?? null,
            productName: displayName,
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
    const { subtotal, taxAmount, total, receivedAmount, receivableAmount } = computeStatementTotalsFromOrders(detailData);
    const docNo = `${detailCustomer.name}_${fromDate}`;
    const html = buildStatementHtml(
      detailCustomer.name,
      fromDate,
      toDate,
      flat,
      subtotal,
      0,
      taxAmount,
      total,
      receivedAmount,
      receivableAmount,
    );
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
    const { subtotal, taxAmount, total, receivedAmount, receivableAmount } = computeStatementTotalsFromOrders(detailData);
    const docNo = `${detailCustomer.name}_${fromDate}`;
    const html = buildStatementHtml(
      detailCustomer.name,
      fromDate,
      toDate,
      flat,
      subtotal,
      0,
      taxAmount,
      total,
      receivedAmount,
      receivableAmount,
    );
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
    <div className="space-y-4" data-release={WHOLESALE_SETTLEMENT_RELEASE_MARKER}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發月結 / 應收</h1>
          <p className="text-sm text-muted-foreground">依訂單日期（orderDate）統計已出貨訂單，點選公司查看月結明細與列印請款單</p>
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
          <p className="text-xs text-muted-foreground uppercase tracking-wide">本期總額</p>
          <p className="text-2xl font-bold mt-1">{fmtMoney(totalAll)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">已收金額</p>
          <p className="text-2xl font-bold mt-1 text-green-700">{fmtMoney(receivedAll)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">未收總額</p>
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
            const rowKey = `${s.customerId}_${s.customerName}`;
            return (
              <Card key={rowKey} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openDetail(s.customerId, s.customerName)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{s.customerName}</p>
                        <Badge variant="outline">{s.orderCount} 張出貨單</Badge>
                        <PaymentStatusBadge status={(s as { paymentStatus?: string }).paymentStatus ?? (outstanding <= 0 ? "已收清" : (s.receivedAmount ?? 0) > 0 ? "部分收款" : "未收款")} />
                      </div>
                      <div className="flex flex-wrap gap-4 mt-1 text-sm">
                        <span className="text-muted-foreground">本期總額 <span className="text-foreground font-medium">{fmtMoney(s.totalAmount)}</span></span>
                        <span className="text-muted-foreground">已收金額 <span className="text-green-600 font-medium">{fmtMoney(s.receivedAmount)}</span></span>
                        <span className="text-muted-foreground">未收金額 <span className="text-red-600 font-medium">{fmtMoney(outstanding)}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={outstanding <= 0 || s.customerId <= 0}
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
            <DialogTitle>{detailCustomer?.name} — 本期月結明細（{fmtDate(fromDate)} ～ {fmtDate(toDate)}）</DialogTitle>
          </DialogHeader>
          <Separator />
          {detailLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !detailData.length ? (
            <p className="text-muted-foreground text-center py-8">無出貨紀錄</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm bg-muted/40 p-3 rounded-lg">
                <span>出貨單數 <strong>{detailData.length} 張</strong></span>
                <span>本期總額 <strong>{fmtMoney(detailTotals.total)}</strong></span>
                <span>已收金額 <strong className="text-green-700">{fmtMoney(detailTotals.receivedAmount)}</strong></span>
                <span>未收金額 <strong className="text-red-600">{fmtMoney(detailTotals.receivableAmount)}</strong></span>
              </div>

              {detailData.map((order) => {
                const total = parseMoney(order.orderAmount ?? order.total);
                const sub = parseMoney(order.subtotalAmount ?? order.subtotal ?? total);
                const tax = parseMoney(order.taxAmountNum ?? order.taxAmount ?? 0);
                const ship = parseMoney(order.shippingFeeNum ?? order.shippingFee ?? 0);
                const received = parseMoney(order.receivedAmount);
                const outstanding = remainingAmount(total, received);
                const isCollapsed = !!collapsedOrderIds[order.id];
                const itemList = order.items ?? [];

                return (
                  <div key={order.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-sm bg-muted px-2 py-0.5 rounded">
                            {order.orderNumber ?? `出貨單 #${order.id}`}
                          </span>
                          <Badge className="bg-indigo-100 text-indigo-700">
                            {order.status || "已出貨"}
                          </Badge>
                          <PaymentStatusBadge status={order.paymentStatus} />
                          <span className="text-sm text-muted-foreground">
                            訂單日期：{fmtDate(order.orderDate)}
                          </span>
                          {order.expectedDelivery && (
                            <span className="text-sm text-muted-foreground">
                              預計交貨：{fmtDate(order.expectedDelivery)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span>該張出貨單合計：<strong>{fmtMoney(total)}</strong></span>
                          {(tax > 0 || ship > 0) && (
                            <span className="text-xs text-muted-foreground self-center">
                              （小計 {fmtMoney(sub)}{tax > 0 ? `＋稅 ${fmtMoney(tax)}` : ""}{ship > 0 ? `＋運費 ${fmtMoney(ship)}` : ""}）
                            </span>
                          )}
                          <span>已收款：<span className="text-green-700 font-medium">{fmtMoney(received)}</span></span>
                          <span>未收款：<span className="text-red-600 font-medium">{fmtMoney(outstanding)}</span></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => toggleOrderCollapse(order.id)}
                        >
                          {isCollapsed ? (
                            <><ChevronDown className="h-3.5 w-3.5" />展開明細（{itemList.length}）</>
                          ) : (
                            <><ChevronUp className="h-3.5 w-3.5" />收合明細（{itemList.length}）</>
                          )}
                        </Button>
                        <Link
                          href={`/wholesale/orders?search=${encodeURIComponent(order.orderNumber || "")}`}
                          onClick={() => setDetailOpen(false)}
                        >
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                            <ExternalLink className="h-3.5 w-3.5" />原始出貨單
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={outstanding <= 0 || !detailCustomer || (order.customerId ?? detailCustomer.id) <= 0}
                          onClick={() => detailCustomer && openPayDialog({
                            customerId: order.customerId || detailCustomer.id,
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
                    </div>

                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground text-xs">
                              <th className="py-2 pr-3">商品名稱</th>
                              <th className="py-2 pr-3">型號</th>
                              <th className="py-2 pr-3">規格</th>
                              <th className="py-2 pr-3 text-right">數量</th>
                              <th className="py-2 pr-3 text-right">單價</th>
                              <th className="py-2 text-right">金額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {itemList.map((it, idx) => {
                              const prodDisplay = it.brand && it.productName && !it.productName.includes(it.brand)
                                ? `${it.brand} ${it.productName}`
                                : (it.productName ?? "—");
                              return (
                                <tr key={idx} className="border-b">
                                  <td className="py-2 pr-3">{prodDisplay}</td>
                                  <td className="py-2 pr-3">{it.model || "—"}</td>
                                  <td className="py-2 pr-3">{it.spec || "—"}</td>
                                  <td className="py-2 pr-3 text-right">{it.qty ?? 0}{it.unit ? ` ${it.unit}` : ""}</td>
                                  <td className="py-2 pr-3 text-right">{fmtMoney(it.unitPrice)}</td>
                                  <td className="py-2 text-right">{fmtMoney(it.amount)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              <div>
                <h3 className="font-medium mb-2">本期出貨單收款紀錄</h3>
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
                          <th className="py-2 pr-3">建立人</th>
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
                            <td className="py-2 pr-3">{payment.createdByName ?? "—"}</td>
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
              <Label>本期應收</Label>
              <Input value={fmtMoney(payTarget?.totalAmount)} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>目前已收</Label>
              <Input value={fmtMoney(payTarget?.receivedAmount)} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>目前待收</Label>
              <Input value={fmtMoney(payOutstanding)} readOnly className="bg-muted" />
            </div>
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
