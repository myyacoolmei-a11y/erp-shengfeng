import type { ContentStatus, EditStyle, MediaType } from "@/types";

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "草稿",
  uploaded: "已上傳",
  analyzing: "AI 理解中",
  generating: "AI 產生中",
  review: "待確認",
  published: "已發布",
  failed: "處理失敗",
};

export const CONTENT_STATUS_BADGE_CLASS: Record<ContentStatus, string> = {
  draft: "bg-warm-600/15 text-warm-400",
  uploaded: "bg-warm-600/15 text-warm-300",
  analyzing: "bg-champagne-500/15 text-champagne-300",
  generating: "bg-champagne-500/15 text-champagne-300",
  review: "bg-blush-500/15 text-blush-400",
  published: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-red-500/15 text-red-400",
};

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  video: "影片",
  image: "照片",
  audio: "語音",
  text: "文字",
};

export const EDIT_STYLE_OPTIONS: Array<{ value: EditStyle; label: string; description: string }> = [
  { value: "auto", label: "AI 自動判斷", description: "由 AI 依內容特性自動選擇最合適的剪輯風格" },
  { value: "viral", label: "爆款版", description: "節奏明快、強調亮點，適合社群傳播" },
  { value: "brand", label: "品牌版", description: "維持品牌調性與識別，適合正式露出" },
  { value: "story", label: "故事版", description: "以敘事鋪陳情緒，適合品牌故事或形象片" },
  { value: "tutorial", label: "教學版", description: "步驟清楚、重點明確，適合教學或說明內容" },
  { value: "news", label: "新聞版", description: "客觀陳述、重點前置，適合新聞稿或公告" },
];
