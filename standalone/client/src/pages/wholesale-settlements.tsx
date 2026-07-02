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
import { Search, CreditCard, FileText, CalendarDays, Printer } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

function fmtMoney(n: number | string | null | undefined) {
  if (n == null) return "\u2014";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(num)) return "\u2014";
  return `NT$ ${Math.round(num).toLocaleString()}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
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
  unit: string | null;
  qty: number;
  unitPrice: string | null;
  amount: string | null;
  notes: string | null;
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
      const items = order.items ?? [];
      if (items.length === 0) {
        result.push({
          orderId: order.id,
          orderNumber: order.orderNumber ?? null,
          orderDate: order.orderDate ?? null,
          productName: "\u2014",
          brand: null,
          model: null,
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
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const flat = flatItems();
    const subtotal = flat.reduce((sum, it) => sum + parseFloat(it.amount ?? "0"), 0);
    const taxRate = detailData[0]?.taxRate ? parseFloat(detailData[0].taxRate) : 0;
    const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100;
    const total = subtotal + taxAmount;

    const rows = flat.map((it) => `
      <tr>
        <td style="border:1px solid #000;padding:5px;font-size:12px">${fmtDate(it.orderDate)}</td>
        <td style="border:1px solid #000;padding:5px;font-size:12px">${it.orderNumber ?? "\u2014"}</td>
        <td style="border:1px solid #000;padding:5px;font-size:12px">${it.productName}</td>
        <td style="border:1px solid #000;padding:5px;font-size:12px">${it.model ?? ""}</td>
        <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:center">${it.qty}${it.unit ? " " + it.unit : ""}</td>
        <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoney(it.unitPrice)}</td>
        <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoney(it.amount)}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
      <head>
        <title>\u8acb\u6b3e\u55ae \u2014 ${detailCustomer.name}</title>
        <style>
          @media print {
            body { margin: 0; padding: 20px; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body style="font-family:'Microsoft JhengHei','Heiti TC',sans-serif;padding:20px;max-width:720px;margin:0 auto;color:#000">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="font-size:20px;margin-bottom:4px;letter-spacing:2px">\u6643\u98a8\u5de5\u7a0b\u6709\u9650\u516c\u53f8</h1>
          <p style="font-size:11px;color:#333;margin:0">\u51b7\u6c23\u5de5\u7a0b / \u6279\u767c\u8acb\u6b3e\u55ae</p>
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px">
          <div>
            <p style="margin:2px 0"><strong>\u5ba2\u6236\uff1a</strong>${detailCustomer.name}</p>
            <p style="margin:2px 0"><strong>\u65e5\u671f\u5340\u9593\uff1a</strong>${fromDate} \u2014 ${toDate}</p>
          </div>
          <div style="text-align:right">
            <p style="margin:2px 0"><strong>\u532f\u6b3e\u8cc7\u8a0a</strong></p>
            <p style="margin:2px 0">\u570b\u6cf0\u4e16\u83ef\u9280\u884c</p>
            <p style="margin:2px 0">\u4ee3\u865f 013 / \u5e33\u865f 047035012164</p>
            <p style="margin:2px 0">\u6236\u540d\uff1a\u6643\u98a8\u5de5\u7a0b\u884c \u6d2a\u5b87\u98a8</p>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <thead>
            <tr style="background:#f0f0f0">
              <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:80px">\u51fa\u8ca8\u65e5</th>
              <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:90px">\u51fa\u8ca8\u55ae\u865f</th>
              <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left">\u5546\u54c1</th>
              <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:left;width:90px">\u578b\u865f</th>
              <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:center;width:50px">\u6578\u91cf</th>
              <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:right;width:80px">\u55ae\u50f9</th>
              <th style="border:1px solid #000;padding:5px;font-size:12px;text-align:right;width:80px">\u91d1\u984d</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
          <div style="width:220px;font-size:12px">
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #ddd">
              <span>\u5c0f\u8a08</span><span>${fmtMoney(subtotal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #ddd">
              <span>\u7a05\u984d (${taxRate}%)</span><span>${fmtMoney(taxAmount)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;font-size:14px">
              <span>\u7e3d\u91d1\u984d</span><span>${fmtMoney(total)}</span>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px">
          <div>
            <p style="margin-bottom:4px"><strong>\u5ba2\u6236\u7c3d\u6536</strong></p>
            <div style="border-bottom:1px solid #000;width:160px;height:24px"></div>
          </div>
          <div style="text-align:right">
            <p>\u8acb\u6b3e\u55ae\u65e5\u671f\uff1a${todayStr()}</p>
          </div>
        </div>

        <script>window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">\u6279\u767c\u6708\u7d50 / \u61c9\u6536</h1>
          <p className="text-sm text-muted-foreground">\u4f9d\u65e5\u671f\u5340\u9593\u7d71\u8a08\u5df2\u51fa\u8ca8\u8a02\u55ae</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex gap-2 items-center">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">\u8d77\u59cb\u65e5</Label>
                <Input type="date" className="h-9 w-40" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground">\u2014</span>
              <div>
                <Label className="text-xs text-muted-foreground">\u622a\u6b62\u65e5</Label>
                <Input type="date" className="h-9 w-40" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>
            <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="\u641c\u5c0b\u5ba2\u6236\u540d\u7a31\u2026" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">\u5ba2\u6236\u6578</p>
          <p className="text-2xl font-bold mt-1">{list.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">\u8a02\u55ae\u7e3d\u91d1\u984d</p>
          <p className="text-2xl font-bold mt-1">{fmtMoney(totalAll)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">\u5f85\u6536\u7e3d\u984d</p>
          <p className="text-2xl font-bold mt-1">{fmtMoney(receivableAll)}</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-14 text-center">
          <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">\u8a72\u65e5\u671f\u5340\u9593\u7121\u5df2\u51fa\u8ca8\u7d00\u9304</p>
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
                      <Badge variant="outline">{s.orderCount} \u7b46</Badge>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm">
                      <span className="text-muted-foreground">\u8a02\u55ae\u7e3d\u984d\uff1a<span className="text-foreground font-medium">{fmtMoney(s.totalAmount)}</span></span>
                      <span className="text-muted-foreground">\u5f85\u6536\uff1a<span className="text-red-600 font-medium">{fmtMoney(s.receivableAmount)}</span></span>
                      <span className="text-muted-foreground">\u5df2\u6536\uff1a<span className="text-green-600 font-medium">{fmtMoney(s.receivedAmount)}</span></span>
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
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailCustomer?.name} \u2014 \u51fa\u8ca8\u660e\u7d30</DialogTitle>
          </DialogHeader>
          <Separator />
          {detailLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !detailData || detailData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">\u7121\u51fa\u8ca8\u7d00\u9304</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs">
                    <th className="py-2 pr-3">\u51fa\u8ca8\u65e5</th>
                    <th className="py-2 pr-3">\u51fa\u8ca8\u55ae\u865f</th>
                    <th className="py-2 pr-3">\u5546\u54c1</th>
                    <th className="py-2 pr-3">\u578b\u865f</th>
                    <th className="py-2 pr-3 text-right">\u6578\u91cf</th>
                    <th className="py-2 pr-3 text-right">\u55ae\u50f9</th>
                    <th className="py-2 text-right">\u91d1\u984d</th>
                  </tr>
                </thead>
                <tbody>
                  {flatItems().map((it, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-3">{fmtDate(it.orderDate)}</td>
                      <td className="py-2 pr-3">{it.orderNumber ?? "\u2014"}</td>
                      <td className="py-2 pr-3">{it.productName}</td>
                      <td className="py-2 pr-3">{it.model ?? "\u2014"}</td>
                      <td className="py-2 pr-3 text-right">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(it.unitPrice)}</td>
                      <td className="py-2 text-right">{fmtMoney(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={closeDetail}>\u95dc\u9589</Button>
            <Button size="sm" onClick={printInvoice}><Printer className="h-4 w-4 mr-1" />\u5217\u5370\u8acb\u6b3e\u55ae</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
