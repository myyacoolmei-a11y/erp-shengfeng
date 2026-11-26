import { useMemo, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { taipeiToday } from "@/lib/fieldProgressApi";
import { fetchSalesStats } from "@/lib/salesStatsApi";
import {
  formatCaseDate,
  formatSalesCount,
  formatSalesMoney,
  UNASSIGNED_SALES_KEY,
  UNASSIGNED_SALES_NAME,
  type SalesPersonStatRow,
} from "../../../shared/salesStats.ts";

type Preset = "today" | "week" | "month" | "custom";

export default function SalesStatsPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(taipeiToday());
  const [to, setTo] = useState(taipeiToday());
  const [salesUserId, setSalesUserId] = useState<string>("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    if (preset === "custom") {
      return { from, to, salesUserId: salesUserId === "all" ? undefined : salesUserId };
    }
    return {
      preset,
      salesUserId: salesUserId === "all" ? undefined : salesUserId,
    };
  }, [preset, from, to, salesUserId]);

  const { data, isLoading, refetch, isFetching, isError } = useQuery({
    queryKey: ["sales-stats", queryParams],
    queryFn: () => fetchSalesStats(queryParams),
    refetchInterval: 30000, refetchOnMount: "always", refetchOnWindowFocus: "always",
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const salesOptions = data?.salesOptions ?? [];
  const expanded: SalesPersonStatRow | undefined = rows.find((r) => r.salesKey === expandedKey);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">業務統計</h1>
        <p className="text-sm text-muted-foreground mt-1">業務案件與成交業績統計</p>
      </div>

      {isError && <p className="text-sm text-red-600">業務統計讀取失敗，請重新查詢。</p>}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {([
              ["today", "今天"],
              ["week", "本週"],
              ["month", "本月"],
              ["custom", "自訂日期"],
            ] as const).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => {
                  setPreset(key);
                  setExpandedKey(null);
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">起始日期</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">結束日期</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-xs">業務</Label>
              <Select
                value={salesUserId}
                onValueChange={(v) => {
                  setSalesUserId(v);
                  setExpandedKey(null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="全部業務" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部業務</SelectItem>
                  {salesOptions.map((u) => (
                    <SelectItem key={u.key ?? String(u.id)} value={u.key ?? String(u.id)}>{u.name}</SelectItem>
                  ))}
                  <SelectItem value={UNASSIGNED_SALES_KEY}>{UNASSIGNED_SALES_NAME}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="重新整理統計">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{isFetching ? "更新中…" : "重新整理"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {totals && !isError && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["業務案件", formatSalesCount(totals.caseCount)], ["成交業績", formatSalesMoney(totals.wonAmount)], ["已收款", formatSalesMoney(totals.receivedAmount)]].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>
        ))}
      </div>}
      <p className="text-xs text-muted-foreground">點選業務姓名可查看案件明細；篩選條件變更後自動更新。</p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">此條件下尚無業務案件</p>
          ) : (
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  {["業務", "案件數", "安裝", "保養", "維修", "其他", "成交業績", "已收款"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.salesKey}
                    className={`border-b hover:bg-muted/30 ${expandedKey === r.salesKey ? "bg-muted/20" : ""}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                        aria-expanded={expandedKey === r.salesKey}
                        onClick={() => setExpandedKey((cur) => (cur === r.salesKey ? null : r.salesKey))}
                      >
                        {r.salesName}<ChevronDown className={`h-3.5 w-3.5 ${expandedKey === r.salesKey ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(r.caseCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(r.installCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(r.maintenanceCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(r.repairCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(r.otherCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(r.wonAmount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(r.receivedAmount)}</td>
                  </tr>
                ))}
                {totals ? (
                  <tr className="border-b bg-muted/40 font-medium">
                    <td className="px-3 py-2 whitespace-nowrap">合計</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(totals.caseCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(totals.installCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(totals.maintenanceCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(totals.repairCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesCount(totals.otherCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(totals.wonAmount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(totals.receivedAmount)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {expanded ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">【{expanded.salesName}｜案件明細】</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  {["日期", "客戶", "類型", "案件內容", "成交金額", "已收款", "狀態"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expanded.cases.map((c) => (
                  <tr key={c.caseKey} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">{formatCaseDate(c.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.customerName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.category}</td>
                    <td className="px-3 py-2">{c.content}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(c.wonAmount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(c.receivedAmount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.status}</td>
                  </tr>
                ))}
                <tr className="border-b bg-muted/40 font-medium">
                  <td className="px-3 py-2" colSpan={4}>合計</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(expanded.wonAmount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatSalesMoney(expanded.receivedAmount)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
