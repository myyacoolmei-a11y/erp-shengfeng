import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, CreditCard, FileText, CalendarDays, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

function fmtMoney(n: number | string | null | undefined) {
  if (n == null) return "—";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(num)) return "—";
  return `NT$ ${Math.round(num).toLocaleString()}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function firstDayOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function WholesaleSettlements() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

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

  function printInvoice() {
    if (!detailCustomer || !detailData) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const detailTotal = detailData.reduce((sum, o) => sum + parseFloat(o.total ?? "0"), 0);
    const rows = detailData.map((o) => `
      <tr>
        <td style="border:1px solid #000;padding:6px">${o.orderNumber ?? "—"}</td>
        <td style="border:1px solid #000;padding:6px">${o.orderDate ?? "—"}</td>
        <td style="border:1px solid #000;padding:6px;text-align:right">${fmtMoney(o.total)}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
      <head><title>請款單 — ${detailCustomer.name}</title></head>
      <body style="font-family:'Microsoft JhengHei',sans-serif;padding:40px;max-width:800px;margin:0 auto">
        <div style="text-align:center;margin-bottom:30px">
          <h1 style="font-size:22px;margin-bottom:4px">農風工程 有限公司</h1>
          <p style="font-size:12px;color:#666">批發請款單</p>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:20px">
          <div>
            <p style="font-size:13px"><strong>客戶：</strong>${detailCustomer.name}</p>
            <p style="font-size:13px"><strong>日期區間：</strong>${fromDate} 至 ${toDate}</p>
          </div>
          <div style="text-align:right">
            <p style="font-size:13px"><strong>銀行帳號：</strong></p>
            <p style="font-size:13px">螢合銀行 822-1234567890123</p>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="border:1px solid #000;padding:6px;text-align:left">訂單編號</th>
              <th style="border:1px solid #000;padding:6px;text-align:left">日期</th>
              <th style="border:1px solid #000;padding:6px;text-align:right">金額</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="font-weight:bold">
              <td style="border:1px solid #000;padding:6px" colspan="2">合計</td>
              <td style="border:1px solid #000;padding:6px;text-align:right">${fmtMoney(detailTotal)}</td>
            </tr>
          </tbody>
        </table>
        <p style="font-size:12px;color:#666;margin-top:30px">
          請於收到本單後 7 個工作日內完成轉帳。如有問題請聯絡 02-1234-5678。
        </p>
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
          <h1 className="text-2xl font-bold">批發月結 / 應收</h1>
          <p className="text-sm text-muted-foreground">依日期區間統計客戶訂單金額</p>
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
          <p className="text-muted-foreground">該日期區間無批發訂單紀錄</p>
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
                      <Badge variant="outline">{s.orderCount} 筆訂單</Badge>
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailCustomer?.name} — 訂單明細</DialogTitle>
          </DialogHeader>
          <Separator />
          {detailLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !detailData || detailData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">無訂單紀錄</p>
          ) : (
            <div className="space-y-2">
              {detailData.map((o: any) => (
                <Card key={o.id}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{o.orderNumber ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{o.orderDate ?? "—"} · {o.status}</p>
                    </div>
                    <p className="font-semibold text-sm shrink-0">{fmtMoney(o.total)}</p>
                  </CardContent>
                </Card>
              ))}
              <div className="flex justify-between items-center pt-2 px-1">
                <p className="font-bold">合計</p>
                <p className="font-bold">{fmtMoney(detailData.reduce((sum, o) => sum + parseFloat(o.total ?? "0"), 0))}</p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={closeDetail}>關閉</Button>
            <Button size="sm" onClick={printInvoice}><Printer className="h-4 w-4 mr-1" />列印請款單</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
