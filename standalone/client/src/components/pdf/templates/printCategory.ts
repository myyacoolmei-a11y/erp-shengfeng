/**
 * 報價／派工列印用的類別顯示 mapping。
 * 不改寫資料庫或 API，只決定 PDF 上要印哪一個字。
 *
 * 資料來源優先序：報價項目本身的 category（quote_items.category）。
 * 表單從商品主檔帶入時，常把產品分類（分離式冷氣／其他）寫進這個欄位；
 * 存檔時空值又會被寫成「其他」。因此「其他」與商品分類不應蓋過真正的工程類別。
 */

const WORK_TYPES = ["安裝新機", "追加項目", "維修", "保養", "材料"] as const;

const ALIASES: Record<string, string> = {
  裝新機: "安裝新機",
  新裝: "安裝新機",
  安裝: "安裝新機",
  追加: "追加項目",
  追加工程: "追加項目",
  配管工程: "材料",
  冷媒工程: "材料",
  配件: "材料",
  耗材: "材料",
  移機: "維修",
  拆機: "維修",
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
  if (/維修/.test(blob)) return "維修";
  if (/保養/.test(blob)) return "保養";
  if (/銅管|管徑|材料/.test(blob)) return "材料";
  return "";
}

/** 列印用工程類別。有實際 category 就顯示它，不用「其他」蓋掉。 */
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
  const aliased = ALIASES[raw] ?? raw;
  if ((WORK_TYPES as readonly string[]).includes(aliased)) return aliased;

  const inferred = inferFromText(`${item.itemName ?? ""} ${item.notes ?? ""} ${item.model ?? ""}`);
  if (inferred) return inferred;

  if (PRODUCT_CATALOG_TYPES.has(raw)) {
    return raw === "配件" || raw === "耗材" ? "材料" : "安裝新機";
  }

  if (aliased && aliased !== "其他") return aliased;
  if (item.brand || item.model || item.itemName) return "安裝新機";
  return "";
}
