"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, Sparkles, X } from "lucide-react";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { LogoutButton } from "@/components/dashboard/LogoutButton";

interface DashboardShellProps {
  userEmail: string;
  children: ReactNode;
}

function BrandMark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-1">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne-500/15 text-champagne-400">
        <Sparkles className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="text-sm font-semibold tracking-wide text-warm-100">
        AI Media Agent
      </span>
    </Link>
  );
}

export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-warm-600/15 bg-ink-900/40 p-4 lg:flex">
        <div className="mb-6">
          <BrandMark />
        </div>
        <SidebarNav />
        <div className="mt-auto space-y-1 border-t border-warm-600/15 pt-3">
          <p className="truncate px-3.5 pb-1 text-xs text-warm-500">{userEmail}</p>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-h-full flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-warm-600/15 px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="開啟選單"
            className="flex h-9 w-9 items-center justify-center rounded-full text-warm-200 hover:bg-ink-800"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <BrandMark />
          <span className="h-9 w-9" aria-hidden />
        </header>

        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-10 lg:py-10 lg:pb-10">
          {children}
        </main>
      </div>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="關閉選單"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-warm-600/15 bg-ink-900 p-4">
            <div className="mb-6 flex items-center justify-between">
              <BrandMark />
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="關閉選單"
                className="flex h-9 w-9 items-center justify-center rounded-full text-warm-200 hover:bg-ink-800"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <SidebarNav onNavigate={() => setIsDrawerOpen(false)} />
            <div className="mt-auto space-y-1 border-t border-warm-600/15 pt-3">
              <p className="truncate px-3.5 pb-1 text-xs text-warm-500">{userEmail}</p>
              <LogoutButton />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
