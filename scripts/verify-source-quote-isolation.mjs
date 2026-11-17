globalThis.window = { location: { origin: "https://example.com" } };

import { buildQuotationHtml } from "../client/src/components/pdf/templates/QuotationTemplate.ts";

const originalQuote = {
  id: 67,
  createdAt: "2026-08-14T00:00:00.000Z",
  customerName: "原始客戶",
  customerPhone: "0912000000",
  salesRepName: "業務",
  address: "原始施工地址",
  taxType: "未稅",
  status: "已成交",
  title: "原始報價工程",
  description: "原始服務內容",
  notes: "原始備註",
  discountAmount: 0,
  amount: 71429,
  finalAmount: 71429,
  items: [
    {
      category: "裝新機",
      brand: "大金",
      itemName: "原始品項A",
      model: "RX-A",
      quantity: 1,
      unit: "台",
      unitPrice: 50000,
      subtotal: 50000,
      notes: "列備註A",
    },
    {
      category: "裝新機",
      brand: "大金",
      itemName: "原始品項B",
      model: "RX-B",
      quantity: 1,
      unit: "台",
      unitPrice: 21429,
      subtotal: 21429,
      notes: "列備註B",
    },
  ],
};

const workOrderShaped = {
  id: 99,
  quoteId: 67,
  quoteNumber: "Q-20260814-0067",
  description: "派工施工內容（不應出現在報價單明細）",
  notes: "派工備註",
  equipmentItems: [
    {
      brand: "派工品牌",
      itemName: "派工材料設備",
      model: "WO-MODEL",
      quantity: 9,
      unit: "式",
      notes: "派工列備註",
    },
  ],
};

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

const quoteHtml = buildQuotationHtml(originalQuote);
const mixedHtml = buildQuotationHtml({
  ...originalQuote,
  ...workOrderShaped,
  // Explicitly keep quote items if a buggy caller spreads work order over quote
  items: originalQuote.items,
});
const woAsQuoteHtml = buildQuotationHtml(workOrderShaped);

if (!quoteHtml.includes("Q-20260814-0067")) fail("original quote number missing");
if (!quoteHtml.includes("原始品項A") || !quoteHtml.includes("原始品項B")) fail("original item names missing");
if (!quoteHtml.includes("列備註A")) fail("line notes missing");
if (!quoteHtml.includes("原始服務內容")) fail("original description missing");
if (!/NT\$\s*75,?000/.test(quoteHtml)) {
  fail("expected taxed total around NT$ 75,000 in original quote PDF");
}
if (quoteHtml.includes("派工材料設備") || quoteHtml.includes("派工施工內容")) {
  fail("original quote PDF picked up work-order fields");
}

if (woAsQuoteHtml.includes("派工材料設備")) {
  fail("quotation template must not render work-order equipmentItems as line items");
}
if (woAsQuoteHtml.includes("WO-MODEL")) {
  fail("quotation template must not render work-order models from equipmentItems");
}

if (!mixedHtml.includes("原始品項A")) fail("spread work order overwrote quote items");
if (mixedHtml.includes("派工材料設備")) fail("equipmentItems leaked into mixed document");

console.log("source-quote isolation: OK");
console.log("original quote no:", "Q-20260814-0067");
const totalMatch = quoteHtml.match(/含稅總計[\s\S]{0,200}?NT\$\s*([0-9,]+)/);
console.log("original taxed total in PDF:", totalMatch?.[1] ?? "(not parsed)");
