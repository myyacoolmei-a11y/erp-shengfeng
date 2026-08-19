import { UploadCloud, BrainCircuit, Layers, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StepItem {
  icon: LucideIcon;
  step: string;
  title: string;
  description: string;
}

const STEPS: StepItem[] = [
  {
    icon: UploadCloud,
    step: "01",
    title: "上傳素材",
    description: "上傳影片、照片，或直接錄一段語音描述",
  },
  {
    icon: BrainCircuit,
    step: "02",
    title: "AI 理解內容",
    description: "AI 自動分析素材重點、語意與情境",
  },
  {
    icon: Layers,
    step: "03",
    title: "產生三個版本",
    description: "依不同風格產出三個剪輯與文案提案",
  },
  {
    icon: Send,
    step: "04",
    title: "選擇並發布",
    description: "確認滿意的版本後，一鍵發布上線",
  },
];

export function WorkflowSteps() {
  return (
    <section id="workflow" className="px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold text-warm-100 sm:text-3xl">操作流程</h2>
          <p className="mt-3 text-sm leading-relaxed text-warm-400 sm:text-base">
            四個步驟，從素材到發布一氣呵成。
          </p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, step, title, description }, index) => (
            <li
              key={step}
              className="relative rounded-2xl border border-warm-600/15 bg-ink-900/60 p-6"
            >
              <span className="text-xs font-medium tracking-widest text-champagne-500/70">
                STEP {step}
              </span>
              <div className="mt-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blush-400/10 text-blush-400">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-warm-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-warm-400">{description}</p>

              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute right-[-0.55rem] top-1/2 hidden h-px w-4 -translate-y-1/2 bg-warm-600/25 lg:block"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
