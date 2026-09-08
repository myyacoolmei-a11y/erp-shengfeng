import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, CreditCard, Printer, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PdfPreviewDialog } from "@/components/pdf/pdf-preview-dialog";
import { currentMonth, formatTwd } from "../../../shared/wholesaleAccount.ts";
import {
  fetchCustomerStatement,
  fetchCustomerSummary,
  type CustomerSummary,
} from "@/lib/wholesaleAccountApi";
import { MonthSwitcher } from "@/components/wholesale/MonthSwitcher";
import { RegisterPaymentDialog } from "@/components/wholesale/RegisterPaymentDialog";
import { printWholesaleStatement } from "@/lib/wholesalePrint";

function statusBadge(status: CustomerSummary["status"]) {
  if (status === "已結清") return <Badge className="bg-green-100 text-green-800">已結清</Badge>;
  if (status === "部分收款") return <Badge className="bg-amber-100 text-amber-800">部分收款</Badge>;
  return <Badge variant="outline">未結帳</Badge>;
}

export default function WholesaleSettlements() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState<{ id: number; name: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/wholesale/customers/summary", month, search, "settlements"],
    queryFn: () => fetchCustomerSummary({ month, search }),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["/api/wholesale/customers/summary"] });
    qc.invalidateQueries({ queryKey: ["wholesale-unpaid-orders"] });
  }

  async function handleStatement(row: CustomerSummary, action: "print" | "download" | "share") {
    if (row.customerId == null) {
      toast({ title: "未綁定客戶無法產生對帳單", variant: "destructive" });
      return;
    }
    try {
      const stmt = await fetchCustomerStatement(row.customerId, month);
      await printWholesaleStatement(stmt, setPdfPreview, toast as any, action);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "無法產生對帳單", variant: "destructive" });
    }
  }

  const totalOutstanding = rows.reduce((s, r) => s + r.totalOutstanding, 0);
  const monthlySales = rows.reduce((s, r) => s + r.monthlySales, 0);
  const monthlyPaid = rows.reduce((s, r) => s + r.monthlyPaid, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">月結／應收</h1>
          <p className="text-sm text-muted-foreground">以客戶公司彙總本月出貨、收款與累計應收</p>
        </div>
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8 h-9" placeholder="搜尋客戶公司名稱" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">客戶數</p><p className="text-2xl font-bold mt-1">{rows.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">本月出貨</p><p className="text-2xl font-bold mt-1">{formatTwd(monthlySales)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">本月已收</p><p className="text-2xl font-bold mt-1 text-green-700">{formatTwd(monthlyPaid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">累計應收</p><p className="text-2xl font-bold mt-1 text-red-600">{formatTwd(totalOutstanding)}</p></CardContent></Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-muted-foreground">本月沒有應收或出貨紀錄</CardContent></Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">客戶公司</th>
                <th className="p-3 font-medium text-right">本月出貨</th>
                <th className="p-3 font-medium text-right">本月金額</th>
                <th className="p-3 font-medium text-right">前期未收</th>
                <th className="p-3 font-medium text-right">本月已收</th>
                <th className="p-3 font-medium text-right">累計應收</th>
                <th className="p-3 font-medium">付款條件</th>
                <th className="p-3 font-medium">到期日</th>
                <th className="p-3 font-medium">狀態</th>
                <th className="p-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = row.unbound || row.customerId == null ? "unbound" : row.customerId;
                return (
                  <tr key={String(id) + row.customerName} className="border-b last:border-0">
                    <td className="p-3 font-medium">
                      {row.customerName}
                      {row.unbound ? <span className="ml-2 text-xs font-normal text-amber-700">未綁定</span> : null}
                    </td>
                    <td className="p-3 text-right tabular-nums">{row.orderCount} 筆</td>
                    <td className="p-3 text-right tabular-nums">{formatTwd(row.monthlySales)}</td>
                    <td className="p-3 text-right tabular-nums">{formatTwd(row.previousOutstanding)}</td>
                    <td className="p-3 text-right tabular-nums">{formatTwd(row.monthlyPaid)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{formatTwd(row.totalOutstanding)}</td>
                    <td className="p-3">{row.paymentTerms || "—"}</td>
                    <td className="p-3 whitespace-nowrap">{row.dueDate ? String(row.dueDate).replace(/-/g, "/") : "—"}</td>
                    <td className="p-3">{statusBadge(row.status)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/wholesale/customers/${id}/orders?month=${encodeURIComponent(month)}`)}>
                          查看明細
                        </Button>
                        <Button
                          size="sm"
                          disabled={row.customerId == null || row.totalOutstanding <= 0}
                          onClick={() => row.customerId != null && setPayTarget({ id: row.customerId, name: row.customerName })}
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1" />登記收款
                        </Button>
                        <Button size="sm" variant="ghost" disabled={row.customerId == null} onClick={() => handleStatement(row, "print")}>
                          <Printer className="h-3.5 w-3.5 mr-1" />列印對帳單
                        </Button>
                        <Button size="sm" variant="ghost" disabled={row.customerId == null} onClick={() => handleStatement(row, "share")}>
                          <MessageCircle className="h-3.5 w-3.5 mr-1" />LINE 對帳單
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RegisterPaymentDialog
        open={!!payTarget}
        onOpenChange={(open) => !open && setPayTarget(null)}
        customerId={payTarget?.id ?? null}
        customerName={payTarget?.name ?? ""}
        onSaved={invalidate}
      />

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
