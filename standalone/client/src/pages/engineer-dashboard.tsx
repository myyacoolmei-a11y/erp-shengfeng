import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useListWorkOrders } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock } from "lucide-react";
import {
  EngineerWorkOrderCard,
} from "@/components/field-progress/EngineerWorkOrderCard";
import {
  listMyFieldProgress,
  taipeiToday,
  isWorkOrderAssignedToUser,
} from "@/lib/fieldProgressApi";

export default function EngineerDashboard() {
  const { user } = useAuth();
  const today = taipeiToday();
  const { data: workOrders = [], isLoading: ordersLoading } = useListWorkOrders({});
  const { data: progressRows = [], isLoading: progressLoading } = useQuery({
    queryKey: ["field-progress", "mine"],
    queryFn: listMyFieldProgress,
  });

  const progressMap = useMemo(() => {
    const map = new Map<number, (typeof progressRows)[number]>();
    for (const r of progressRows) map.set(r.workOrderId, r);
    return map;
  }, [progressRows]);

  const todayOrders = useMemo(() => {
    return workOrders
      .filter((wo) => {
        if (wo.scheduledDate !== today) return false;
        return isWorkOrderAssignedToUser(
          {
            assignedTo: wo.assignedTo,
            assistantTo: wo.assistantTo,
            technicians: wo.technicians as string | null | undefined,
          },
          {
            id: user?.id ?? 0,
            displayName: user?.displayName ?? "",
            username: user?.username,
          },
        );
      })
      .sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));
  }, [workOrders, today, user?.displayName]);

  const isLoading = ordersLoading || progressLoading;

  return (
    <div className="space-y-5 max-w-lg mx-auto md:max-w-2xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">今日派工</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user?.displayName} · {new Date().toLocaleDateString("zh-TW", {
            timeZone: "Asia/Taipei",
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            今日派工（{isLoading ? "…" : todayOrders.length}）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : todayOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">今日沒有分派給您的派工</p>
          ) : (
            todayOrders.map((wo) => (
              <EngineerWorkOrderCard
                key={wo.id}
                order={wo}
                progress={progressMap.get(wo.id) ?? null}
              />
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/work-orders" className="underline hover:text-foreground">查看所有派工單</Link>
      </p>
    </div>
  );
}
