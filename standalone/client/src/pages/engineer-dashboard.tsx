import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useListWorkOrders } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";
import { EngineerWorkOrderCard } from "@/components/field-progress/EngineerWorkOrderCard";
import {
  listMyFieldProgress,
  taipeiToday,
  daysOverdue,
  addDaysTaipei,
  type FieldProgressRecord,
} from "@/lib/fieldProgressApi";

const COMPLETED = new Set(["已完成", "已結案"]);

export default function EngineerDashboard() {
  const { user } = useAuth();
  const today = taipeiToday();

  const {
    data: workOrders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    error: ordersErr,
  } = useListWorkOrders({});

  const {
    data: progressRows = [],
    isLoading: progressLoading,
    isError: progressError,
    error: progressErr,
  } = useQuery({
    queryKey: ["field-progress", "mine"],
    queryFn: listMyFieldProgress,
  });

  const progressMap = useMemo(() => {
    const map = new Map<number, FieldProgressRecord>();
    for (const r of progressRows) map.set(r.workOrderId, r);
    return map;
  }, [progressRows]);

  const { activeOrders, completedToday, unclosedToday } = useMemo(() => {
    const active: typeof workOrders = [];
    const doneToday: typeof workOrders = [];
    const unclosed: typeof workOrders = [];

    for (const wo of workOrders) {
      const prog = progressMap.get(wo.id);
      const fieldDone = prog?.fieldStatus === "completed" || !!prog?.completedAt;
      const woDone = COMPLETED.has(wo.status ?? "") || fieldDone;
      const sched = wo.scheduledDate ?? null;

      if (woDone) {
        const completedDate =
          prog?.completedAt?.slice(0, 10) ||
          (prog?.completedAt
            ? new Date(prog.completedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })
            : null) ||
          (wo as { completedDate?: string | null }).completedDate ||
          null;
        // Prefer Taipei date from completedAt ISO
        let doneDay = completedDate;
        if (prog?.completedAt) {
          doneDay = new Date(prog.completedAt).toLocaleDateString("en-CA", {
            timeZone: "Asia/Taipei",
          });
        }
        if (doneDay === today || sched === today) {
          doneToday.push(wo);
        }
        continue;
      }

      // Active: overdue unfinished OR scheduled today
      if (!sched) {
        active.push(wo);
        continue;
      }
      if (sched < today || sched === today) {
        active.push(wo);
        if (sched === today) unclosed.push(wo);
      }
    }

    active.sort((a, b) => {
      const oa = daysOverdue(a.scheduledDate, today);
      const ob = daysOverdue(b.scheduledDate, today);
      if (oa !== ob) return ob - oa; // overdue first
      const da = a.scheduledDate ?? "";
      const db = b.scheduledDate ?? "";
      if (da !== db) return da.localeCompare(db);
      return (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? "");
    });

    doneToday.sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));

    return { activeOrders: active, completedToday: doneToday, unclosedToday: unclosed };
  }, [workOrders, progressMap, today]);

  const isLoading = ordersLoading || progressLoading;
  const errorMsg =
    (ordersError &&
      (ordersErr instanceof Error ? ordersErr.message : "無法載入派工單")) ||
    (progressError &&
      (progressErr instanceof Error ? progressErr.message : "無法載入施工進度")) ||
    null;

  return (
    <div className="space-y-5 max-w-lg mx-auto md:max-w-2xl pb-10">
      <div>
        <h1 className="text-xl font-bold tracking-tight">今日施工</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user?.displayName} ·{" "}
          {new Date().toLocaleDateString("zh-TW", {
            timeZone: "Asia/Taipei",
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          含今日排定與昨日以前尚未完工的案件（Asia/Taipei）
        </p>
      </div>

      {errorMsg && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-6 text-center space-y-2">
            <AlertCircle className="h-7 w-7 text-destructive mx-auto" />
            <p className="font-medium text-destructive">載入失敗</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </CardContent>
        </Card>
      )}

      {!errorMsg && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              待執行（{isLoading ? "…" : activeOrders.length}）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : activeOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                今天沒有待執行的派工
              </p>
            ) : (
              activeOrders.map((wo) => (
                <EngineerWorkOrderCard
                  key={wo.id}
                  order={wo}
                  progress={progressMap.get(wo.id) ?? null}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {!errorMsg && !isLoading && unclosedToday.some((o) => {
        const prog = progressMap.get(o.id);
        return prog?.fieldStatus !== "completed" && !COMPLETED.has(o.status ?? "");
      }) && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          今日未關閉案件：
          {unclosedToday
            .filter((o) => {
              const prog = progressMap.get(o.id);
              return prog?.fieldStatus !== "completed" && !COMPLETED.has(o.status ?? "");
            })
            .map((o) => o.workOrderNumber || `#${o.id}`)
            .join("、")}
        </div>
      )}

      {!errorMsg && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              今日已完成（{isLoading ? "…" : completedToday.length}）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : completedToday.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">尚無今日完成案件</p>
            ) : (
              completedToday.map((wo) => (
                <EngineerWorkOrderCard
                  key={wo.id}
                  order={wo}
                  progress={progressMap.get(wo.id) ?? null}
                  readOnly
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground space-x-3">
        <Link href="/work-orders" className="underline hover:text-foreground">
          查看全部派工單
        </Link>
        <span>·</span>
        <span>含即將施工至 {addDaysTaipei(today, 30)}</span>
      </p>
    </div>
  );
}
