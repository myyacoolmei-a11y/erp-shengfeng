import { Mic2, Clapperboard, Scissors, Palette, Search, MessagesSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: Mic2,
    title: "AI 記者",
    description: "理解素材內容，整理重點與敘事脈絡",
  },
  {
    icon: Clapperboard,
    title: "AI 導演",
    description: "規劃鏡頭節奏，決定最佳呈現方式",
  },
  {
    icon: Scissors,
    title: "AI 編輯",
    description: "自動剪輯素材，產生多種版本供選擇",
  },
  {
    icon: Palette,
    title: "AI 美編",
    description: "統一視覺風格，維持品牌一致調性",
  },
  {
    icon: Search,
    title: "AI SEO",
    description: "撰寫符合搜尋引擎邏輯的標題與描述",
  },
  {
    icon: MessagesSquare,
    title: "AI 小編",
    description: "產出社群文案，貼合不同平台語氣",
  },
];

export function FeatureGrid() {
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold text-warm-100 sm:text-3xl">
            六個 AI 角色，組成完整媒體團隊
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-warm-400 sm:text-base">
            從理解內容到發布上線，每個環節都有專屬 AI 角色負責。
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-warm-600/15 bg-ink-900/60 p-6 transition-colors hover:border-champagne-400/30"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-champagne-500/10 text-champagne-400">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-warm-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-warm-400">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
