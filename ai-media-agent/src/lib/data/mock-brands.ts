import type { Brand } from "@/types";

/**
 * 第一階段暫用的品牌假資料。
 * 之後可改為 `supabase.from("brands").select("*")`，呼叫端不需修改。
 */
const MOCK_BRANDS: Brand[] = [
  {
    id: "brand-1",
    name: "尚豐生活選物",
    logoUrl: null,
    primaryColor: "#c6a25e",
    tone: "溫暖、專業、值得信賴",
    createdAt: "2026-01-10T00:00:00+08:00",
  },
  {
    id: "brand-2",
    name: "本然茶語",
    logoUrl: null,
    primaryColor: "#8a7f6c",
    tone: "沉穩、細膩、有故事感",
    createdAt: "2026-03-02T00:00:00+08:00",
  },
];

/**
 * 取得品牌列表。目前回傳假資料，之後可改為 Supabase 查詢。
 */
export async function getBrands(): Promise<Brand[]> {
  return MOCK_BRANDS;
}
