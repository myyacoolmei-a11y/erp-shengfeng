import { FileText, ImageIcon, Mic, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MediaContent, MediaType } from "@/types";
import { CONTENT_STATUS_BADGE_CLASS, CONTENT_STATUS_LABEL } from "@/lib/content-options";

interface RecentContentListProps {
  items: MediaContent[];
}

const MEDIA_TYPE_ICON: Record<MediaType, LucideIcon> = {
  video: Video,
  image: ImageIcon,
  audio: Mic,
  text: FileText,
};

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}

export function RecentContentList({ items }: RecentContentListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-warm-600/25 px-6 py-12 text-center text-sm text-warm-500">
        目前還沒有任何內容，開始建立第一筆內容吧。
      </div>
    );
  }

  return (
    <ul className="divide-y divide-warm-600/10 overflow-hidden rounded-2xl border border-warm-600/15 bg-ink-900/60">
      {items.map((item) => {
        const Icon = MEDIA_TYPE_ICON[item.mediaType];

        return (
          <li key={item.id} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-warm-300">
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-warm-100">{item.title}</p>
              <p className="truncate text-xs text-warm-500">{item.description}</p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${CONTENT_STATUS_BADGE_CLASS[item.status]}`}
              >
                {CONTENT_STATUS_LABEL[item.status]}
              </span>
              <span className="text-[11px] text-warm-600">{formatDate(item.updatedAt)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
