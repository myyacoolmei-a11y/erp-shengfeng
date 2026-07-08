import { useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { useListReceivables } from "@workspace/api-client-react";
import { X, TrendingUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Receivable } from "@workspace/api-client-react";

function collectedRows(receivables: Receivable[] | undefined): Receivable[] {
  return (receivables ?? [])
    .filter(r => Number(r.receivedAmount ?? 0) > 0)
    .sort((a, b) => {
      const da = a.actualPaymentDate ?? "";
      const db = b.actualPaymentDate ?? "";
      return db.localeCompare(da);
    });
}

function groupByMonth(rows: Receivable[]) {
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (!r.actualPaymentDate) continue;
    const month = r.actualPaymentDate.slice(0, 7);
    map[month] = (map[month] ?? 0) + Number(r.receivedAmount ?? 0);
  }
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
}

export default function Payments() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const { data: receivables, isLoading } = useListReceivables(
    filterCustomerId ? { customerId: filterCustomerId } : {},
  );

  const rows = useMemo(() => collectedRows(receivables), [receivables]);
  const total = rows.reduce((s, r) => s + Number(r.receivedAmount ?? 0), 0);
  const monthlyData = groupByMonth(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">收款紀錄</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            資料來源：應收帳款已收金額 · 總收款：
            <span className="font-semibold text-green-700"> NT${total.toLocaleString("zh-TW")}</span>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/receivables")}>
          <ExternalLink className="h-4 w-4 mr-1" />前往應收帳款記錄收款
        </Button>
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/payments")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      {monthlyData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">月收款統計（依實際收款日）</span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {monthlyData.map(([month, amount]) => (
                <div key={month} className="text-center">
                  <p className="text-xs text-muted-foreground">{month.slice(5)}月</p>
                  <p className="text-sm font-semibold text-green-700">NT${amount.toLocaleString("zh-TW")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {rows.map(r => (
              <div
                key={r.id}
                className="px-4 py-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/40"
                onClick={() => navigate("/receivables")}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-green-700">
                      NT${Number(r.receivedAmount).toLocaleString("zh-TW")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      / 應收 NT${Number(r.totalAmount).toLocaleString("zh-TW")}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      r.paymentStatus === "已收款" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>{r.paymentStatus}</span>
                    {r.paymentMethod && (
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.paymentMethod}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                    <span className="font-medium text-foreground">{r.customerName ?? "—"}</span>
                    {r.projectName && <span>{r.projectName}</span>}
                    {r.actualPaymentDate
                      ? <span>收款日 {r.actualPaymentDate}</span>
                      : <span className="text-amber-600">部分收款（尚未全額收清）</span>}
                    {r.workOrderNumber && <span className="text-purple-600">{r.workOrderNumber}</span>}
                    {r.notes && <span className="truncate max-w-xs">{r.notes}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-muted-foreground">尚無收款紀錄</p>
            <p className="text-xs text-muted-foreground">請至應收帳款頁面「記錄收款」</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate("/receivables")}>
              前往應收帳款
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
