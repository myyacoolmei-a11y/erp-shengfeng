import { ImagePlus, Mic, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MediaType } from "@/types";

export type CreateMediaSource = Extract<MediaType, "video" | "image" | "audio">;

interface SourceOption {
  value: CreateMediaSource;
  label: string;
  icon: LucideIcon;
}

const SOURCE_OPTIONS: SourceOption[] = [
  { value: "video", label: "上傳影片", icon: Video },
  { value: "image", label: "上傳照片", icon: ImagePlus },
  { value: "audio", label: "錄製或上傳語音", icon: Mic },
];

interface MediaSourceTabsProps {
  value: CreateMediaSource;
  onChange: (value: CreateMediaSource) => void;
}

export function MediaSourceTabs({ value, onChange }: MediaSourceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="選擇素材類型"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {SOURCE_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => {
        const isActive = optionValue === value;

        return (
          <button
            key={optionValue}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(optionValue)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
              isActive
                ? "border-champagne-400/60 bg-champagne-500/10"
                : "border-warm-600/15 bg-ink-900/60 hover:border-warm-600/30"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isActive ? "bg-champagne-500/20 text-champagne-300" : "bg-ink-800 text-warm-400"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className={`text-sm font-medium ${isActive ? "text-warm-100" : "text-warm-300"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
