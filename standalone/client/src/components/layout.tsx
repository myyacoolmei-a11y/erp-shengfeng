import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  CreditCard,
  ShieldCheck,
  Menu,
  LogOut,
  UserCog,
  HardHat,
  Briefcase,
  ShoppingCart,
  Package,
  Archive,
  ChevronDown,
  Building2,
  ReceiptText,
  Bell,
  Heart,
  Clock,
  TrendingUp,
  Sparkles,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  useAuth,
  effectiveRoles,
  userCanAccessNav,
  userHasFeature,
  type UserRole,
  type AuthUser,
} from "@/contexts/auth-context";
import { ROLE_LABELS } from "@/lib/role-labels";
import { APP_BRAND } from "@/lib/appBrand";
import { PwaInstallBanner } from "@/components/pwa/PwaInstallBanner";
import { NotificationBell } from "@/components/NotificationBell";
import {
  sidebarItemsForGroup,
  wholesaleSubItems,
  type NavIconName,
  type NavItemDef,
} from "../../../shared/navigationPermissions.ts";

const NAV_ITEM_BASE =
  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
const NAV_ITEM_ACTIVE = "bg-foreground text-background";
const NAV_ITEM_INACTIVE = "text-muted-foreground hover:bg-muted/60 hover:text-foreground";

const ICON_MAP: Record<NavIconName | "BarChart3", LucideIcon> = {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  HardHat,
  CreditCard,
  Archive,
  Package,
  ShieldCheck,
  ShoppingCart,
  Building2,
  ReceiptText,
  Briefcase,
  UserCog,
  Clock,
  TrendingUp,
  Bell,
  Sparkles,
  Heart,
  BarChart3,
};

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: "bg-red-100 text-red-800 border-red-200",
  owner: "bg-amber-100 text-amber-800 border-amber-200",
  admin: "bg-blue-100 text-blue-800 border-blue-200",
  sales: "bg-green-100 text-green-800 border-green-200",
  engineer: "bg-purple-100 text-purple-800 border-purple-200",
  technician: "bg-slate-100 text-slate-700 border-slate-200",
  accountant: "bg-pink-100 text-pink-800 border-pink-200",
  distributor: "bg-orange-100 text-orange-800 border-orange-200",
};

function pickDashboardItem(items: NavItemDef[], userRoles: UserRole[]): NavItemDef | null {
  const dashboards = items.filter((i) => i.key === "dashboard");
  if (!dashboards.length) return null;
  const isFieldEngineer =
    (userRoles.includes("engineer") || userRoles.includes("technician")) &&
    !userRoles.includes("super_admin") &&
    !userRoles.includes("owner") &&
    !userRoles.includes("admin");
  if (isFieldEngineer) {
    const eng =
      dashboards.find((d) => d.path === "/engineer-dashboard") ??
      dashboards.find((d) => d.preferRoles?.some((r) => r === "engineer" || r === "technician"));
    if (eng) return { ...eng, label: "今日工作" };
  }
  // Owner / boss — ops overview (not admin workbench)
  if (userRoles.includes("super_admin") || userRoles.includes("owner")) {
    const home = dashboards.find((d) => d.path === "/") ?? dashboards[0];
    return home ? { ...home, label: "營運儀表板" } : null;
  }
  // Admin / accountant — daily workbench
  if (userRoles.includes("admin") || userRoles.includes("accountant")) {
    const home = dashboards.find((d) => d.path === "/") ?? dashboards[0];
    return home ? { ...home, label: "今日工作台" } : null;
  }
  const preferred = dashboards.find((d) => d.preferRoles?.some((r) => userRoles.includes(r as UserRole)));
  return preferred ?? dashboards[0];
}

function filterByPermission(items: NavItemDef[], user: AuthUser): NavItemDef[] {
  return items.filter((item) => userCanAccessNav(user, item.path));
}

function NavIcon({ name, active }: { name: NavIconName | "BarChart3"; active: boolean }) {
  const Icon = ICON_MAP[name];
  return (
    <Icon
      className={`h-4 w-4 shrink-0 ${active ? "text-background" : "text-muted-foreground/70"}`}
      strokeWidth={1.5}
    />
  );
}

function NavSectionHeader({ title }: { title: string }) {
  return (
    <p className="px-2.5 pb-1 pt-5 text-[11px] font-medium tracking-wide text-muted-foreground/55 first:pt-1">
      {title}
    </p>
  );
}

function NavGroup({ title, active, children }: { title: string; active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  return <section className="mt-2 border-t border-border/60 pt-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted/60">
      {title}<ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
    </button>
    {open && <div className="ml-2 border-l border-border/60 pl-2">{children}</div>}
  </section>;
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isWholesalePath = location.startsWith("/wholesale");


  const userRoles = effectiveRoles(user);
  const showWholesale = !!(user && userHasFeature(user, "wholesale"));

  const showOperationCenter =
    userRoles.includes("super_admin") || userRoles.includes("owner");

  const workRaw = user ? filterByPermission(sidebarItemsForGroup("work_center"), user) : [];
  const dash = user ? pickDashboardItem(workRaw, userRoles) : null;
  const workCenterItems = workRaw.filter((i) => i.key !== "dashboard");

  const companyInternalItems = user
    ? filterByPermission(sidebarItemsForGroup("company_internal"), user)
    : [];
  const aiCenterItems = user ? filterByPermission(sidebarItemsForGroup("ai_center"), user) : [];

  const resourceKeys = ["products", "inventory"];
  const dailyItems = workCenterItems.filter((i) => !resourceKeys.includes(i.key));
  const resourceItems = workCenterItems.filter((i) => resourceKeys.includes(i.key));
  const reportItems = companyInternalItems.filter((i) => ["work_hours", "sales_stats"].includes(i.key));
  const staffItems = companyInternalItems.filter((i) => !["work_hours", "sales_stats"].includes(i.key));
  const wholesaleSubs = wholesaleSubItems().filter((i) => user && userCanAccessNav(user, i.path));
  const showWholesaleMenu = showWholesale && wholesaleSubs.length > 0;
  const active = (path: string) => location === path || (path !== "/" && location.startsWith(path + "/")) || (path === "/warranties" && location.startsWith("/maintenance"));

  function NavLink({ item }: { item: NavItemDef }) {
    const isActive = active(item.path);
    return (
      <Link
        href={item.path}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={`${NAV_ITEM_BASE} ${isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
      >
        <NavIcon name={item.icon} active={isActive} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="flex h-full flex-col py-4">
      <div className="px-4 py-3">
        <Link href={dash?.path ?? "/"} onClick={onNavigate}>
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt={APP_BRAND.logoAlt} className="h-12 w-12 rounded-full object-cover shrink-0" />
            <div>
              <h1 className="text-base font-bold tracking-tight text-primary leading-tight">{APP_BRAND.brandEn}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{APP_BRAND.pwaShortName}</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="flex-1 px-4 mt-2 overflow-y-auto">
        <nav aria-label="主要功能" className="flex flex-col gap-1">
          <NavSectionHeader title="日常工作" />
          {dash && <NavLink item={dash} />}
          {dailyItems.map((item) => <NavLink key={item.path} item={item} />)}
          {(resourceItems.length > 0 || showWholesaleMenu) && (
            <NavGroup title="商品與批發" active={resourceItems.some((i) => active(i.path)) || isWholesalePath}>
              {resourceItems.map((item) => <NavLink key={item.path} item={item} />)}
              {showWholesaleMenu && <NavGroup title="批發管理" active={isWholesalePath}>
                {wholesaleSubs.map((item) => <NavLink key={item.path} item={item} />)}
              </NavGroup>}
            </NavGroup>
          )}
          {(showOperationCenter || reportItems.length > 0) && (
            <NavGroup title="營運與報表" active={active("/operation-center") || reportItems.some((i) => active(i.path))}>
              {showOperationCenter && <Link href="/operation-center" onClick={onNavigate} aria-current={active("/operation-center") ? "page" : undefined} className={`${NAV_ITEM_BASE} ${active("/operation-center") ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}>
                <NavIcon name="BarChart3" active={active("/operation-center")} />營運中心
              </Link>}
              {reportItems.map((item) => <NavLink key={item.path} item={item} />)}
            </NavGroup>
          )}
          {staffItems.length > 0 && <NavGroup title="公司管理" active={staffItems.some((i) => active(i.path))}>
            {staffItems.map((item) => <NavLink key={item.path} item={item} />)}
          </NavGroup>}
          {aiCenterItems.length > 0 && <NavGroup title="AI 與夥伴" active={aiCenterItems.some((i) => active(i.path))}>
            {aiCenterItems.map((item) => <NavLink key={item.path} item={item} />)}
          </NavGroup>}
        </nav>
      </div>

      {user && (
        <div className="px-4 pb-2 border-t pt-4">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <span className="text-xs font-bold text-primary">{user.displayName.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {userRoles.map((r) => (
                  <span key={r} className={`inline-block text-xs px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[r as UserRole]}`}>
                    {ROLE_LABELS[r as UserRole] ?? r}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            登出
          </Button>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [location]);
  const { user } = useAuth();
  const userRoles = effectiveRoles(user);

  useEffect(() => {
    function onSwMessage(e: MessageEvent) {
      if (e.data?.type === "navigate" && typeof e.data.url === "string") {
        navigate(e.data.url);
      }
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage);
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden sticky top-0 h-dvh w-60 shrink-0 flex-col border-r border-border/60 bg-card md:flex">
        <NavContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="hidden md:flex h-12 items-center justify-end gap-2 border-b bg-card px-6 shadow-sm">
          {user && <NotificationBell />}
        </header>
        <header className="flex h-14 items-center gap-4 border-b bg-card px-6 md:hidden shadow-sm">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
              <SheetTitle className="sr-only">主要功能</SheetTitle>
              <NavContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt={APP_BRAND.logoAlt} className="h-8 w-8 rounded-full object-cover" />
              <span className="font-bold text-primary text-sm leading-tight" title={APP_BRAND.nameZh}>
                {APP_BRAND.brandEn}
              </span>
            </div>
          </Link>
          {user && (
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              <NotificationBell />
              {userRoles.slice(0, 2).map((r) => (
                <span key={r} className={`text-xs px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[r as UserRole]}`}>
                  {ROLE_LABELS[r as UserRole] ?? r}
                </span>
              ))}
              {userRoles.length > 2 && (
                <span className="text-xs text-muted-foreground">+{userRoles.length - 2}</span>
              )}
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl w-full space-y-4">
            {user && <PwaInstallBanner compact />}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
