import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function HomeCta() {
  return (
    <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="mx-auto flex max-w-4xl flex-col items-center rounded-3xl border border-champagne-400/20 bg-gradient-to-b from-ink-900 to-ink-950 px-6 py-14 text-center sm:px-12">
        <h2 className="text-2xl font-semibold text-warm-100 sm:text-3xl">
          準備好交給 AI 團隊了嗎？
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-warm-400 sm:text-base">
          立即建立帳號，開始上傳您的第一份素材。
        </p>
        <Link
          href="/login"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-champagne-500 px-7 py-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-champagne-400 sm:w-auto"
        >
          免費開始使用
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </Link>
      </div>
    </section>
  );
}
