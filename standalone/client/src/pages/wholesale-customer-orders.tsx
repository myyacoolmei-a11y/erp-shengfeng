import { useMemo, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetWholesaleOrder, useListWholesaleCustomers, getGetWholesaleOrderQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CreditCard, FileText, MessageCircle, Printer, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { currentMonth, formatTwd } from "../../../shared/wholesaleAccount.ts";
import {
  fetchCustomerOrders,
  fetchCustomerStatement,
  fmtDateSlash,
  type CustomerMonthOrder,
} from "@/lib/wholesaleAccountApi";
import { MonthSwitcher } from "@/components/wholesale/MonthSwitcher";
import { RegisterPaymentDialog } from "@/components/wholesale/RegisterPaymentDialog";
import { printWholesaleDelivery, printWholesaleStatement, shareWholesaleDelivery } from "@/lib/wholesalePrint";

function payBadge(status: CustomerMonthOrder["payStatus"]) {
  if (status === "已結清") return <Badge className="bg-green-100 text-green-800">已收</Badge>;
  if (status === "部分收款") return <Badge className="bg-amber-100 text-amber-800">部分收款</Badge>;
  return <Badge className="bg-red-100 text-red-700">未收</Badge>;
}

function companyBadge(status: string | undefined) {
  if (status === "已結清") return <Badge className="bg-green-100 text-green-800">已結清</Badge>;
  if (status === "部分收款") return <Badge className="bg-amber-100 text-amber-800">部分收款</Badge>;
  return <Badge variant="outline">未結帳</Badge>;
}

export default function WholesaleCustomerOrders() {
  const [, params] = useRoute("/wholesale/customers/:customerId/orders");
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const monthFromUrl = new URLSearchParams(search).get("month");
  const [month, setMonth] = useState(monthFromUrl && /^\d{4}-\d{2}$/.test(monthFromUrl) ? monthFromUrl : currentMonth());
  const rawId = params?.customerId ?? "unbound";
  const customerId = rawId === "unbound" ? "unbound" as const : Number(rawId);
  const numericId = customerId === "unbound" ? null : customerId;

  const [payOpen, setPayOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/wholesale/customers", customerId, "orders", month],
    queryFn: () => fetchCustomerOrders(customerId, month),
  });

  const { data: customers } = useListWholesaleCustomers({});
  const { data: viewOrder, isLoading: viewLoading } = useGetWholesaleOrder(viewId ?? 0, {
    query: { enabled: !!viewId, queryKey: getGetWholesaleOrderQueryKey(viewId ?? 0) },
  });

  const summary = data?.summary;
  const customer = data?.customer as any;
  const orders = data?.orders ?? [];
  const companyName = customer?.company_name || customer?.companyName || summary?.customerName || "未綁定批發客戶";

  function setMonthAndUrl(next: string) {
    setMonth(next);
    navigate(`/wholesale/customers/${rawId}/orders?month=${encodeURIComponent(next)}`, { replace: true });
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["/api/wholesale/customers"] });
    qc.invalidateQueries({ queryKey: ["wholesale-unpaid-orders"] });
  }

  async function handleStatement(action: "print" | "download" | "share") {
    if (numericId == null) {
      toast({ title: "未綁定客戶無法產生對帳單", variant: "destructive" });
      return;
    }
    try {
      const stmt = await fetchCustomerStatement(numericId, month);
      await printWholesaleStatement(stmt, setPdfPreview, toast as any, action);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "無法產生對帳單", variant: "destructive" });
    }
  }

  const headerBits = useMemo(() => {
    if (!customer) {
      return {
        taxId: "—",
        contact: "—",
        phone: "—",
        address: "—",
        terms: summary?.paymentTerms || "—",
        sales: summary?.salesUser || "—",
      };
    }
    return {
      taxId: customer.tax_id || customer.taxId || "—",
      contact: customer.contact_person || customer.contactPerson || "—",
      phone: customer.mobile || customer.telephone || "—",
      address: customer.address || "—",
      terms: customer.payment_terms || customer.paymentTerms || "—",
      sales: customer.sales_user_name || summary?.salesUser || "—",
    };
  }, [customer, summary]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-2" onClick={() => navigate(`/wholesale/orders`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回批發訂單
          </Button>
          <h1 className="text-2xl font-bold">{companyName}</h1>
          <p className="text-sm text-muted-foreground">批發客戶明細</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MonthSwitcher month={month} onChange={setMonthAndUrl} />
          {numericId != null && (
            <>
              <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
                <CreditCard className="h-4 w-4 mr-1" />登記收款
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatement("print")}>
                <Printer className="h-4 w-4 mr-1" />產生本月對帳單
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatement("download")}>
                <FileText className="h-4 w-4 mr-1" />下載 PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatement("share")}>
                <MessageCircle className="h-4 w-4 mr-1" />LINE 對帳單
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-1 text-sm sm:grid-cols-2">
          <div>客戶公司：<strong>{companyName}</strong> {summary ? companyBadge(summary.status) : null}</div>
          <div>統編：{headerBits.taxId}</div>
          <div>聯絡人：{headerBits.contact}</div>
          <div>電話：{headerBits.phone}</div>
          <div className="sm:col-span-2">預設送貨地址：{headerBits.address}</div>
          <div>付款條件：{headerBits.terms}</div>
          <div>負責業務：{headerBits.sales}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          ["本月出貨筆數", summary ? `${summary.orderCount} 筆` : "—"],
          ["本月出貨金額", formatTwd(summary?.monthlySales ?? 0)],
          ["本月已收", formatTwd(summary?.monthlyPaid ?? 0)],
          ["本月待收", formatTwd(summary?.monthlyOutstanding ?? 0)],
          ["前期未收", formatTwd(summary?.previousOutstanding ?? 0)],
          ["累計應收", formatTwd(summary?.totalOutstanding ?? 0)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold mt-1 tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-base font-semibold mb-2">本月出貨紀錄</h2>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : error ? (
          <p className="text-sm text-destructive">載入失敗：{(error as Error).message}</p>
        ) : orders.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">本月沒有出貨單</CardContent></Card>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-3 font-medium">日期</th>
                  <th className="p-3 font-medium">出貨單號</th>
                  <th className="p-3 font-medium">品項摘要</th>
                  <th className="p-3 font-medium text-right">數量</th>
                  <th className="p-3 font-medium text-right">出貨金額</th>
                  <th className="p-3 font-medium text-right">收款金額</th>
                  <th className="p-3 font-medium text-right">未收金額</th>
                  <th className="p-3 font-medium">收款狀態</th>
                  <th className="p-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderId} className="border-b last:border-0">
                    <td className="p-3 whitespace-nowrap">{fmtDateSlash(o.orderDate)}</td>
                    <td className="p-3 font-mono text-xs">{o.orderNumber ?? `#${o.orderId}`}</td>
                    <td className="p-3 max-w-[16rem] truncate" title={o.itemSummary}>{o.itemSummary}</td>
                    <td className="p-3 text-right tabular-nums">{o.qty}</td>
                    <td className="p-3 text-right tabular-nums">{formatTwd(o.orderTotal)}</td>
                    <td className="p-3 text-right tabular-nums">{formatTwd(o.paidAmount)}</td>
                    <td className="p-3 text-right tabular-nums">{formatTwd(o.remainingAmount)}</td>
                    <td className="p-3">{payBadge(o.payStatus)}</td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => setViewId(o.orderId)}>查看</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RegisterPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        customerId={numericId}
        customerName={companyName}
        onSaved={invalidate}
      />

      <Dialog open={viewId != null} onOpenChange={(open) => !open && setViewId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>出貨單 {viewOrder?.orderNumber ?? (viewId ? `#${viewId}` : "")}</DialogTitle>
          </DialogHeader>
          {viewLoading || !viewOrder ? (
            <p className="text-sm text-muted-foreground py-6">載入中…</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>客戶：{(viewOrder as any).customerName || companyName}</div>
              <div>日期：{fmtDateSlash((viewOrder as any).orderDate)}</div>
              <div>業務：{(viewOrder as any).salesperson || "—"}</div>
              <div>狀態：{(viewOrder as any).status}</div>
              <div>送貨地址：{(viewOrder as any).deliveryAddress || customer?.address || "—"}</div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="p-2">商品</th>
                      <th className="p-2 text-right">數量</th>
                      <th className="p-2 text-right">單價</th>
                      <th className="p-2 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((viewOrder as any).items ?? []).map((it: any, idx: number) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="p-2">{it.productName}</td>
                        <td className="p-2 text-right">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td>
                        <td className="p-2 text-right">{formatTwd(it.unitPrice)}</td>
                        <td className="p-2 text-right">{formatTwd(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-right font-semibold">合計 {formatTwd((viewOrder as any).total)}</div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewId(null)}>關閉</Button>
            {viewOrder && (
              <>
                <Button variant="secondary" onClick={() => printWholesaleDelivery(viewOrder, setPdfPreview, toast, customers)}>
                  <Printer className="h-4 w-4 mr-1" />列印
                </Button>
                <Button variant="secondary" onClick={() => shareWholesaleDelivery(viewOrder, setPdfPreview, toast, customers)}>
                  <Share2 className="h-4 w-4 mr-1" />LINE
                </Button>
              </>
            )}
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
