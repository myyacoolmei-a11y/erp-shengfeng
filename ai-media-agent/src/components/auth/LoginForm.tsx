"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateAuthForm, type AuthFormErrors } from "@/lib/validation/auth";

type AuthMode = "login" | "signup";

interface LoginFormProps {
  redirectTo: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === "signup";

  function handleModeSwitch(nextMode: AuthMode) {
    setMode(nextMode);
    setFormError(null);
    setInfoMessage(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setInfoMessage(null);

    const errors = validateAuthForm({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();

      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setFormError(error.message);
          return;
        }

        if (!data.session) {
          setInfoMessage("註冊成功，請至信箱收取驗證信後再登入。");
          setMode("login");
          return;
        }

        router.push(redirectTo);
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setFormError(error.message);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setFormError("發生未預期的錯誤，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <div className="mb-6 flex rounded-full border border-warm-600/25 bg-ink-900/60 p-1">
        <button
          type="button"
          onClick={() => handleModeSwitch("login")}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
            !isSignup ? "bg-champagne-500 text-ink-950" : "text-warm-400"
          }`}
        >
          登入
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch("signup")}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
            isSignup ? "bg-champagne-500 text-ink-950" : "text-warm-400"
          }`}
        >
          註冊
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-warm-200">
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-500" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-xl border border-warm-600/25 bg-ink-900/60 py-3 pl-10 pr-4 text-sm text-warm-100 outline-none transition-colors placeholder:text-warm-500 focus:border-champagne-400/60"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
          </div>
          {fieldErrors.email ? (
            <p id="email-error" className="mt-1.5 text-xs text-blush-400">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-warm-200">
              密碼
            </label>
            <span
              className="cursor-not-allowed text-xs text-warm-600"
              title="忘記密碼功能尚未開放"
            >
              忘記密碼？（尚未開放）
            </span>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-500" />
            <input
              id="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="請輸入密碼"
              className="w-full rounded-xl border border-warm-600/25 bg-ink-900/60 py-3 pl-10 pr-4 text-sm text-warm-100 outline-none transition-colors placeholder:text-warm-500 focus:border-champagne-400/60"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
          </div>
          {fieldErrors.password ? (
            <p id="password-error" className="mt-1.5 text-xs text-blush-400">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-blush-500/30 bg-blush-500/10 px-4 py-3 text-sm text-blush-300"
        >
          {formError}
        </p>
      ) : null}

      {infoMessage ? (
        <p className="mt-4 rounded-xl border border-champagne-400/30 bg-champagne-500/10 px-4 py-3 text-sm text-champagne-300">
          {infoMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-champagne-500 py-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-champagne-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSubmitting ? "處理中…" : isSignup ? "註冊帳號" : "登入"}
      </button>
    </form>
  );
}
