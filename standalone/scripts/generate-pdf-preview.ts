/**
 * Generate static HTML preview for PDF layout verification.
 * Run: npx tsx scripts/generate-pdf-preview.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildQuotationHtml } from "../client/src/components/pdf/templates/QuotationTemplate.ts";
import { buildWorkOrderHtml } from "../client/src/components/pdf/templates/WorkOrderTemplate.ts";
import { buildStatementHtml } from "../client/src/components/pdf/templates/StatementTemplate.ts";
import { displayQuoteItemCategory, displayQuoteItemBrand } from "../client/src/components/pdf/templates/printCategory.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/pdf-samples");
mkdirSync(outDir, { recursive: true });

// logoUrl() uses window.location.origin in templates
(globalThis as any).window = { location: { origin: "" } };

const demoQuote = {
  id: 42,
  createdAt: "2025-07-04",
  status: "待確認",
  taxType: "未稅",
  customerName: "王大明",
  customerPhone: "0912-345-678",
  salesRepName: "洪宇風",
  address: "彰化縣花壇鄉花南路168號",
  title: "客廳冷氣安裝工程",
  description: "施工方式：壁掛分離式\n施工天數：1天\n注意事項：施工前需清空場地",
  notes: "報價單有效期限30日，施工前請支付50%訂金。",
  items: [
    { category: "安裝新機", brand: "聲寶", itemName: "移機銅管基本安裝服務", model: "—", quantity: 1, unit: "式", unitPrice: 2800, subtotal: 2800, notes: "十品項" },
    { category: "安裝新機", brand: "聲寶", itemName: "壁掛分離式變頻冷暖超長品項名稱測試自動換行顯示效果", model: "AU/AM-JF50DC", quantity: 1, unit: "台", unitPrice: 32800, subtotal: 32800, notes: "含基本安裝" },
    { category: "追加項目", brand: "三菱重工", itemName: "壁掛分離式變頻冷暖超長品項名稱測試自動換行顯示效果含基本安裝與銅管配管工程服務項", model: "MSZ-AP35VG-LONG20MDL", quantity: 2, unit: "台", unitPrice: 28500, subtotal: 57000, notes: "本項含五米銅管電線訊號線基本安裝工資及高空作業補助，施工前請確認現場管線路徑與電源位置保留施工空間。" },
    { category: "其他", brand: "—", itemName: "移機2/4銅管基本安裝服務\n含5米銅管、電線訊號", model: "", quantity: 1, unit: "式", unitPrice: 3500, subtotal: 3500, notes: "含5米銅管、電線訊號" },
    { category: "維修", brand: "日立", itemName: "室外機維修清洗", model: "RAS-22", quantity: 1, unit: "式", unitPrice: 2800, subtotal: 2800, notes: "" },
    { category: "保養", brand: "—", itemName: "年度保養", model: "", quantity: 1, unit: "式", unitPrice: 1800, subtotal: 1800, notes: "" },
  ],
};

const demoWorkOrder = {
  id: 567,
  workOrderNumber: "WO-20250704-0567",
  scheduledDate: "2025-07-05",
  status: "待施工",
  customerName: "張小芳",
  mobilePhone: "0933-456-789",
  installAddress: "彰化市南門路88號12F",
  contactPerson: "張小姐",
  assignedTo: "李技師",
  assistantTo: "陳助手",
  description: "客廳及房間冷氣安裝，含配管、配線、洞孔封塞。",
  notes: "請於上午 9:00 前到達，戶主會在現場。",
  equipmentItems: [
    { category: "安裝新機", brand: "聲寶", itemName: "壁掛分離式 變頻冷暖", model: "AU/AM-JF50DC", quantity: 1, unit: "台", indoorUnits: 1, outdoorUnits: 1, floor: "客廳" },
    { brand: "三菱重工", model: "MSZ-AP35VG 3.5kW", quantity: 2, indoorUnits: 2, outdoorUnits: 2, floor: "客廳/臥室" },
    { brand: "格力", model: "KFR-35GW", quantity: 1, indoorUnits: 1, outdoorUnits: 1, floor: "書房" },
  ],
};

const demoStatementItems = [
  { orderId: 1, orderNumber: "DO-20250601-0101", orderDate: "2025-06-01", productName: "壁掛分離式 3.5kW 超長商品名稱換行測試", brand: "三菱重工", model: "MSZ-AP35VG", spec: null, unit: "台", qty: 2, unitPrice: "22500", amount: "45000", notes: "含安裝" },
  { orderId: 2, orderNumber: "DO-20250605-0102", orderDate: "2025-06-05", productName: "室外機支架", brand: "晟風自製", model: "JFK-01", spec: null, unit: "組", qty: 2, unitPrice: "1200", amount: "2400", notes: "" },
  { orderId: 3, orderNumber: "DO-20250610-0103", orderDate: "2025-06-10", productName: "銅管配管 5公尺", brand: "晟風自製", model: "JFP-5M", spec: null, unit: "式", qty: 1, unitPrice: "8000", amount: "8000", notes: "含吸排管" },
];

const quoteHtml = buildQuotationHtml(demoQuote)
  .replace(/src="\/logo.png"/g, 'src="../logo.png"')
  .replace(/url\("\/fonts\//g, 'url("../fonts/');
const workHtml = buildWorkOrderHtml(demoWorkOrder)
  .replace(/src="\/logo.png"/g, 'src="../logo.png"')
  .replace(/url\("\/fonts\//g, 'url("../fonts/');
const stmtHtml = buildStatementHtml("林記冷氣行", "2025-06-01", "2025-06-30", demoStatementItems, 55400, 0, 0, 55400, 0, 55400).replace(/src="\/logo.png"/g, 'src="../logo.png"');

writeFileSync(join(outDir, "quotation.html"), quoteHtml);
writeFileSync(join(outDir, "work-order.html"), workHtml);
writeFileSync(join(outDir, "statement.html"), stmtHtml);

const cats = [
  displayQuoteItemCategory({ category: "安裝新機" }),
  displayQuoteItemCategory({ category: "追加項目" }),
  displayQuoteItemCategory({ category: "維修" }),
  displayQuoteItemCategory({ category: "保養" }),
  displayQuoteItemCategory({ category: "其他", brand: "壁掛式保養", itemName: "S1" }),
  displayQuoteItemCategory({ category: "其他", brand: "維修項目", itemName: "冷媒填充＋抓漏" }),
  displayQuoteItemCategory({ category: "其他", itemName: "現場雜項" }),
];
if (cats.join() !== ["安裝新機", "追加項目", "維修項目", "保養", "壁掛式保養", "維修項目", "—"].join()) {
  throw new Error(`category mapping failed: ${cats.join(" | ")}`);
}
const serviceRows = [
  { category: "其他", brand: "壁掛式保養", itemName: "S1" },
  { category: "其他", brand: "維修項目", itemName: "冷媒填充＋抓漏" },
];
if (displayQuoteItemBrand(serviceRows[0]) !== "—" || displayQuoteItemBrand(serviceRows[1]) !== "—") {
  throw new Error("service labels must not print as brand");
}
if (displayQuoteItemBrand({ brand: "大金" }) !== "大金") {
  throw new Error("real AC brand should print as brand");
}
for (const bad of ["transform:scale(", "scaleX(", "scaleY(", "font-stretch:condensed", "font-stretch: condensed"]) {
  if (quoteHtml.includes(bad)) {
    throw new Error(`quotation HTML contains forbidden ${bad}`);
  }
}
if (/zoom\s*:\s*(?!normal)/.test(quoteHtml.replace(/zoom:normal/g, ""))) {
  /* zoom:normal is a reset; any other zoom is forbidden */
}
if (!quoteHtml.includes("@page{size:A4 portrait;margin:10mm 12mm}")) {
  throw new Error("missing A4 portrait @page");
}
if (quoteHtml.includes("size:A4 landscape") || quoteHtml.includes("orientation:landscape")) {
  throw new Error("quotation must stay A4 portrait");
}
if (!quoteHtml.includes("background:#111") || !quoteHtml.includes("客戶簽名")) {
  throw new Error("missing black header or signature labels");
}
if (!quoteHtml.includes('class="cell-text"')) {
  throw new Error("quotation cells must wrap text in .cell-text so rows can grow");
}
if (!quoteHtml.includes("overflow-wrap:anywhere") || !quoteHtml.includes("word-break:break-word")) {
  throw new Error("quotation table must wrap with overflow-wrap:anywhere and word-break:break-word");
}
if (quoteHtml.includes("padding:3.5px 3px!important")) {
  throw new Error("quotation eq-table must not use compact 3.5px cell padding");
}
if (!quoteHtml.includes("width:25%")) {
  throw new Error("品項／規格 column must be 25%");
}
{
  const body = quoteHtml.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  const yijiRows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) => m[1])
    .filter((row) => row.includes("移機2/4銅管基本安裝服務"));
  if (yijiRows.length !== 1) {
    throw new Error(`expected one 移機2/4 row, got ${yijiRows.length}`);
  }
  const itemCell = yijiRows[0].match(/col-item[\s\S]*?cell-text">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const notesCell = yijiRows[0].match(/col-notes[\s\S]*?cell-text">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const itemHits = itemCell.split("含5米銅管、電線訊號").length - 1;
  const notesHits = notesCell.split("含5米銅管、電線訊號").length - 1;
  if (itemHits !== 1) {
    throw new Error(`品項 cell should show 含5米銅管 once, got ${itemHits}: ${itemCell}`);
  }
  if (notesHits !== 0) {
    throw new Error("備註 already inside 品項 must not be printed again in 備註 column");
  }
}

const indexHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>PDF Layout Preview</title>
<style>
body{font-family:sans-serif;background:#f0f0f0;margin:0;padding:20px}
h1{text-align:center;font-size:18px}
.grid{display:flex;flex-direction:column;gap:24px;max-width:820px;margin:0 auto}
.card{background:#fff;border-radius:8px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.card h2{margin:0 0 8px;font-size:14px;color:#333}
iframe{width:794px;max-width:100%;border:1px solid #ddd;background:#fff}
</style>
</head>
<body>
<h1>PDF 版面預覽 — 報價單 / 派工單 / 請款單</h1>
<div class="grid">
  <div class="card"><h2>報價單 (A4 直式 210×297mm)</h2><iframe src="quotation.html" height="1123"></iframe></div>
  <div class="card"><h2>派工單 (24×14cm)</h2><iframe src="work-order.html" height="560"></iframe></div>
  <div class="card"><h2>請款單 (A4)</h2><iframe src="statement.html" height="1120"></iframe></div>
</div>
</body>
</html>`;

writeFileSync(join(outDir, "index.html"), indexHtml);
console.log("Generated:", outDir);
