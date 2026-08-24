/**
 * Quote item category/brand mapping — run: npx tsx scripts/test-quote-item-display.ts
 */
import {
  displayQuoteItemBrand,
  displayQuoteItemCategory,
  isServiceCategoryLabel,
  normalizeQuoteItemCategoryBrand,
} from "../shared/quoteItemDisplay.ts";
import { buildQuotationHtml } from "../client/src/components/pdf/templates/QuotationTemplate.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

(globalThis as any).window = { location: { origin: "" } };

function tableRows(html: string): Array<{ cat: string; brand: string; item: string }> {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => {
    const cat = m[1].match(/col-cat">([^<]*)/)?.[1] ?? "";
    const brand = m[1].match(/col-brand">([^<]*)/)?.[1] ?? "";
    const item = m[1].match(/col-item">([^<]*)/)?.[1] ?? "";
    return { cat, brand, item };
  });
}

const serviceA = { category: "其他", brand: "壁掛式保養", itemName: "S1", quantity: 1, unit: "式", unitPrice: 1500, subtotal: 1500 };
const serviceB = { category: "其他", brand: "維修項目", itemName: "冷媒填充＋抓漏", quantity: 1, unit: "式", unitPrice: 1500, subtotal: 1500 };
const equipment = { category: "冷氣設備", brand: "大金", itemName: "壁掛分離式", model: "RX-A", quantity: 1, unit: "台", unitPrice: 32800, subtotal: 32800 };
const install = { category: "安裝新機", brand: "日立", itemName: "室外機", model: "RAS-22", quantity: 1, unit: "台", unitPrice: 2800, subtotal: 2800 };
const unknownOther = { category: "其他", brand: "", itemName: "現場雜項", quantity: 1, unit: "式", unitPrice: 500, subtotal: 500 };

// 1) 純服務
assert(displayQuoteItemCategory(serviceA) === "壁掛式保養", "service A category");
assert(displayQuoteItemBrand(serviceA) === "—", "service A brand");
assert(displayQuoteItemCategory(serviceB) === "維修項目", "service B category");
assert(displayQuoteItemBrand(serviceB) === "—", "service B brand");

// 2) 純設備
assert(displayQuoteItemCategory(equipment) === "冷氣設備", "equipment category");
assert(displayQuoteItemBrand(equipment) === "大金", "equipment brand");

// 3) 其他且無法推斷 → —
assert(displayQuoteItemCategory(unknownOther) === "—", "其他 without real category must be —");
assert(displayQuoteItemCategory({ category: "其他", itemName: "冷媒填充＋抓漏" }) === "—", "must not guess from item name");

// 不要把真正品牌／含工程字的廠牌名當成服務類別
assert(isServiceCategoryLabel("大金") === false, "大金 is not a service category");
assert(isServiceCategoryLabel("日立") === false, "日立 is not a service category");
assert(isServiceCategoryLabel("工程牌") === false, "must not regex-match 工程");
assert(displayQuoteItemBrand({ brand: "工程牌" }) === "工程牌", "unknown brand stays brand");
assert(isServiceCategoryLabel("壁掛式保養") === true, "壁掛式保養 is a listed service category");
assert(isServiceCategoryLabel("維修") === true, "維修 alias");

const saved = normalizeQuoteItemCategoryBrand({ category: "其他", brand: "壁掛式保養" });
assert(saved.category === "壁掛式保養" && saved.brand === "", `save swap got ${JSON.stringify(saved)}`);
const keepDaikin = normalizeQuoteItemCategoryBrand({ category: "冷氣設備", brand: "大金" });
assert(keepDaikin.category === "冷氣設備" && keepDaikin.brand === "大金", `keep equipment got ${JSON.stringify(keepDaikin)}`);
const keepUnknownBrand = normalizeQuoteItemCategoryBrand({ category: "其他", brand: "工程牌" });
assert(keepUnknownBrand.category === "其他" && keepUnknownBrand.brand === "工程牌", `must not steal unknown brand ${JSON.stringify(keepUnknownBrand)}`);

const mixedHtml = buildQuotationHtml({
  id: 1,
  createdAt: "2026-08-24",
  customerName: "測試",
  taxType: "未稅",
  items: [serviceA, serviceB, equipment, install, unknownOther],
});
const rows = tableRows(mixedHtml);
assert(rows.length === 5, `expected 5 rows, got ${rows.length}`);
assert(rows[0].cat === "壁掛式保養" && rows[0].brand === "—" && rows[0].item === "S1", `row1 ${JSON.stringify(rows[0])}`);
assert(rows[1].cat === "維修項目" && rows[1].brand === "—" && rows[1].item === "冷媒填充＋抓漏", `row2 ${JSON.stringify(rows[1])}`);
assert(rows[2].cat === "冷氣設備" && rows[2].brand === "大金" && rows[2].item === "壁掛分離式", `row3 ${JSON.stringify(rows[2])}`);
assert(rows[3].cat === "安裝新機" && rows[3].brand === "日立" && rows[3].item === "室外機", `row4 ${JSON.stringify(rows[3])}`);
assert(rows[4].cat === "—" && rows[4].brand === "—", `row5 empty-other ${JSON.stringify(rows[4])}`);
assert(rows.every((r) => r.cat !== ""), "category cells must not be empty");
assert(rows.every((r) => r.cat !== "其他"), "must not print 其他");
assert(!mixedHtml.includes(">其他<"), "PDF must not print 其他 as a cell");

const quotesSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../client/src/pages/quotes.tsx"),
  "utf8",
);
assert(quotesSrc.includes("<Label className=\"text-xs\">類別</Label>"), "quote form must show 類別 label");
assert(quotesSrc.includes("QUOTE_CATEGORY_SUGGESTIONS"), "quote form must offer category suggestions");
assert(quotesSrc.includes("list={`quote-item-category-suggestions-${index}`}"), "category input must be selectable via datalist");

if (process.exitCode) {
  console.error("quote item display tests failed");
} else {
  console.log("quote item display tests passed");
  console.log(rows.map((r, i) => `${i + 1}. 類別=${r.cat} 品牌=${r.brand} 品項=${r.item}`).join("\n"));
}
