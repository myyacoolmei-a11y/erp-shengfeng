import type { LucideIcon } from "lucide-react";

interface ComingSoonPanelProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoonPanel({ icon: Icon, title, description }: ComingSoonPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-warm-600/25 px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-champagne-500/10 text-champagne-400">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-warm-100">{title}</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-warm-500">{description}</p>
      <span className="mt-4 rounded-full bg-warm-600/15 px-3 py-1 text-xs font-medium text-warm-400">
        即將推出
      </span>
    </div>
  );
}
