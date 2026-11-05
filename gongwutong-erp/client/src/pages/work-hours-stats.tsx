import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useListUsers } from "@workspace/api-client-react";
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
import { fetchWorkHoursStats, formatTaipeiDateTime, taipeiToday } from "@/lib/fieldProgressApi";

type Preset = "today" | "week" | "month" | "custom";

export default function WorkHoursStatsPage() {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(taipeiToday());
  const [to, setTo] = useState(taipeiToday());
  const [engineerUserId, setEngineerUserId] = useState<string>("all");

  const queryParams = useMemo(() => {
    if (preset === "custom") return { from, to, engineerUserId: engineerUserId === "all" ? undefined : Number(engineerUserId) };
    return {
      preset,
      engineerUserId: engineerUserId === "all" ? undefined : Number(engineerUserId),
    };
  }, [preset, from, to, engineerUserId]);

  const { data: users = [] } = useListUsers({});
  const engineers = users.filter((u) => u.role === "engineer" || u.role === "technician");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["work-hours-stats", queryParams],
    queryFn: () => fetchWorkHoursStats(queryParams),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">工時統計</h1>
        <p className="text-sm text-muted-foreground mt-1">工程師施工進度與工時紀錄</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">篩選條件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                onClick={() => setPreset(key)}
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
              <Label className="text-xs">工程師</Label>
              <Select value={engineerUserId} onValueChange={setEngineerUserId}>
                <SelectTrigger><SelectValue placeholder="全部工程師" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部工程師</SelectItem>
                  {engineers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "查詢中…" : "查詢"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">此條件下尚無工時紀錄</p>
          ) : (
            <table className="w-full text-xs min-w-[960px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  {["日期", "派工單編號", "工程師", "客戶名稱", "前往時間", "到達時間", "完工時間", "路程時間", "施工時間", "總耗時", "異常原因"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={`/work-orders?expand=${r.workOrderId}`} className="text-primary hover:underline font-mono">
                        {r.workOrderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.engineerName}</td>
                    <td className="px-3 py-2">{r.customerName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTaipeiDateTime(r.departedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTaipeiDateTime(r.arrivedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTaipeiDateTime(r.completedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.completedAt ? r.travelDurationLabel : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.completedAt ? r.workDurationLabel : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.completedAt ? r.totalDurationLabel : "—"}</td>
                    <td className="px-3 py-2">{r.unableReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
