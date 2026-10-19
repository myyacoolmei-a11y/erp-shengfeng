import Link from "next/link";
import { Sparkles } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo } = await searchParams;
  const safeRedirectTo = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/dashboard";

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 py-16 sm:px-8">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-champagne-500/15 text-champagne-400">
          <Sparkles className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="text-base font-semibold tracking-wide text-warm-100">
          AI Media Agent
        </span>
      </Link>

      <div className="w-full max-w-sm rounded-3xl border border-warm-600/15 bg-ink-900/70 p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold text-warm-100">歡迎回來</h1>
        <p className="mb-6 text-sm text-warm-400">登入以進入您的 AI 媒體工作台</p>
        <LoginForm redirectTo={safeRedirectTo} />
      </div>
    </div>
  );
}
