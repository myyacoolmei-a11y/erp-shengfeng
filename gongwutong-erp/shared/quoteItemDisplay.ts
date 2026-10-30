/**
 * 報價明細「類別／品牌」顯示與儲存 mapping。
 *
 * quote_items 只有 category + brand，沒有獨立 serviceType。
 * 表單若把服務名稱（壁掛式保養、維修項目）填進 brand、category 再 fallback 成「其他」，
 * 正式報價單不應把「其他」印給客戶，也不該把服務名稱當成品牌。
 *
 * 不改商品主檔、不改 DB schema；只正規化 quote item 的 category/brand。
 */

const PLACEHOLDER_CATEGORIES = new Set(["", "其他", "其它", "未分類", "-", "—", "–"]);

/** 短名別名：只正規化同義詞，不把「壁掛式保養」收成「保養」。 */
const CATEGORY_ALIASES: Record<string, string> = {
  裝新機: "安裝新機",
  新裝: "安裝新機",
  維修: "維修項目",
  修理: "維修項目",
  追加: "追加項目",
  追加工程: "追加項目",
};

const KNOWN_AC_BRANDS = [
  "大金",
  "日立",
  "國際牌",
  "Panasonic",
  "panasonic",
  "三菱電機",
  "三菱重工",
  "三菱",
  "聲寶",
  "SAMPO",
  "Sampo",
  "格力",
  "東元",
  "富士通",
  "LG",
  "禾聯",
  "歌林",
  "大同",
  "MAXE",
  "良峰",
  "華菱",
  "冰點",
  "約克",
  "Carrier",
  "carrier",
  "萬士益",
  "中興",
  "北區",
  "Haier",
  "海爾",
  "TOSHIBA",
  "東芝",
  "Sharp",
  "夏普",
];

/** 報價表單可選／既有工程類別（完整比對，不用寬鬆關鍵字猜測）。 */
export const QUOTE_CATEGORY_SUGGESTIONS = [
  "壁掛式保養",
  "維修項目",
  "安裝新機",
  "追加項目",
  "安裝工程",
  "冷氣設備",
  "保養",
  "材料",
] as const;

/** 商品主檔既有分類選項，可能被寫進 quote_items.category。 */
const PRODUCT_CATEGORY_OPTIONS = [
  "分離式冷氣",
  "窗型冷氣",
  "多聯式空調",
  "冷暖氣機",
  "商用空調",
  "配件",
  "耗材",
] as const;

const KNOWN_SERVICE_CATEGORIES = new Set<string>([
  ...QUOTE_CATEGORY_SUGGESTIONS,
  ...PRODUCT_CATEGORY_OPTIONS,
  ...Object.values(CATEGORY_ALIASES),
]);

export type QuoteItemDisplaySource = {
  category?: string | null;
  itemCategory?: string | null;
  workType?: string | null;
  brand?: string | null;
  itemName?: string | null;
  notes?: string | null;
  model?: string | null;
};

export function trimField(value: unknown): string {
  return String(value ?? "").trim();
}

export function isPlaceholderCategory(value: unknown): boolean {
  return PLACEHOLDER_CATEGORIES.has(trimField(value));
}

export function canonicalizeCategory(raw: string): string {
  const text = trimField(raw);
  if (!text) return "";
  return CATEGORY_ALIASES[text] ?? text;
}

export function isKnownAcBrand(value: unknown): boolean {
  const text = trimField(value);
  if (!text) return false;
  const lower = text.toLowerCase();
  return KNOWN_AC_BRANDS.some((brand) => brand.toLowerCase() === lower);
}

/** 服務／工程分類名稱：只認明確清單與別名，不用關鍵字猜測。 */
export function isServiceCategoryLabel(value: unknown): boolean {
  const text = canonicalizeCategory(trimField(value));
  if (!text || isPlaceholderCategory(text) || isKnownAcBrand(text)) return false;
  return KNOWN_SERVICE_CATEGORIES.has(text);
}

function firstRealCategory(...values: unknown[]): string {
  for (const value of values) {
    const text = canonicalizeCategory(trimField(value));
    if (!text || isPlaceholderCategory(text) || isKnownAcBrand(text)) continue;
    return text;
  }
  return "";
}

/** 正式報價單「類別」欄：不印「其他」；服務名稱可從誤存的 brand 還原。 */
export function displayQuoteItemCategory(item: QuoteItemDisplaySource | null | undefined): string {
  if (!item) return "—";

  const fromCategory = firstRealCategory(item.category, item.itemCategory, item.workType);
  if (fromCategory) return fromCategory;

  const brand = canonicalizeCategory(trimField(item.brand));
  if (brand && isServiceCategoryLabel(brand)) return brand;

  return "—";
}

/** 正式報價單「品牌」欄：只有真正品牌才顯示；服務名稱與空值顯示「—」。 */
export function displayQuoteItemBrand(item: QuoteItemDisplaySource | null | undefined): string {
  if (!item) return "—";
  const brand = trimField(item.brand);
  if (!brand || brand === "-" || brand === "—" || brand === "–") return "—";
  if (isServiceCategoryLabel(brand)) return "—";
  return brand;
}

/**
 * 新增／編輯報價儲存前：若服務分類被填進 brand、category 卻是「其他」，對調回來。
 * 不改商品主檔。DB category 仍允許 fallback「其他」（列印層會藏起來）。
 */
export function normalizeQuoteItemCategoryBrand(item: {
  category?: string | null;
  brand?: string | null;
}): { category: string; brand: string } {
  let category = canonicalizeCategory(trimField(item.category));
  let brand = trimField(item.brand);
  if (brand === "-" || brand === "—" || brand === "–") brand = "";

  if (isServiceCategoryLabel(brand) && !isKnownAcBrand(brand)) {
    if (isPlaceholderCategory(category)) category = canonicalizeCategory(brand);
    brand = "";
  }

  if (isPlaceholderCategory(category)) category = "其他";
  return { category, brand };
}
