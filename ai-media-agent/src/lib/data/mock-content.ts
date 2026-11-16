import type { MediaContent } from "@/types";

/**
 * 第一階段暫用的假資料。
 *
 * 刻意獨立成 `getRecentContent()` 這個函式，之後要改接 Supabase 時，
 * 只需要替換這個函式的實作（改為查詢 `media_content` 資料表），
 * 呼叫端（後台總覽頁）完全不需要修改。
 */
const MOCK_RECENT_CONTENT: MediaContent[] = [
  {
    id: "mock-1",
    title: "秋季新品上市宣傳片",
    description: "產品發表會現場側錄影片，需剪成三種社群版本",
    mediaType: "video",
    sourceUrl: null,
    status: "review",
    selectedStyle: "viral",
    brandId: "brand-1",
    createdAt: "2026-07-25T09:12:00+08:00",
    updatedAt: "2026-07-26T14:30:00+08:00",
  },
  {
    id: "mock-2",
    title: "門市開幕活動花絮",
    description: "現場拍攝的照片與短片，用於品牌官網與社群貼文",
    mediaType: "image",
    sourceUrl: null,
    status: "generating",
    selectedStyle: "brand",
    brandId: "brand-1",
    createdAt: "2026-07-24T18:40:00+08:00",
    updatedAt: "2026-07-25T08:05:00+08:00",
  },
  {
    id: "mock-3",
    title: "創辦人品牌理念口述",
    description: "創辦人親自錄製的一段語音，說明品牌創立初衷",
    mediaType: "audio",
    sourceUrl: null,
    status: "analyzing",
    selectedStyle: "story",
    brandId: "brand-2",
    createdAt: "2026-07-24T10:02:00+08:00",
    updatedAt: "2026-07-24T10:20:00+08:00",
  },
  {
    id: "mock-4",
    title: "產品使用教學系列",
    description: "示範產品正確使用方式的教學短片",
    mediaType: "video",
    sourceUrl: null,
    status: "published",
    selectedStyle: "tutorial",
    brandId: "brand-2",
    createdAt: "2026-07-22T15:00:00+08:00",
    updatedAt: "2026-07-23T11:11:00+08:00",
  },
  {
    id: "mock-5",
    title: "年度品牌回顧新聞稿",
    description: "整理過去一年重要里程碑，準備發布給媒體",
    mediaType: "text",
    sourceUrl: null,
    status: "draft",
    selectedStyle: "news",
    brandId: null,
    createdAt: "2026-07-21T09:30:00+08:00",
    updatedAt: "2026-07-21T09:30:00+08:00",
  },
];

export interface OverviewCounts {
  todayCreated: number;
  processing: number;
  awaitingReview: number;
  published: number;
}

/**
 * 取得最近內容列表。
 * 目前回傳假資料，之後可改為 `supabase.from("media_content").select("*")`。
 */
export async function getRecentContent(): Promise<MediaContent[]> {
  return MOCK_RECENT_CONTENT;
}

/**
 * 取得總覽卡片所需的統計數字。
 * 目前以假資料計算，之後可改為 Supabase 聚合查詢。
 */
export async function getOverviewCounts(): Promise<OverviewCounts> {
  const processingStatuses = new Set(["uploaded", "analyzing", "generating"]);

  return {
    todayCreated: 2,
    processing: MOCK_RECENT_CONTENT.filter((item) => processingStatuses.has(item.status)).length,
    awaitingReview: MOCK_RECENT_CONTENT.filter((item) => item.status === "review").length,
    published: MOCK_RECENT_CONTENT.filter((item) => item.status === "published").length,
  };
}
