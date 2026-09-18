import type { ParsedVoiceItem, ParsedVoiceQuote } from "../../../../shared/voice/types.ts";

const PHONE_RE = /(?:0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}|09\d{2}[-\s]?\d{3}[-\s]?\d{3})/;
const MODEL_RE = /\b[A-Z]{1,4}[-/][A-Z0-9][A-Z0-9/-]*/i;
const KW_RE = /(\d+(?:\.\d+)?)\s*(?:KW|kw|Kw|千瓦)/;
const EXPLICIT_ADDRESS_RE = /地址[：:]\s*([^，,\n]+)/;
const REGION_ADDRESS_RE =
  /((?:台)?(?:北|新北|桃園|臺中|台中|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江|基隆|新竹|苗栗|高雄|台南|臺南)[市縣]?[\u4e00-\u9fff]{0,8}(?:鄉|鎮|市|區|里|村)?)/;
const STREET_ADDRESS_RE =
  /([\u4e00-\u9fff]{1,8}(?:路|街|巷|弄)\d+(?:之\d+)?(?:號|号)?)/;

const HVAC_BRANDS = [
  "冰點", "日立", "大金", "格力", "三菱", "松下", "Panasonic", "LG", "聲寶", "SAMPO",
  "格力", "海爾", "Haier", "東元", "TECO", "華菱", "Carrier", "約克", "York",
];

const HVAC_TYPES = ["暖機", "冷氣", "分離式", "窗型", "吊隱", "商用機", "吸顶式", "吸頂式", "柜机", "櫃機"];

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[，,、；;]/g, "，")
    .trim();
}

function splitSegments(text: string): string[] {
  return normalizeText(text)
    .split(/[\n，]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseQuantityToken(raw: string | undefined, fallback = 1): number {
  if (!raw) return fallback;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return CN_NUM[t] ?? fallback;
}

function extractPhone(text: string): string {
  return text.match(PHONE_RE)?.[0]?.replace(/\s/g, "") ?? "";
}

function stripExtracted(text: string, extracted: string[]): string {
  let rest = text;
  for (const part of extracted) {
    if (!part) continue;
    rest = rest.replace(part, " ");
  }
  return rest.replace(/\s+/g, " ").trim();
}

/** Only county/city/town — never the full transcript. */
export function extractQuoteAddress(text: string): string {
  const explicit = text.match(EXPLICIT_ADDRESS_RE);
  if (explicit?.[1]) {
    const value = explicit[1].trim();
    return value.length <= 40 ? value : value.slice(0, 40);
  }

  for (const segment of splitSegments(text)) {
    if (segment.length > 24) continue;
    const region = segment.match(REGION_ADDRESS_RE);
    if (region?.[1] && region[1].length <= 20) {
      return region[1].trim();
    }
  }

  const region = text.match(REGION_ADDRESS_RE);
  if (region?.[1] && region[1].length <= 20) {
    return region[1].trim();
  }

  const street = text.match(STREET_ADDRESS_RE);
  if (street?.[1] && street[1].length <= 24) {
    return street[1].trim();
  }

  return "";
}

/** XX客戶 / 客戶XX / XX要 / 店名 */
export function extractQuoteCustomerName(text: string): string {
  const patterns: RegExp[] = [
    /([\u4e00-\u9fffA-Za-z0-9（）()·\s]{2,20}?)客戶/,
    /客戶[：:]?\s*([\u4e00-\u9fffA-Za-z0-9（）()·\s]{2,20}?)(?=要|的|，|,|一台|一組|一臺|一樣|$)/,
    /([\u4e00-\u9fffA-Za-z0-9（）()·\s]{2,20}?)要(?:一台|一臺|一組|一個|報價|安裝|裝)/,
    /([\u4e00-\u9fffA-Za-z0-9（）()·\s]{2,16}(?:店|公司|行|館|中心|大樓|飯店|酒店|餐廳|餐廳|工廠|學校|醫院|診所|幼兒園|補習班))/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    const name = m?.[1]?.trim();
    if (!name) continue;
    if (/^(一台|一組|報價|安裝|裝|客戶|客户)$/.test(name)) continue;
    if (REGION_ADDRESS_RE.test(name)) continue;
    if (KW_RE.test(name) && name.length < 8) continue;
    return name.replace(/[，,。．.]+$/g, "").trim();
  }

  for (const segment of splitSegments(text)) {
    if (segment.length < 2 || segment.length > 20) continue;
    if (PHONE_RE.test(segment)) continue;
    if (REGION_ADDRESS_RE.test(segment)) continue;
    if (MODEL_RE.test(segment)) continue;
    if (KW_RE.test(segment)) continue;
    if (/安裝|安装|報價|报价|一台|一組|暖機|冷氣/.test(segment)) continue;
    if (/(?:店|公司|行|館|中心)$/.test(segment)) return segment;
  }

  return "";
}

function detectBrand(text: string): string {
  for (const brand of HVAC_BRANDS) {
    if (text.includes(brand)) return brand;
  }
  return "";
}

function detectHvacType(text: string): string {
  for (const type of [...HVAC_TYPES].sort((a, b) => b.length - a.length)) {
    if (text.includes(type)) return type;
  }
  return "冷氣";
}

function extractExplicitPrice(text: string): number | undefined {
  const wan = text.match(/(\d+(?:\.\d+)?)\s*萬/);
  if (wan) return Math.round(parseFloat(wan[1]) * 10000);

  const ntd = text.match(/(?:NT\$?\s*|新台幣\s*|價格\s*|報價\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\s*元)?/i);
  if (ntd) return parseInt(ntd[1].replace(/,/g, ""), 10);

  const yuan = text.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*元/);
  if (yuan) return parseInt(yuan[1].replace(/,/g, ""), 10);

  return undefined;
}

function extractQuantity(text: string): { quantity: number; unit: string } {
  const m = text.match(/([一二三四五六七八九十两兩\d]+)\s*(台|组|組|式|个|個|套)/);
  if (m) {
    return { quantity: parseQuantityToken(m[1]), unit: m[2] === "组" || m[2] === "組" ? "組" : (m[2] ?? "台") };
  }
  if (/一台|一臺/.test(text)) return { quantity: 1, unit: "台" };
  if (/兩台|两台|二台/.test(text)) return { quantity: 2, unit: "台" };
  if (/一組|一组/.test(text)) return { quantity: 1, unit: "組" };
  return { quantity: 1, unit: "台" };
}

function buildItemName(brand: string, kw: string, hvacType: string, model: string): string {
  const parts = [brand, kw ? `${kw}KW` : "", hvacType, model].filter(Boolean);
  if (parts.length === 0) return "";
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (joined.includes("暖機") || joined.includes("冷氣") || joined.includes("分離式")) {
    return joined;
  }
  return `${joined}`.trim();
}

function buildProjectTitle(itemName: string, brand: string, kw: string, hvacType: string): string {
  const explicit = itemName || buildItemName(brand, kw, hvacType, "");
  if (!explicit) return "";
  if (/工程/.test(explicit)) return explicit;
  if (/安裝|安装/.test(explicit)) {
    return explicit.endsWith("工程") ? explicit : `${explicit}工程`;
  }
  return `${explicit}安裝工程`;
}

function extractQuoteItem(text: string): ParsedVoiceItem | null {
  const brand = detectBrand(text);
  const kwMatch = text.match(KW_RE);
  const kw = kwMatch?.[1] ?? "";
  const hvacType = detectHvacType(text);
  const modelMatch = text.match(MODEL_RE);
  const model = modelMatch?.[0] ?? "";
  const { quantity, unit } = extractQuantity(text);
  const unitPrice = extractExplicitPrice(text);

  if (!brand && !kw && !model && !/(暖機|冷氣|分離式|窗型)/.test(text)) {
    return null;
  }

  const itemName = buildItemName(brand, kw, hvacType, model) || model || brand;
  if (!itemName) return null;

  return {
    brand: brand || undefined,
    itemName,
    model: model || undefined,
    quantity,
    unit,
    category: "裝新機",
    inputMode: "manual",
    matched: false,
    unitPrice,
  };
}

function extractExplicitProjectTitle(text: string): string {
  const m = text.match(/(?:工程名稱|工程名称|工程)[：:]\s*([^\n，,]+)/);
  return m?.[1]?.trim() ?? "";
}

/** Parse voice transcript into structured quote fields. */
export function parseQuoteVoice(text: string): ParsedVoiceQuote {
  const normalized = normalizeText(text);
  const phone = extractPhone(normalized);
  const address = extractQuoteAddress(normalized);
  const customerName = extractQuoteCustomerName(normalized);

  let item = extractQuoteItem(normalized);
  if (!item) {
    for (const segment of splitSegments(normalized)) {
      item = extractQuoteItem(segment);
      if (item) break;
    }
  }

  const brand = item?.brand ?? detectBrand(normalized);
  const kw = normalized.match(KW_RE)?.[1] ?? "";
  const hvacType = detectHvacType(normalized);
  const explicitTitle = extractExplicitProjectTitle(normalized);
  const title =
    explicitTitle ||
    buildProjectTitle(item?.itemName ?? "", brand, kw, hvacType) ||
    (customerName ? `${customerName} 報價` : undefined);

  const items: ParsedVoiceItem[] = item
    ? [item]
    : [{
        brand: brand || undefined,
        itemName: buildItemName(brand, kw, hvacType, "") || "待確認設備",
        quantity: 1,
        unit: "台",
        category: "裝新機",
        inputMode: "manual",
        matched: false,
      }];

  const usedParts = [phone, address, customerName, title ?? "", item?.itemName ?? "", item?.model ?? ""].filter(Boolean);
  let remainder = stripExtracted(normalized, usedParts);
  remainder = remainder
    .replace(/^地址[：:]\s*/g, "")
    .replace(/^[，,\s]+|[，,\s]+$/g, "")
    .trim();
  const notes =
    remainder &&
    remainder.length >= 4 &&
    remainder.length < normalized.length * 0.7 &&
    !/^(客戶|客户|要一台|一台)$/.test(remainder)
      ? remainder
      : undefined;

  return {
    formType: "quote",
    customerName: customerName || undefined,
    phone: phone || undefined,
    address: address || undefined,
    title,
    description: undefined,
    notes,
    items,
  };
}
