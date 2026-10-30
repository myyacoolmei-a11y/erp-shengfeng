import Link from "next/link";
import { Sparkles } from "lucide-react";

export function HomeHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-warm-600/15 bg-ink-950/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne-500/15 text-champagne-400">
            <Sparkles className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-warm-100 sm:text-base">
            AI Media Agent
          </span>
        </Link>

        <Link
          href="/login"
          className="rounded-full border border-warm-600/30 px-4 py-2 text-sm font-medium text-warm-200 transition-colors hover:border-champagne-400/50 hover:text-champagne-300"
        >
          登入
        </Link>
      </div>
    </header>
  );
}
