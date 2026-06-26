import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  CreditCard,
  ShieldCheck,
  Bell,
  Menu,
  LogOut,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useAuth, ROLE_LABELS, type UserRole } from "@/contexts/auth-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "儀表板", icon: LayoutDashboard, roles: ["owner", "admin", "accountant"] },
  { href: "/customers", label: "客戶管理", icon: Users, roles: ["owner", "admin", "accountant"] },
  { href: "/quotes", label: "報價單管理", icon: FileText, roles: ["owner", "admin", "accountant"] },
  { href: "/work-orders", label: "派工單管理", icon: Wrench, roles: ["owner", "admin", "technician"] },
  { href: "/receivables", label: "應收帳款", icon: CreditCard, roles: ["owner", "admin", "accountant"] },
  { href: "/warranties", label: "保固管理", icon: ShieldCheck, roles: ["owner", "admin", "accountant"] },
  { href: "/maintenance", label: "保養提醒", icon: Bell, roles: ["owner", "admin", "technician"] },
  { href: "/users", label: "用戶管理", icon: UserCog, roles: ["owner"] },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  );

  const SidebarContent = () => (
    <div className="flex h-full flex-col py-4">
      <div className="px-6 py-2">
        <h1 className="text-xl font-bold tracking-tight text-primary">晟風工程</h1>
        <p className="text-xs text-muted-foreground mt-1 tracking-wider">ERP 系統</p>
      </div>
      <div className="flex-1 px-4 mt-2">
        <nav className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
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
          })}
        </nav>
      </div>

      {user && (
        <div className="px-4 pb-2 border-t pt-4">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <span className="text-xs font-bold text-primary">
                {user.displayName.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <Badge variant="secondary" className="text-xs mt-0.5">
                {ROLE_LABELS[user.role]}
              </Badge>
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

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r bg-card md:flex shadow-sm">
        <SidebarContent />
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
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <div className="font-bold text-primary">晟風工程 ERP</div>
          {user && (
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{ROLE_LABELS[user.role]}</Badge>
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
