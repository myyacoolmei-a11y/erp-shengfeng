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
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/", label: "儀表板", icon: LayoutDashboard },
  { href: "/customers", label: "客戶管理", icon: Users },
  { href: "/quotes", label: "報價單管理", icon: FileText },
  { href: "/work-orders", label: "派工單管理", icon: Wrench },
  { href: "/payments", label: "收款紀錄", icon: CreditCard },
  { href: "/warranties", label: "保固管理", icon: ShieldCheck },
  { href: "/maintenance", label: "保養提醒", icon: Bell },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-4 py-4">
      <div className="px-6 py-2">
        <h1 className="text-xl font-bold tracking-tight text-primary">晟風工程</h1>
        <p className="text-xs text-muted-foreground mt-1 tracking-wider">ERP 系統</p>
      </div>
      <div className="flex-1 px-4">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
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
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
