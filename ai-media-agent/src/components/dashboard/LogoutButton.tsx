"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-warm-400 transition-colors hover:bg-ink-800 hover:text-blush-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} />
      {isLoading ? "登出中…" : "登出"}
    </button>
  );
}
