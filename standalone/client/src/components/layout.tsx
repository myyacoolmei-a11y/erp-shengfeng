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
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  NAV_GROUP_LABELS,
  sidebarItemsForGroup,
  wholesaleSubItems,
  type NavIconName,
  type NavItemDef,
} from "../../../shared/userPermissions.ts";

const NAV_ITEM_BASE =
  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors";
const NAV_ITEM_ACTIVE = "bg-foreground text-background";
const NAV_ITEM_INACTIVE = "text-muted-foreground hover:bg-muted/60 hover:text-foreground";

const ICON_MAP: Record<NavIconName, LucideIcon> = {
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
  Bell,
  Sparkles,
  Heart,
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
  const preferred = dashboards.find((d) => d.preferRoles?.some((r) => userRoles.includes(r as UserRole)));
  return preferred ?? dashboards[0];
}

function filterByPermission(items: NavItemDef[], user: AuthUser): NavItemDef[] {
  return items.filter((item) => userCanAccessNav(user, item.path));
}

function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
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

function NavContent() {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const isWholesalePath = location.startsWith("/wholesale");
  const [wholesaleOpen, setWholesaleOpen] = useState(isWholesalePath);

  const userRoles = effectiveRoles(user);
  const showWholesale = !!(user && userHasFeature(user, "wholesale"));

  const workRaw = user ? filterByPermission(sidebarItemsForGroup("work_center"), user) : [];
  const dash = user ? pickDashboardItem(workRaw, userRoles) : null;
  const workCenterItems = workRaw.filter((i) => i.key !== "dashboard" || i === dash);

  const companyInternalItems = user
    ? filterByPermission(sidebarItemsForGroup("company_internal"), user)
    : [];
  const aiCenterItems = user ? filterByPermission(sidebarItemsForGroup("ai_center"), user) : [];

  const workBeforeWholesale = workCenterItems.filter(
    (i) => i.key !== "inventory" && i.key !== "warranty_maintenance" && i.key !== "wholesale",
  );
  const workAfterWholesale = workCenterItems.filter(
    (i) => i.key === "inventory" || i.key === "warranty_maintenance",
  );
  const wholesaleSubs = wholesaleSubItems();

  function NavLink({ item }: { item: NavItemDef }) {
    const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
    return (
      <Link
        href={item.path}
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
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt={APP_BRAND.logoAlt} className="h-12 w-12 rounded-full object-cover shrink-0" />
            <div>
              <h1 className="text-base font-bold tracking-tight text-primary leading-tight">{APP_BRAND.brandEn}</h1>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{APP_BRAND.nameZh}</p>
              <p className="text-[10px] text-muted-foreground/80 leading-snug">{APP_BRAND.nameEn}</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="flex-1 px-4 mt-2 overflow-y-auto">
        <nav className="flex flex-col gap-0.5">
          {(workBeforeWholesale.length > 0 || showWholesale || workAfterWholesale.length > 0) && (
            <NavSectionHeader title={NAV_GROUP_LABELS.work_center} />
          )}

          {workBeforeWholesale.map((item) => (
            <NavLink key={`${item.path}-${item.label}`} item={item} />
          ))}

          {showWholesale && (
            <div>
              <button
                type="button"
                onClick={() => {
                  if (!isWholesalePath) navigate("/wholesale/customers");
                  setWholesaleOpen((v) => !v);
                }}
                className={`${NAV_ITEM_BASE} w-full ${isWholesalePath ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
              >
                <NavIcon name="ShoppingCart" active={isWholesalePath} />
                <span className="truncate">批發管理</span>
                <ChevronDown
                  className={`ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200 ${wholesaleOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {wholesaleOpen && (
                <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-border/40 pl-2.5">
                  {wholesaleSubs.map((sub) => {
                    const isActive = location === sub.path || location.startsWith(sub.path);
                    return (
                      <Link
                        key={sub.path}
                        href={sub.path}
                        className={`${NAV_ITEM_BASE} ${isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
                      >
                        <NavIcon name={sub.icon} active={isActive} />
                        <span className="truncate">{sub.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {workAfterWholesale.map((item) => (
            <NavLink key={`${item.path}-${item.label}`} item={item} />
          ))}

          {companyInternalItems.length > 0 && (
            <>
              <NavSectionHeader title={NAV_GROUP_LABELS.company_internal} />
              {companyInternalItems.map((item) => (
                <NavLink key={`${item.path}-${item.label}`} item={item} />
              ))}
            </>
          )}

          {aiCenterItems.length > 0 && (
            <>
              <NavSectionHeader title={NAV_GROUP_LABELS.ai_center} />
              {aiCenterItems.map((item) => (
                <NavLink key={`${item.path}-${item.label}`} item={item} />
              ))}
            </>
          )}
        </nav>

        <div className="mt-4 px-1 text-[10px] text-muted-foreground leading-relaxed border-t pt-3">
          <p className="font-medium text-foreground/70 mb-1">About</p>
          <p>{APP_BRAND.nameZh}</p>
          <p className="mt-0.5">{APP_BRAND.nameEn}</p>
        </div>
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
  const [, navigate] = useLocation();
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
      <aside className="hidden w-60 flex-col border-r border-border/60 bg-card md:flex">
        <NavContent />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="hidden md:flex h-12 items-center justify-end gap-2 border-b bg-card px-6 shadow-sm">
          {user && <NotificationBell />}
        </header>
        <header className="flex h-14 items-center gap-4 border-b bg-card px-6 md:hidden shadow-sm">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0">
              <NavContent />
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
