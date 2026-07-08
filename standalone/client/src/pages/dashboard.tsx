import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, FileText, Wrench, CreditCard, Bell, ShieldCheck,
  DollarSign, AlertCircle, TrendingDown, ReceiptText,
  CalendarDays, Clock, ChevronRight, Hammer,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";

function fmt(n: number) {
  const val = Number.isFinite(n) ? n : 0;
  return "NT$" + val.toLocaleString("zh-TW", { minimumFractionDigits: 0 });
}

function getTechDisplay(technicians: string | null | undefined): string {
  try {
    const arr = technicians ? JSON.parse(technicians) : null;
    if (Array.isArray(arr) && arr.length) return arr.join("、");
  } catch { /* ignore */ }
  return "";
}

function StatCard({
  label, value, icon: Icon, color, href, isLoading, highlight, sub,
}: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; href?: string; isLoading?: boolean; highlight?: boolean; sub?: string;
}) {
  const inner = (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow h-full ${highlight ? "border-orange-300 bg-orange-50/50" : ""}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium leading-tight">{label}</p>
            {sub && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</p>}
            {isLoading
              ? <Skeleton className="h-6 w-14 mt-1" />
              : <p className="text-xl sm:text-2xl font-bold mt-0.5 truncate">{value}</p>}
          </div>
          <Icon className={`h-7 w-7 shrink-0 ${color} opacity-80`} />
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const { data, isLoading, isError, error } = useGetDashboardSummary();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const canSeeFinance = user?.role !== "admin";
  const todayReminder = (data?.todayReminderCount ?? 0);

  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">儀表板</h1>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="font-medium text-destructive">無法載入儀表板統計</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "請稍後再試或聯絡管理員"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">儀表板</h1>
        <p className="text-xs text-muted-foreground mt-0.5">晟風工程 ERP 系統總覽</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "新增客戶", icon: Users, bg: "#66E85A", text: "#FFFFFF", href: "/customers" },
          { label: "新增報價", icon: FileText, bg: "#FF4FB8", text: "#FFFFFF", href: "/quotes" },
          { label: "新增派工", icon: Wrench, bg: "#FFC9E6", text: "#333333", href: "/work-orders" },
          { label: "新增收款", icon: CreditCard, bg: "#1F5E4A", text: "#FFFFFF", href: "/receivables" },
        ].map(({ label, icon: Icon, bg, text, href }) => (
          <button
            key={label}
            onClick={() => navigate(href)}
            style={{ backgroundColor: bg, color: text }}
            className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-[transform,filter] duration-200 ease-in-out hover:brightness-[1.08] active:scale-[0.98]"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* 第一排：今日工作 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="今日施工" value={data?.todayWorkOrderCount ?? 0}
          icon={CalendarDays} color="text-blue-600"
          href="/work-orders" isLoading={isLoading}
        />
        <StatCard
          label="待施工" value={data?.pendingWorkOrders ?? 0}
          icon={Wrench} color="text-amber-600"
          href="/work-orders?status=待施工" isLoading={isLoading}
          highlight={(data?.pendingWorkOrders ?? 0) > 0}
        />
        <StatCard
          label="今日收款" value={fmt(data?.todayPaymentsAmount ?? 0)}
          icon={CreditCard} color="text-green-600"
          href="/receivables" isLoading={isLoading}
        />
        <StatCard
          label="今日提醒" value={todayReminder}
          sub="保固到期 · 應收到期"
          icon={Bell} color="text-orange-600"
          href="/receivables" isLoading={isLoading}
          highlight={todayReminder > 0}
        />
      </div>

      {/* 待派工案件 — 老闆優先關注 */}
      {(canSeeFinance || user?.role === "owner") && (
        <Card className={((data?.pendingDispatchCount ?? 0) > 0) ? "border-orange-300 bg-orange-50/30" : ""}>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-orange-500" />
                待派工案件
                {!isLoading && (data?.pendingDispatchCount ?? 0) > 0 && (
                  <span className="text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full ml-1">
                    {data?.pendingDispatchCount}
                  </span>
                )}
              </CardTitle>
              <Link href="/quotes">
                <span className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
                  報價單<ChevronRight className="h-3 w-3" />
                </span>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">客戶已回簽、等待安排施工</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : data?.pendingDispatchQuotes && data.pendingDispatchQuotes.length > 0 ? (
              <div className="divide-y">
                {data.pendingDispatchQuotes.map(q => (
                  <Link key={q.id} href="/quotes">
                    <div className="py-2.5 hover:bg-muted/40 rounded px-1 -mx-1 cursor-pointer flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{q.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {q.customerName ?? "—"} · 🟠 待派工 · {new Date(q.createdAt).toLocaleDateString("zh-TW")}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">目前無待派工案件</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 第二排：本月營運 */}
      {canSeeFinance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="本月營業額" value={fmt(data?.monthlyWonAmount ?? 0)}
            icon={DollarSign} color="text-green-600"
            href="/receivables" isLoading={isLoading}
          />
          <StatCard
            label="本月實收" value={fmt(data?.monthlyPaidAmount ?? 0)}
            icon={CreditCard} color="text-teal-600"
            href="/receivables" isLoading={isLoading}
          />
          <StatCard
            label="本月未收" value={fmt(data?.totalUnpaid ?? 0)}
            icon={TrendingDown} color="text-red-500"
            href="/receivables" isLoading={isLoading}
            highlight={(data?.totalUnpaid ?? 0) > 0}
          />
          <StatCard
            label="本月報價" value={fmt(data?.monthlyQuoteAmount ?? 0)}
            icon={FileText} color="text-violet-600"
            href="/quotes" isLoading={isLoading}
          />
        </div>
      )}

      {/* 第三排：應收帳款 */}
      {canSeeFinance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="應收總額" value={fmt(data?.totalReceivables ?? 0)}
            icon={DollarSign} color="text-blue-600"
            href="/receivables" isLoading={isLoading}
          />
          <StatCard
            label="今日到期" value={data?.todayDueCount ?? 0}
            icon={Clock} color="text-orange-600"
            href="/receivables" isLoading={isLoading}
            highlight={(data?.todayDueCount ?? 0) > 0}
          />
          <StatCard
            label="逾期金額" value={fmt(data?.overdueAmount ?? 0)}
            icon={AlertCircle} color="text-rose-700"
            href="/receivables" isLoading={isLoading}
            highlight={(data?.overdueAmount ?? 0) > 0}
          />
          <StatCard
            label="未開發票" value={data?.invoiceNotIssuedCount ?? 0}
            icon={ReceiptText} color="text-orange-600"
            href="/receivables" isLoading={isLoading}
          />
        </div>
      )}

      {/* 今日派工明細 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Hammer className="h-4 w-4 text-amber-500" />今日派工
            </CardTitle>
            <Link href="/work-orders">
              <span className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
                全部<ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : data?.todayWorkOrders && data.todayWorkOrders.length > 0 ? (
            <div className="divide-y">
              {data.todayWorkOrders.map(o => {
                const techs = getTechDisplay(o.technicians);
                return (
                  <Link key={o.id} href="/work-orders">
                    <div className="py-2.5 hover:bg-muted/40 rounded px-1 -mx-1 cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{o.customerName ?? "—"}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {o.scheduledTime && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />{o.scheduledTime}
                              </span>
                            )}
                            {techs && <span className="text-xs text-muted-foreground">{techs}</span>}
                            {o.installAddress && (
                              <span className="text-xs text-muted-foreground truncate max-w-[150px]">{o.installAddress}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">今日無排定施工</p>
          )}
        </CardContent>
      </Card>

      {/* 後續提醒（30 天內） */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/maintenance">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-orange-600" />
                <span className="text-sm">即將保養（30 天內）</span>
              </div>
              {isLoading ? <Skeleton className="h-5 w-8" /> : (
                <span className="text-sm font-bold text-orange-600">{data?.upcomingMaintenanceCount ?? 0}</span>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link href="/warranties">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-red-600" />
                <span className="text-sm">即將保固到期（30 天內）</span>
              </div>
              {isLoading ? <Skeleton className="h-5 w-8" /> : (
                <span className="text-sm font-bold text-red-600">{data?.expiringWarrantiesCount ?? 0}</span>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
