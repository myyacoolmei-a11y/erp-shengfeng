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
  return "NT$" + n.toLocaleString("zh-TW", { minimumFractionDigits: 0 });
}

function getTechDisplay(technicians: string | null | undefined): string {
  try {
    const arr = technicians ? JSON.parse(technicians) : null;
    if (Array.isArray(arr) && arr.length) return arr.join("、");
  } catch { /* ignore */ }
  return "";
}

function StatCard({
  label, value, icon: Icon, color, href, isLoading, highlight,
}: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; href?: string; isLoading?: boolean; highlight?: boolean;
}) {
  const inner = (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${highlight ? "border-orange-300 bg-orange-50/50" : ""}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium leading-tight">{label}</p>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{children}</h2>;
}

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const canSeeFinance = user?.role !== "admin";

  return (
    <div className="space-y-5">
      {/* Page title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">儀表板</h1>
        <p className="text-xs text-muted-foreground mt-0.5">晟風工程 ERP 系統總覽</p>
      </div>

      {/* ── 快捷按鈕 ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "新增客戶", icon: Users, color: "bg-blue-500 hover:bg-blue-600", href: "/customers" },
          { label: "新增報價", icon: FileText, color: "bg-violet-500 hover:bg-violet-600", href: "/quotes" },
          { label: "新增派工", icon: Wrench, color: "bg-amber-500 hover:bg-amber-600", href: "/work-orders" },
          { label: "新增收款", icon: CreditCard, color: "bg-green-500 hover:bg-green-600", href: "/receivables" },
        ].map(({ label, icon: Icon, color, href }) => (
          <button
            key={label}
            onClick={() => navigate(href)}
            className={`flex items-center justify-center gap-2 rounded-lg py-3 text-white text-sm font-semibold transition-colors ${color}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── 今日工作 ─────────────────────────────────────────── */}
      <div>
        <SectionTitle>今日工作</SectionTitle>
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
            href="/payments" isLoading={isLoading}
          />
          <StatCard
            label="今日保養" value={data?.todayMaintenanceCount ?? 0}
            icon={Bell} color="text-orange-600"
            href="/maintenance" isLoading={isLoading}
            highlight={(data?.todayMaintenanceCount ?? 0) > 0}
          />
        </div>
      </div>

      {/* ── 本月營運 ─────────────────────────────────────────── */}
      {canSeeFinance && (
        <div>
          <SectionTitle>本月營運</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="本月報價金額" value={fmt(data?.monthlyQuoteAmount ?? 0)}
              icon={FileText} color="text-violet-600"
              href="/quotes" isLoading={isLoading}
            />
            <StatCard
              label="本月成交金額" value={fmt(data?.monthlyWonAmount ?? 0)}
              icon={DollarSign} color="text-green-600"
              href="/quotes" isLoading={isLoading}
            />
            <StatCard
              label="本月已收款" value={fmt(data?.monthlyPaidAmount ?? 0)}
              icon={CreditCard} color="text-teal-600"
              href="/payments" isLoading={isLoading}
            />
            <StatCard
              label="本月未收款" value={fmt(data?.totalUnpaid ?? 0)}
              icon={TrendingDown} color="text-red-500"
              href="/receivables" isLoading={isLoading}
              highlight={(data?.totalUnpaid ?? 0) > 0}
            />
          </div>
        </div>
      )}

      {/* ── 應收帳款 ─────────────────────────────────────────── */}
      {canSeeFinance && (
        <div>
          <SectionTitle>應收帳款</SectionTitle>
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
        </div>
      )}

      {/* ── 今日派工 + 提醒 ─────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* 今日派工 */}
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
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
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
                              {techs && (
                                <span className="text-xs text-muted-foreground">{techs}</span>
                              )}
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

        {/* 提醒 */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-orange-500" />提醒
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-0">
            {[
              {
                label: "即將保養（30 天內）",
                value: data?.upcomingMaintenanceCount ?? 0,
                icon: Bell,
                color: "text-orange-600",
                href: "/maintenance",
                highlight: (data?.upcomingMaintenanceCount ?? 0) > 0,
              },
              {
                label: "即將保固到期（30 天內）",
                value: data?.expiringWarrantiesCount ?? 0,
                icon: ShieldCheck,
                color: "text-red-600",
                href: "/warranties",
                highlight: (data?.expiringWarrantiesCount ?? 0) > 0,
              },
              {
                label: "應收到期（今日）",
                value: data?.todayDueCount ?? 0,
                icon: AlertCircle,
                color: "text-rose-600",
                href: "/receivables",
                highlight: (data?.todayDueCount ?? 0) > 0,
              },
            ].map(({ label, value, icon: Icon, color, href, highlight }) => (
              <Link key={label} href={href}>
                <div className={`flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/40 rounded px-1 -mx-1 cursor-pointer ${highlight ? "text-orange-800" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className="text-sm">{label}</span>
                  </div>
                  {isLoading
                    ? <Skeleton className="h-5 w-8" />
                    : <span className={`text-sm font-bold ${highlight ? "text-orange-600" : "text-muted-foreground"}`}>{value}</span>}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
