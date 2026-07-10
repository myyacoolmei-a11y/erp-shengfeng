import React, { useState } from "react";
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
  ClipboardList,
  ReceiptText,
  Bell,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth, effectiveRoles, type UserRole } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@/lib/role-labels";
import { APP_BRAND } from "@/lib/appBrand";
import { PwaInstallBanner } from "@/components/pwa/PwaInstallBanner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "儀表板",
    icon: LayoutDashboard,
    roles: ["super_admin", "owner", "admin", "accountant"],
  },
  {
    href: "/engineer-dashboard",
    label: "儀表板",
    icon: LayoutDashboard,
    roles: ["engineer", "technician"],
  },
  {
    href: "/customers",
    label: "客戶管理",
    icon: Users,
    roles: ["super_admin", "owner", "admin", "sales", "accountant"],
  },
  {
    href: "/quotes",
    label: "報價單",
    icon: FileText,
    roles: ["super_admin", "owner", "admin", "sales", "distributor"],
  },
  {
    href: "/work-orders",
    label: "派工單",
    icon: Wrench,
    roles: ["super_admin", "owner", "admin", "engineer", "technician"],
  },
  {
    href: "/repair-cases",
    label: "維修案件",
    icon: Wrench,
    roles: ["super_admin", "owner", "admin", "engineer", "technician", "sales"],
  },
  {
    href: "/receivables",
    label: "收款 / 應收帳款",
    icon: CreditCard,
    roles: ["super_admin", "owner", "admin", "accountant"],
  },
  {
    href: "/products",
    label: "商品管理",
    icon: Archive,
    roles: ["super_admin", "owner", "admin", "sales"],
  },
  {
    href: "/inventory",
    label: "庫存管理",
    icon: Package,
    roles: ["super_admin", "owner", "admin"],
  },
  {
    href: "/warranties",
    label: "保固保養",
    icon: ShieldCheck,
    roles: ["super_admin", "owner", "admin", "accountant", "engineer", "technician"],
  },
  {
    href: "/employees",
    label: "員工管理",
    icon: Briefcase,
    roles: ["super_admin", "owner", "admin"],
  },
  {
    href: "/work-hours-stats",
    label: "工時統計",
    icon: Clock,
    roles: ["super_admin", "owner", "admin", "accountant"],
  },
  {
    href: "/reminder-settings",
    label: "AI 收款秘書",
    icon: Bell,
    roles: ["super_admin", "owner", "admin"],
  },
  {
    href: "/users",
    label: "用戶管理",
    icon: UserCog,
    roles: ["super_admin", "owner"],
  },
];

const WHOLESALE_ROLES: UserRole[] = ["super_admin", "owner", "admin", "sales", "accountant"];

const WHOLESALE_SUB_ITEMS = [
  { href: "/wholesale/customers", label: "批發客戶", icon: Building2 },
  { href: "/wholesale/products", label: "批發商品", icon: Archive },
  { href: "/wholesale/orders", label: "批發出貨單", icon: ReceiptText },
  { href: "/wholesale/settlements", label: "月結 / 應收", icon: CreditCard },
];

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

function NavContent() {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const isWholesalePath = location.startsWith("/wholesale");
  const [wholesaleOpen, setWholesaleOpen] = useState(isWholesalePath);

  const userRoles = effectiveRoles(user);
  const showWholesale = WHOLESALE_ROLES.some((r) => userRoles.includes(r));
  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => userRoles.includes(r))
  );

  const topItems = visibleItems.filter(
    (item) => !(["/inventory", "/warranties", "/employees", "/users", "/reminder-settings", "/work-hours-stats"].includes(item.href))
  );
  const bottomItems = visibleItems.filter(
    (item) => ["/warranties", "/employees", "/users", "/inventory", "/reminder-settings", "/work-hours-stats"].includes(item.href)
  );

  function NavLink({ item }: { item: NavItem }) {
    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <item.icon className="h-4 w-4" />
        {item.label}
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
        <nav className="flex flex-col gap-1">
          {topItems.map((item) => <NavLink key={item.href} item={item} />)}

          {/* Wholesale group */}
          {showWholesale && (
            <div>
              <button
                onClick={() => {
                  if (!isWholesalePath) navigate("/wholesale/customers");
                  setWholesaleOpen((v) => !v);
                }}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium w-full transition-colors ${
                  isWholesalePath
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <ShoppingCart className="h-4 w-4" />
                批發管理
                <ChevronDown
                  className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${wholesaleOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {wholesaleOpen && (
                <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l pl-3">
                  {WHOLESALE_SUB_ITEMS.map((sub) => {
                    const isActive = location === sub.href || location.startsWith(sub.href);
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <sub.icon className="h-3.5 w-3.5" />
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {bottomItems.map((item) => <NavLink key={item.href} item={item} />)}
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
  const [location] = useLocation();
  const { user } = useAuth();
  const userRoles = effectiveRoles(user);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r bg-card md:flex shadow-sm">
        <NavContent />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-6 md:hidden shadow-sm">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
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
            <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
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
