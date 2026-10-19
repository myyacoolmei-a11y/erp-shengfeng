import Link from "next/link";
import { FileText, ImagePlus, Mic, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/dashboard/create?source=video", label: "上傳影片", icon: Video },
  { href: "/dashboard/create?source=image", label: "上傳照片", icon: ImagePlus },
  { href: "/dashboard/create?source=audio", label: "語音描述", icon: Mic },
  { href: "/dashboard/create?source=text", label: "建立文章", icon: FileText },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-col items-center gap-2.5 rounded-2xl border border-warm-600/15 bg-ink-900/60 px-4 py-5 text-center transition-colors hover:border-champagne-400/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne-500/10 text-champagne-400">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-medium text-warm-200">{label}</span>
        </Link>
      ))}
    </div>
  );
}
