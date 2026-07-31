import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useListWorkOrders } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";
import { EngineerWorkOrderCard } from "@/components/field-progress/EngineerWorkOrderCard";
import {
  listMyFieldProgress,
  taipeiToday,
  daysOverdue,
  type FieldProgressRecord,
} from "@/lib/fieldProgressApi";

const COMPLETED = new Set(["已完成", "已結案"]);

export default function EngineerDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const today = taipeiToday();

  const {
    data: workOrders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    error: ordersErr,
    refetch: refetchOrders,
  } = useListWorkOrders({});

  const {
    data: progressRows = [],
    isLoading: progressLoading,
    isError: progressError,
    error: progressErr,
    refetch: refetchProgress,
  } = useQuery({
    queryKey: ["field-progress", "mine"],
    queryFn: listMyFieldProgress,
    enabled: !!user,
  });

  const progressMap = useMemo(() => {
    const map = new Map<number, FieldProgressRecord>();
    for (const r of progressRows) map.set(r.workOrderId, r);
    return map;
  }, [progressRows]);

  const { activeOrders, completedToday, counts } = useMemo(() => {
    const active: typeof workOrders = [];
    const doneToday: typeof workOrders = [];
    let pendingDepart = 0;
    let inProgress = 0;
    let doneCount = 0;

    for (const wo of workOrders) {
      const prog = progressMap.get(wo.id);
      const fieldDone = prog?.fieldStatus === "completed" || !!prog?.completedAt;
      const woDone = COMPLETED.has(wo.status ?? "") || fieldDone;
      const sched = wo.scheduledDate ?? null;
      const status = prog?.fieldStatus ?? "pending";

      if (woDone) {
        let doneDay: string | null = null;
        if (prog?.completedAt) {
          doneDay = new Date(prog.completedAt).toLocaleDateString("en-CA", {
            timeZone: "Asia/Taipei",
          });
        }
        if (doneDay === today || sched === today) {
          doneToday.push(wo);
          doneCount++;
        }
        continue;
      }

      if (!sched || sched < today || sched === today) {
        active.push(wo);
        if (status === "pending") pendingDepart++;
        else if (status === "en_route" || status === "in_progress" || status === "paused") {
          inProgress++;
        }
      }
    }

    active.sort((a, b) => {
      const oa = daysOverdue(a.scheduledDate, today);
      const ob = daysOverdue(b.scheduledDate, today);
      if (oa !== ob) return ob - oa;
      const da = a.scheduledDate ?? "";
      const db = b.scheduledDate ?? "";
      if (da !== db) return da.localeCompare(db);
      return (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? "");
    });

    return {
      activeOrders: active,
      completedToday: doneToday,
      counts: {
        todayTotal: active.length + doneToday.length,
        pendingDepart,
        inProgress,
        done: doneCount,
      },
    };
  }, [workOrders, progressMap, today]);

  if (authLoading || !user) {
    return (
      <div className="space-y-4 max-w-lg mx-auto md:max-w-2xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isLoading = ordersLoading || progressLoading;
  const errorMsg =
    (ordersError &&
      (ordersErr instanceof Error ? ordersErr.message : "無法載入派工單")) ||
    (progressError &&
      (progressErr instanceof Error ? progressErr.message : "無法載入施工進度")) ||
    null;

  const refetchAll = () => {
    void refetchOrders();
    void refetchProgress();
  };

  return (
    <div className="space-y-5 max-w-lg mx-auto md:max-w-2xl pb-10">
      <div>
        <h1 className="text-xl font-bold tracking-tight">工程師今日工作台</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user.displayName} ·{" "}
          {new Date().toLocaleDateString("zh-TW", {
            timeZone: "Asia/Taipei",
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </p>
      </div>

      {!errorMsg && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "今日案件", value: counts.todayTotal },
            { label: "待出發", value: counts.pendingDepart },
            { label: "施工中", value: counts.inProgress },
            { label: "已完成", value: counts.done },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold mt-0.5">
                  {isLoading ? "…" : s.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {errorMsg && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-6 text-center space-y-3">
            <AlertCircle className="h-7 w-7 text-destructive mx-auto" />
            <p className="font-medium text-destructive">載入失敗</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button type="button" variant="outline" size="sm" onClick={refetchAll}>
              重新整理
            </Button>
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
                今日尚無安排案件
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

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/work-orders" className="underline hover:text-foreground">
          查看全部派工單
        </Link>
      </p>
    </div>
  );
}
