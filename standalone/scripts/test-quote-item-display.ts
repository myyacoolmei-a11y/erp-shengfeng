/**
 * Quote item category/brand mapping — run: npx tsx scripts/test-quote-item-display.ts
 */
import {
  displayQuoteItemBrand,
  displayQuoteItemCategory,
  normalizeQuoteItemCategoryBrand,
} from "../shared/quoteItemDisplay.ts";
import { buildQuotationHtml } from "../client/src/components/pdf/templates/QuotationTemplate.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

(globalThis as any).window = { location: { origin: "" } };

const row1 = { category: "其他", brand: "壁掛式保養", itemName: "S1", quantity: 1, unit: "式", unitPrice: 1500, subtotal: 1500 };
const row2 = { category: "其他", brand: "維修項目", itemName: "冷媒填充＋抓漏", quantity: 1, unit: "式", unitPrice: 1500, subtotal: 1500 };

assert(displayQuoteItemCategory(row1) === "壁掛式保養", `row1 category got ${displayQuoteItemCategory(row1)}`);
assert(displayQuoteItemBrand(row1) === "—", `row1 brand got ${displayQuoteItemBrand(row1)}`);
assert(displayQuoteItemCategory(row2) === "維修項目", `row2 category got ${displayQuoteItemCategory(row2)}`);
assert(displayQuoteItemBrand(row2) === "—", `row2 brand got ${displayQuoteItemBrand(row2)}`);

assert(displayQuoteItemCategory({ category: "其他", itemName: "S1" }) === "—", "bare 其他 should not print");
assert(displayQuoteItemBrand({ brand: "大金" }) === "大金", "大金 is a brand");
assert(displayQuoteItemCategory({ category: "安裝新機", brand: "日立" }) === "安裝新機", "keep real work type");
assert(displayQuoteItemBrand({ category: "安裝新機", brand: "日立" }) === "日立", "keep real brand");
assert(displayQuoteItemCategory({ category: "維修" }) === "維修項目", "維修 alias");

const saved = normalizeQuoteItemCategoryBrand({ category: "其他", brand: "壁掛式保養" });
assert(saved.category === "壁掛式保養" && saved.brand === "", `save swap got ${JSON.stringify(saved)}`);

const savedBrand = normalizeQuoteItemCategoryBrand({ category: "", brand: "大金" });
assert(savedBrand.category === "其他" && savedBrand.brand === "大金", `keep brand got ${JSON.stringify(savedBrand)}`);

const html = buildQuotationHtml({
  id: 1,
  createdAt: "2026-08-24",
  customerName: "測試",
  taxType: "未稅",
  items: [row1, row2],
});
assert(!html.includes(">其他<"), "PDF must not print 其他 as a cell");
assert(html.includes("壁掛式保養"), "PDF must print 壁掛式保養");
assert(html.includes("維修項目"), "PDF must print 維修項目");
assert(html.includes("S1"), "PDF must print item S1");
assert(html.includes("冷媒填充＋抓漏"), "PDF must print 冷媒填充＋抓漏");

const brandCells = [...html.matchAll(/col-brand">([^<]*)</g)].map((m) => m[1]);
assert(brandCells.every((c) => c === "—"), `brand cells should be —, got ${brandCells.join("|")}`);

if (process.exitCode) {
  console.error("quote item display tests failed");
} else {
  console.log("quote item display tests passed");
}
