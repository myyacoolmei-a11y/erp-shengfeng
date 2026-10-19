import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(198,162,94,0.16),transparent)]"
      />

      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <span className="mb-6 inline-flex items-center rounded-full border border-champagne-400/30 bg-champagne-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-champagne-300">
          企業級 AI 媒體製作平台
        </span>

        <h1 className="text-balance text-3xl font-semibold leading-tight text-warm-100 sm:text-5xl sm:leading-tight">
          讓每一家企業，都擁有
          <br className="hidden sm:block" />
          自己的 <span className="text-champagne-400">AI 媒體團隊</span>
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-base leading-relaxed text-warm-400 sm:text-lg">
          上傳影片、照片或說一段話，AI 自動幫你剪輯、寫稿、整理並發布。
        </p>

        <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/login"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-champagne-500 px-7 py-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-champagne-400 sm:w-auto"
          >
            免費開始使用
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>

          <Link
            href="#workflow"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-warm-600/30 px-7 py-3.5 text-sm font-semibold text-warm-200 transition-colors hover:border-champagne-400/50 hover:text-champagne-300 sm:w-auto"
          >
            <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
            查看操作流程
          </Link>
        </div>
      </div>
    </section>
  );
}
