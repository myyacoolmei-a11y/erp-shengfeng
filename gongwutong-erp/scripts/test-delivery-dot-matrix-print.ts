/**
 * Wholesale delivery continuous-print checks.
 * Run: npx tsx scripts/test-delivery-dot-matrix-print.ts
 */
import { buildDeliveryHtml } from "../client/src/components/pdf/templates/DeliveryTemplate.ts";
import { buildWorkOrderHtml } from "../client/src/components/pdf/templates/WorkOrderTemplate.ts";
import { CONTINUOUS_PAPER } from "../client/src/lib/printPaperConfig.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

(globalThis as any).window = { location: { origin: "" } };

const order = {
  id: 12,
  orderNumber: "WO-202608-0012",
  customerName: "林記冷氣行",
  customerPhone: "04-1234567",
  customerAddress: "彰化縣花壇鄉花南路1號",
  orderDate: "2026-08-24",
  expectedDelivery: "2026-08-25",
  salesperson: "洪宇風",
  notes: "請於上午送達",
  subtotal: 45000,
  taxAmount: 0,
  shippingFee: 0,
  total: 45000,
  items: [
    { productName: "壁掛分離式 變頻冷暖", brand: "大金", model: "RX-A", qty: 1, unit: "台", unitPrice: 32800, amount: 32800 },
    { productName: "銅管配管", brand: "", model: "", qty: 2, unit: "式", unitPrice: 6100, amount: 12200 },
  ],
};

const listStub = { id: 12, orderNumber: "WO-202608-0012", customerName: "林記冷氣行", items: [] };

const html = buildDeliveryHtml(order, { mode: "continuous-print" });
const woHtml = buildWorkOrderHtml({ id: 1, workOrderNumber: "WO-1", customerName: "測" }, { mode: "continuous-print" });
const digital = buildDeliveryHtml(order);

assert(html.includes("@page{size:auto;margin:0}"), "delivery must use WO @page size:auto;margin:0");
assert(woHtml.includes("@page{size:auto;margin:0}"), "work order still size:auto");
assert(html.includes(`${CONTINUOUS_PAPER.WIDTH_MM}mm`), "241.3mm width");
assert(html.includes(`${CONTINUOUS_PAPER.HEIGHT_MM}mm`), "139.7mm height");
assert(html.includes("9.5") && html.includes("5.5"), "9.5x5.5 paper hint");
assert(!html.includes("landscape"), "continuous must not lock landscape");
assert(!html.includes("size:240mm 140mm"), "continuous must not use 240x140");
assert(!html.includes("display:none"), "must not hide content");
assert(!html.includes("visibility:hidden"), "must not hide content");
assert(!html.includes("position:absolute"), "continuous must not abs-pos like digital");
assert(html.includes("林記冷氣行"), "customer name");
assert(html.includes("04-1234567"), "customer phone");
assert(html.includes("彰化縣花壇鄉花南路1號"), "customer address");
assert(html.includes("壁掛分離式 變頻冷暖"), "product name");
assert(html.includes("NT$ 32,800") || html.includes("NT$32,800") || html.includes("32,800"), "unit price");
assert(html.includes("商品名稱") && html.includes("數量") && html.includes("單價") && html.includes("小計"), "columns");
assert((html.match(/<div class="cp-row">/g) || []).length === 2, "two item rows, no padded blanks");

const emptyHtml = buildDeliveryHtml(listStub, { mode: "continuous-print" });
assert(emptyHtml.includes("data-item-count=\"0\""), "empty list stub has 0 items — caller must load full order");

assert(digital.includes("size:240mm 140mm landscape"), "mobile/PDF digital layout unchanged");

if (process.exitCode) console.error("delivery print tests failed");
else console.log("delivery print tests passed");
