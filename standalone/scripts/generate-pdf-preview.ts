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
    { category: "裝新機", brand: "三菱重工", itemName: "壁掛分離式 3.5kW 超長品項名稱測試自動換行顯示效果", quantity: 2, unit: "台", unitPrice: 28500, subtotal: 57000, notes: "含安裝及基本配管" },
    { category: "裝新機", brand: "三菱重工", itemName: "壁掛分離式 2.2kW", quantity: 1, unit: "台", unitPrice: 22000, subtotal: 22000, notes: "" },
    { category: "配管工程", brand: "—", itemName: "銅管配管 5公尺", quantity: 1, unit: "式", unitPrice: 8500, subtotal: 8500, notes: "含吸排管" },
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
    { brand: "三菱重工", model: "MSZ-AP35VG 3.5kW", quantity: 2, indoorUnits: 2, outdoorUnits: 2, floor: "客廳/臥室" },
    { brand: "格力", model: "KFR-35GW", quantity: 1, indoorUnits: 1, outdoorUnits: 1, floor: "書房" },
  ],
};

const demoStatementItems = [
  { orderId: 1, orderNumber: "DO-20250601-0101", orderDate: "2025-06-01", productName: "壁掛分離式 3.5kW 超長商品名稱換行測試", brand: "三菱重工", model: "MSZ-AP35VG", spec: null, unit: "台", qty: 2, unitPrice: "22500", amount: "45000", notes: "含安裝" },
  { orderId: 2, orderNumber: "DO-20250605-0102", orderDate: "2025-06-05", productName: "室外機支架", brand: "晟風自製", model: "JFK-01", spec: null, unit: "組", qty: 2, unitPrice: "1200", amount: "2400", notes: "" },
  { orderId: 3, orderNumber: "DO-20250610-0103", orderDate: "2025-06-10", productName: "銅管配管 5公尺", brand: "晟風自製", model: "JFP-5M", spec: null, unit: "式", qty: 1, unitPrice: "8000", amount: "8000", notes: "含吸排管" },
];

const quoteHtml = buildQuotationHtml(demoQuote).replace(/src="\/logo.png"/g, 'src="../logo.png"');
const workHtml = buildWorkOrderHtml(demoWorkOrder).replace(/src="\/logo.png"/g, 'src="../logo.png"');
const stmtHtml = buildStatementHtml("林記冷氣行", "2025-06-01", "2025-06-30", demoStatementItems, 55400, 0, 0, 55400, 0, 55400).replace(/src="\/logo.png"/g, 'src="../logo.png"');

writeFileSync(join(outDir, "quotation.html"), quoteHtml);
writeFileSync(join(outDir, "work-order.html"), workHtml);
writeFileSync(join(outDir, "statement.html"), stmtHtml);

const indexHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>PDF Layout Preview</title>
<style>
body{font-family:sans-serif;background:#f0f0f0;margin:0;padding:20px}
h1{text-align:center;font-size:18px}
.grid{display:flex;flex-direction:column;gap:24px;max-width:900px;margin:0 auto}
.card{background:#fff;border-radius:8px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.card h2{margin:0 0 8px;font-size:14px;color:#333}
iframe{width:100%;border:1px solid #ddd;background:#fff}
</style>
</head>
<body>
<h1>PDF 版面預覽 — 報價單 / 派工單 / 請款單</h1>
<div class="grid">
  <div class="card"><h2>報價單 (A4)</h2><iframe src="quotation.html" height="1120"></iframe></div>
  <div class="card"><h2>派工單 (24×14cm)</h2><iframe src="work-order.html" height="560"></iframe></div>
  <div class="card"><h2>請款單 (A4)</h2><iframe src="statement.html" height="1120"></iframe></div>
</div>
</body>
</html>`;

writeFileSync(join(outDir, "index.html"), indexHtml);
console.log("Generated:", outDir);
