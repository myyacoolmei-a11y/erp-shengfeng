/**
 * Quotation A4 table flow — run: npx tsx scripts/test-quote-a4-row-flow.ts
 */
import { buildQuotationHtml } from "../client/src/components/pdf/templates/QuotationTemplate.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

(globalThis as any).window = { location: { origin: "" } };

const name8 = "壁掛冷氣保養服務";
const name20 = "壁掛分離式變頻冷暖超長品項名稱測試自動換";
const name40 = "壁掛分離式變頻冷暖超長品項名稱測試自動換行顯示效果含基本安裝與銅管配管工程服務項";
const model20 = "MSZ-AP35VG-LONG20MDL";
const notes50 = "本項含五米銅管電線訊號線基本安裝工資及高空作業補助，施工前請確認現場管線路徑與電源位置保留施工空間。";

assert([...name8].length === 8, `name8=${[...name8].length}`);
assert([...name20].length === 20, `name20=${[...name20].length}`);
assert([...name40].length === 40, `name40=${[...name40].length}`);
assert(model20.length === 20, `model20=${model20.length}`);
assert([...notes50].length === 50, `notes50=${[...notes50].length}`);

const html = buildQuotationHtml({
  id: 9,
  createdAt: "2026-09-02",
  customerName: "列高壓力測試",
  taxType: "未稅",
  items: [
    { category: "保養", brand: "—", itemName: "吊隱式保養", model: "", quantity: 2, unit: "台", unitPrice: 1, subtotal: 2, notes: "" },
    { category: "安裝新機", brand: "冰點", itemName: "冰點冷氣變頻1級吊隱式", model: "HFC-80", quantity: 1, unit: "台", unitPrice: 1, subtotal: 1, notes: "" },
    { category: "安裝新機", brand: "聲寶", itemName: name8, model: "A1", quantity: 1, unit: "式", unitPrice: 1, subtotal: 1, notes: "短備註" },
    { category: "安裝新機", brand: "聲寶", itemName: name20, model: "A2", quantity: 1, unit: "台", unitPrice: 1, subtotal: 1, notes: "含基本安裝" },
    { category: "追加項目", brand: "三菱重工", itemName: name40, model: model20, quantity: 1, unit: "台", unitPrice: 1, subtotal: 1, notes: notes50 },
    {
      category: "其他",
      brand: "—",
      itemName: "移機2/4銅管基本安裝服務\n含5米銅管、電線訊號",
      model: "",
      quantity: 1,
      unit: "式",
      unitPrice: 1,
      subtotal: 1,
      notes: "含5米銅管、電線訊號",
    },
  ],
});

const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
assert(rows.length === 6, `expected 6 rows, got ${rows.length}`);

function cell(row: string, cls: string): string {
  const td = row.match(new RegExp(`<td class="[^"]*${cls}[^"]*">([\\s\\S]*?)</td>`))?.[1] ?? "";
  return td.replace(/<div class="cell-text">/g, "").replace(/<\/div>/g, "");
}

assert(cell(rows[0], "col-cat") === "保養", "保養 category");
assert(cell(rows[0], "col-item").includes("吊隱式保養"), "吊隱式保養 stays in 品項");
assert(!/<t[hd][^>]*col-brand/.test(html), "brand column removed");
assert(!/<th[^>]*>品牌<\/th>/.test(html), "no 品牌 header");
assert(cell(rows[0], "col-qty") === "2", "qty 2");
assert(cell(rows[0], "col-unit") === "台", "unit 台");
assert(cell(rows[1], "col-item").includes("冰點冷氣變頻1級吊隱式"), "bingdian wraps as one field");
assert(cell(rows[2], "col-item").includes(name8), "8-char item");
assert(cell(rows[3], "col-item").includes(name20), "20-char item");
assert(cell(rows[4], "col-item").includes(name40), "40-char item");
assert(cell(rows[4], "col-model").includes(model20), "20-char model");
assert(cell(rows[4], "col-notes").includes(notes50), "50-char notes");

const yijiItem = cell(rows[5], "col-item");
const yijiNotes = cell(rows[5], "col-notes");
assert(yijiItem.includes("移機2/4銅管基本安裝服務"), "yiji name");
assert(yijiItem.includes("含5米銅管、電線訊號"), "yiji spec stays in 品項");
assert((yijiItem.split("含5米銅管、電線訊號").length - 1) === 1, "spec must not be duplicated inside 品項");
assert(!yijiNotes.includes("含5米銅管、電線訊號"), "do not reprint spec in 備註");
assert(!yijiItem.includes(name40), "must not concatenate other items into 品項");

assert(html.includes("white-space:normal"), "white-space normal");
assert(html.includes("overflow-wrap:anywhere"), "overflow-wrap anywhere");
assert(html.includes("word-break:break-word"), "word-break break-word");
assert(html.includes("height:auto"), "height auto");
assert(html.includes("min-height:0"), "min-height 0");
assert(html.includes("vertical-align:middle"), "vertical-align middle");
assert(html.includes("box-sizing:border-box"), "box-sizing");
assert(html.includes("@media print"), "print CSS present");
assert(!html.includes("position:absolute"), "no absolute positioning");
assert(!html.includes("transform:scale"), "no transform scale");
assert(!html.includes("padding:3.5px 3px!important"), "no compact 3.5px padding override");
assert(html.includes("width:28%"), "品項 column 28%");
assert(html.includes("width:4%"), "項次 4%");
assert(html.includes("width:11%"), "備註 11%");
assert(html.includes("table-layout:fixed"), "table-layout fixed");
assert(html.includes("font-weight:500"), "medium table weight");
assert(!/quotation-print-page \.eq-table[\s\S]{0,400}font-weight:700/.test(html), "eq-table must not use 700");
const colgroup = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/)?.[1] ?? "";
const colWidths = [...colgroup.matchAll(/width:(\d+\.?\d*%)/g)].map((m) => m[1]);
assert(
  colWidths.join() === ["4%", "10%", "28%", "17%", "5%", "5%", "10%", "10%", "11%"].join(),
  `colgroup ${colWidths.join(" ")}`,
);
assert((html.match(/td:nth-child\(3\)\{width:28%!important/g) || []).length >= 1, "nth-child locks 品項 28%");
assert(html.includes("td:nth-child(3){width:28%!important"), "print uses same col widths");

if (process.exitCode) {
  console.error("quote A4 row-flow tests failed");
} else {
  console.log("quote A4 row-flow tests passed");
}
