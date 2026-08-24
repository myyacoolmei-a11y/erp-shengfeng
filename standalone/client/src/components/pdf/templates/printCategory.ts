/**
 * 報價／派工列印用的類別顯示 mapping。
 * 不改寫資料庫或 API，只決定 PDF 上要印哪一個字。
 *
 * 可顯示的工程類別：
 * 安裝新機、追加項目、維修項目、保養、材料、其他
 *
 * 表單／商品主檔常把「其他」或產品分類寫進 quote_items.category。
 * 有更明確的實際類別時不要全部印成「其他」；
 * 推斷不出來且資料本身就是「其他」時，才顯示「其他」。
 */

const WORK_TYPES = ["安裝新機", "追加項目", "維修項目", "保養", "材料", "其他"] as const;

const ALIASES: Record<string, string> = {
  裝新機: "安裝新機",
  新裝: "安裝新機",
  安裝: "安裝新機",
  追加: "追加項目",
  追加工程: "追加項目",
  維修: "維修項目",
  修理: "維修項目",
  配管工程: "材料",
  冷媒工程: "材料",
  配件: "材料",
  耗材: "材料",
  移機: "維修項目",
  拆機: "維修項目",
};

const PRODUCT_CATALOG_TYPES = new Set([
  "分離式冷氣",
  "窗型冷氣",
  "多聯式空調",
  "冷暖氣機",
  "商用空調",
  "配件",
  "耗材",
]);

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function inferFromText(blob: string): string {
  if (/追加/.test(blob)) return "追加項目";
  if (/維修|修理|移機|拆機/.test(blob)) return "維修項目";
  if (/保養/.test(blob)) return "保養";
  if (/銅管|管徑|材料/.test(blob)) return "材料";
  if (/安裝|新機|分離式|窗型/.test(blob)) return "安裝新機";
  return "";
}

function canonicalize(raw: string): string {
  if (!raw) return "";
  return ALIASES[raw] ?? raw;
}

/** 列印用工程類別。顯示實際資料，不把所有項目都印成「其他」。 */
export function displayQuoteItemCategory(item: {
  category?: string | null;
  itemCategory?: string | null;
  workType?: string | null;
  itemName?: string | null;
  notes?: string | null;
  brand?: string | null;
  model?: string | null;
} | null | undefined): string {
  if (!item) return "";

  const raw = firstNonEmpty(item.category, item.itemCategory, item.workType);
  const aliased = canonicalize(raw);
  const known = (WORK_TYPES as readonly string[]).includes(aliased);

  if (known && aliased !== "其他") return aliased;

  const inferred = inferFromText(`${item.itemName ?? ""} ${item.notes ?? ""} ${item.model ?? ""}`);
  if (inferred) return inferred;

  if (PRODUCT_CATALOG_TYPES.has(raw) || PRODUCT_CATALOG_TYPES.has(aliased)) {
    return raw === "配件" || raw === "耗材" || aliased === "材料" ? "材料" : "安裝新機";
  }

  if (aliased === "其他") return "其他";
  if (aliased) return aliased;
  return "";
}
