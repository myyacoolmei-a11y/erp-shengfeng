"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";

interface SidebarNavProps {
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {DASHBOARD_NAV_ITEMS.map(({ href, label, icon: Icon, comingSoon }) => {
        const isActive = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-champagne-500/15 text-champagne-300"
                : "text-warm-400 hover:bg-ink-800 hover:text-warm-100"
            }`}
          >
            <span className="flex items-center gap-3">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </span>
            {comingSoon ? (
              <span className="rounded-full bg-warm-600/15 px-2 py-0.5 text-[10px] font-normal text-warm-500">
                即將推出
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
