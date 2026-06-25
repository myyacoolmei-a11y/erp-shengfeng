import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, Wrench, CreditCard, Bell, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

function formatAmount(n: number) {
  return "NT$" + n.toLocaleString("zh-TW", { minimumFractionDigits: 0 });
}

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();

  const stats = [
    { label: "客戶總數", value: data?.totalCustomers ?? 0, icon: Users, color: "text-blue-600", href: "/customers" },
    { label: "報價單", value: data?.totalQuotes ?? 0, icon: FileText, color: "text-violet-600", href: "/quotes" },
    { label: "待處理派工", value: data?.pendingWorkOrders ?? 0, icon: Wrench, color: "text-amber-600", href: "/work-orders" },
    { label: "本月收款", value: data ? formatAmount(data.totalPaymentsAmount) : "NT$0", icon: CreditCard, color: "text-green-600", href: "/payments" },
    { label: "即將到期保養", value: data?.upcomingMaintenanceCount ?? 0, icon: Bell, color: "text-orange-600", href: "/maintenance" },
    { label: "即將到期保固", value: data?.expiringWarrantiesCount ?? 0, icon: ShieldCheck, color: "text-red-600", href: "/warranties" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">儀表板</h1>
        <p className="text-sm text-muted-foreground mt-1">晟風工程 ERP 系統總覽</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                    {isLoading ? (
                      <Skeleton className="h-7 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    )}
                  </div>
                  <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">派工單狀態</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">待處理</span>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">{data?.pendingWorkOrders ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">進行中</span>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">{data?.inProgressWorkOrders ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">已完成</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">{data?.completedWorkOrders ?? 0}</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">最新客戶</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : data?.recentCustomers && data.recentCustomers.length > 0 ? (
              <div className="space-y-1">
                {data.recentCustomers.map((c) => (
                  <Link key={c.id} href={`/customers/${c.id}`}>
                    <div className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-muted/50 rounded px-1 cursor-pointer">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.address.slice(0, 8)}...</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">尚無客戶資料</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
