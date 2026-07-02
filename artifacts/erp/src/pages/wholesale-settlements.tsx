import { useState } from "react";
import {
  useListWholesaleSettlementSummary,
  useListWholesaleSettlementDetail,
  getListWholesaleSettlementSummaryQueryKey,
  getListWholesaleSettlementDetailQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, CreditCard, FileText, CalendarDays, Printer, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

function fmtMoney(n: number | string | null | undefined) {
  if (n == null) return "—";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(num)) return "—";
  return `NT$ ${Math.round(num).toLocaleString()}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return d;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function firstDayOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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
  const { user } = useAuth();

  const [fromDate, setFromDate] = useState(firstDayOfMonthStr());
  const [toDate, setToDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<{ id: number; name: string } | null>(null);

  const { data: summary, isLoading } = useListWholesaleSettlementSummary(
    { from: fromDate, to: toDate },
    { query: { enabled: !!fromDate && !!toDate, queryKey: getListWholesaleSettlementSummaryQueryKey({ from: fromDate, to: toDate }) } }
  );

  const { data: detailData, isLoading: detailLoading } = useListWholesaleSettlementDetail(
    detailCustomer?.id ?? 0,
    { from: fromDate, to: toDate },
    { query: { enabled: !!detailCustomer && !!fromDate && !!toDate, queryKey: getListWholesaleSettlementDetailQueryKey(detailCustomer?.id ?? 0, { from: fromDate, to: toDate }) } }
  );

  const list = summary?.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.customerName ?? "").toLowerCase().includes(q);
  }) ?? [];

  const totalAll = list.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0);
  const receivableAll = list.reduce((sum, s) => sum + (s.receivableAmount ?? 0), 0);

  function openDetail(customerId: number, customerName: string) {
    setDetailCustomer({ id: customerId, name: customerName });
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailCustomer(null);
  }

  function flatItems(): DetailItem[] {
    if (!detailData) return [];
    const result: DetailItem[] = [];
    for (const order of detailData) {
      const items = (order.items ?? []) as Array<{
        productName?: string;
        brand?: string | null;
        model?: string | null;
        spec?: string | null;
        unit?: string | null;
        qty?: number;
        unitPrice?: string | null;
        amount?: string | null;
      }>;
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

  function printInvoice() {
    if (!detailCustomer || !detailData) return;
    const flat = flatItems();
    const subtotal = flat.reduce((sum, it) => sum + parseFloat(it.amount ?? "0"), 0);
    const taxRate = detailData[0]?.taxRate ? parseFloat(detailData[0].taxRate) : 0;
    const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100;
    const total = subtotal + taxAmount;

    const body = buildInvoiceBody(detailCustomer.name, fromDate, toDate, flat, subtotal, taxRate, taxAmount, total);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
      <head>
        <title>請款單 — ${detailCustomer.name}</title>
        <style>
          @media print {
            body { margin: 0; padding: 20px; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>${body}<script>window.print();</script></body>
      </html>
    `);
    printWindow.document.close();
  }

  async function sendLinePDF() {
    if (!detailCustomer || !detailData) return;

    const message = "您好，附件為晟風工程本期批發材料請款單，請協助確認，如有問題請與我們聯繫，謝謝。";
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(message)}`;

    try {
      const flat = flatItems();
      const subtotal = flat.reduce((sum, it) => sum + parseFloat(it.amount ?? "0"), 0);
      const taxRate = detailData[0]?.taxRate ? parseFloat(detailData[0].taxRate) : 0;
      const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100;
      const total = subtotal + taxAmount;

      const body = buildInvoiceBody(detailCustomer.name, fromDate, toDate, flat, subtotal, taxRate, taxAmount, total);

      const div = document.createElement("div");
      div.innerHTML = body;
      div.style.position = "absolute";
      div.style.left = "-9999px";
      div.style.width = "720px";
      document.body.appendChild(div);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const html2pdf = await import("html2pdf.js").then((m: any) => m.default || m);

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `請款單_${detailCustomer.name}_${fromDate}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      await html2pdf().set(opt).from(div).save();
      document.body.removeChild(div);
    } catch (err) {
      console.error("PDF generation failed:", err);
    }

    // Always open LINE text share (whether PDF succeeded or not)
    window.open(lineUrl, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發月結 / 應收</h1>
          <p className="text-sm text-muted-foreground">依日期區間統計已出貨訂單</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">客戶數</p>
          <p className="text-2xl font-bold mt-1">{list.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">訂單總金額</p>
          <p className="text-2xl font-bold mt-1">{fmtMoney(totalAll)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">待收總額</p>
          <p className="text-2xl font-bold mt-1">{fmtMoney(receivableAll)}</p>
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
          {list.map((s) => (
            <Card key={s.customerId} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openDetail(s.customerId, s.customerName)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{s.customerName}</p>
                      <Badge variant="outline">{s.orderCount} 筆</Badge>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm">
                      <span className="text-muted-foreground">訂單總額：<span className="text-foreground font-medium">{fmtMoney(s.totalAmount)}</span></span>
                      <span className="text-muted-foreground">待收：<span className="text-red-600 font-medium">{fmtMoney(s.receivableAmount)}</span></span>
                      <span className="text-muted-foreground">已收：<span className="text-green-600 font-medium">{fmtMoney(s.receivedAmount)}</span></span>
                    </div>
                  </div>
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
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
          ) : !detailData || detailData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">無出貨紀錄</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs">
                    <th className="py-2 pr-3">出貨日</th>
                    <th className="py-2 pr-3">出貨單號</th>
                    <th className="py-2 pr-3">商品</th>
                    <th className="py-2 pr-3">型號</th>
                    <th className="py-2 pr-3">規格</th>
                    <th className="py-2 pr-3 text-right">數量</th>
                    <th className="py-2 pr-3 text-right">單價</th>
                    <th className="py-2 pr-3 text-right">金額</th>
                    <th className="py-2 text-left">備註</th>
                  </tr>
                </thead>
                <tbody>
                  {flatItems().map((it, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-3">{fmtDate(it.orderDate)}</td>
                      <td className="py-2 pr-3">{it.orderNumber ?? "—"}</td>
                      <td className="py-2 pr-3">{it.productName}</td>
                      <td className="py-2 pr-3">{it.model ?? "—"}</td>
                      <td className="py-2 pr-3">{it.spec ?? "—"}</td>
                      <td className="py-2 pr-3 text-right">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(it.unitPrice)}</td>
                      <td className="py-2 text-right">{fmtMoney(it.amount)}</td>
                      <td className="py-2 text-left">{it.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    </div>
  );
}
