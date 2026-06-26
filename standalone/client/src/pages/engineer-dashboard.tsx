import { useListWorkOrders } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wrench,
  CheckCircle2,
  Clock,
  CalendarClock,
  ClipboardList,
  MapPin,
  User2,
  ChevronRight,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  "待處理": "bg-amber-100 text-amber-700",
  "進行中": "bg-blue-100 text-blue-700",
  "已完成": "bg-green-100 text-green-700",
  "已取消": "bg-gray-100 text-gray-700",
};

const PT_COLORS: Record<string, string> = {
  "新裝": "bg-purple-100 text-purple-700",
  "維修": "bg-red-100 text-red-700",
  "保養": "bg-teal-100 text-teal-700",
  "遷機": "bg-orange-100 text-orange-700",
  "清洗": "bg-sky-100 text-sky-700",
  "保固服務": "bg-green-100 text-green-700",
};

export default function EngineerDashboard() {
  const { user } = useAuth();
  const { data: workOrders = [], isLoading } = useListWorkOrders({});

  const today = new Date().toISOString().split("T")[0];

  const todayOrders = workOrders.filter((wo) => wo.scheduledDate === today);
  const inProgress = workOrders.filter((wo) => wo.status === "進行中");
  const completedToday = workOrders.filter(
    (wo) => wo.status === "已完成" && wo.completedDate?.startsWith(today)
  );
  const myOrders = workOrders.filter(
    (wo) =>
      wo.assignedTo === user?.displayName ||
      wo.assistantTo === user?.displayName
  );

  const stats = [
    {
      label: "今日派工",
      value: todayOrders.length,
      icon: CalendarClock,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "進行中",
      value: inProgress.length,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "今日完工",
      value: completedToday.length,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "我的派工",
      value: myOrders.length,
      icon: ClipboardList,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
  ];

  const upcomingOrders = workOrders
    .filter((wo) => wo.status !== "已完成" && wo.status !== "已取消")
    .sort((a, b) => {
      const da = a.scheduledDate ?? "";
      const db2 = b.scheduledDate ?? "";
      return da < db2 ? -1 : da > db2 ? 1 : 0;
    })
    .slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">工程師儀表板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.displayName} 的工作總覽
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("zh-TW", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold mt-1">{s.value}</p>
                  )}
                </div>
                <div className={`${s.bg} p-2.5 rounded-full`}>
                  <s.icon className={`h-6 w-6 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/work-orders">
          <Button className="gap-2">
            <Wrench className="h-4 w-4" />
            查看所有派工單
          </Button>
        </Link>
        <Link href="/maintenance">
          <Button variant="outline" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            保養提醒
          </Button>
        </Link>
      </div>

      {/* Upcoming work orders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>待處理 / 進行中 派工單</span>
            <Link href="/work-orders">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                全部 <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 pb-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : upcomingOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">目前沒有待處理派工單</p>
          ) : (
            <div className="divide-y">
              {upcomingOrders.map((wo) => (
                <div key={wo.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm truncate">{wo.workOrderNumber}</span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${STATUS_COLORS[wo.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {wo.status}
                        </Badge>
                        {wo.projectType && (
                          <Badge
                            variant="secondary"
                            className={`text-xs ${PT_COLORS[wo.projectType] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {wo.projectType}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{wo.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {wo.customerName && (
                          <span className="flex items-center gap-1">
                            <User2 className="h-3 w-3" />
                            {wo.customerName}
                          </span>
                        )}
                        {wo.installAddress && (
                          <span className="flex items-center gap-1 truncate max-w-[180px]">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {wo.installAddress}
                          </span>
                        )}
                        {wo.scheduledDate && (
                          <span className={wo.scheduledDate === today ? "text-primary font-semibold" : ""}>
                            📅 {wo.scheduledDate}
                            {wo.scheduledDate === today && " (今日)"}
                          </span>
                        )}
                        {wo.assignedTo && (
                          <span>負責：{wo.assignedTo}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
