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

const name10 = "移機銅管基本安裝服務";
const name25 = "壁掛分離式變頻冷暖超長品項名稱測試自動換行顯示效果";
const name40 = "壁掛分離式變頻冷暖超長品項名稱測試自動換行顯示效果含基本安裝與銅管配管工程服務項";
const model20 = "MSZ-AP35VG-LONG20MDL";
const notes50 = "本項含五米銅管電線訊號線基本安裝工資及高空作業補助，施工前請確認現場管線路徑與電源位置保留施工空間。";

assert([...name10].length === 10, `name10=${[...name10].length}`);
assert([...name25].length === 25, `name25=${[...name25].length}`);
assert([...name40].length === 40, `name40=${[...name40].length}`);
assert(model20.length === 20, `model20=${model20.length}`);
assert([...notes50].length === 50, `notes50=${[...notes50].length}`);

const html = buildQuotationHtml({
  id: 9,
  createdAt: "2026-09-02",
  customerName: "列高壓力測試",
  taxType: "未稅",
  items: [
    { category: "安裝新機", brand: "聲寶", itemName: name10, model: "A1", quantity: 1, unit: "式", unitPrice: 1, subtotal: 1, notes: "短備註" },
    { category: "安裝新機", brand: "聲寶", itemName: name25, model: "A2", quantity: 1, unit: "台", unitPrice: 1, subtotal: 1, notes: "含基本安裝" },
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
assert(rows.length === 4, `expected 4 rows, got ${rows.length}`);

function cell(row: string, cls: string): string {
  const td = row.match(new RegExp(`<td class="[^"]*${cls}[^"]*">([\\s\\S]*?)</td>`))?.[1] ?? "";
  return td.replace(/<div class="cell-text">/g, "").replace(/<\/div>/g, "");
}

assert(cell(rows[0], "col-item").includes(name10), "10-char item");
assert(cell(rows[1], "col-item").includes(name25), "25-char item");
assert(cell(rows[2], "col-item").includes(name40), "40-char item");
assert(cell(rows[2], "col-model").includes(model20), "20-char model");
assert(cell(rows[2], "col-notes").includes(notes50), "50-char notes");

const yijiItem = cell(rows[3], "col-item");
const yijiNotes = cell(rows[3], "col-notes");
assert(yijiItem.includes("移機2/4銅管基本安裝服務"), "yiji name");
assert(yijiItem.includes("含5米銅管、電線訊號"), "yiji spec stays in 品項");
assert((yijiItem.split("含5米銅管、電線訊號").length - 1) === 1, "spec must not be duplicated inside 品項");
assert(!yijiNotes.includes("含5米銅管、電線訊號"), "do not reprint spec in 備註");
assert(!yijiItem.includes(name40), "must not concatenate other items into 品項");

assert(html.includes("white-space:normal"), "white-space normal");
assert(html.includes("overflow-wrap:anywhere"), "overflow-wrap anywhere");
assert(html.includes("word-break:break-word"), "word-break break-word");
assert(html.includes("height:auto"), "height auto");
assert(html.includes("min-height:unset"), "min-height unset");
assert(html.includes("vertical-align:middle"), "vertical-align middle");
assert(html.includes("box-sizing:border-box"), "box-sizing");
assert(html.includes("@media print"), "print CSS present");
assert(!html.includes("position:absolute"), "no absolute positioning");
assert(!html.includes("transform:scale"), "no transform scale");
assert(!html.includes("padding:3.5px 3px!important"), "no compact 3.5px padding override");
assert(html.includes("width:25%"), "品項 column 25%");
assert(html.includes("width:3%"), "項次 shrunk to 3%");
assert(html.includes("width:7%"), "品牌 shrunk to 7%");

if (process.exitCode) {
  console.error("quote A4 row-flow tests failed");
} else {
  console.log("quote A4 row-flow tests passed");
}
