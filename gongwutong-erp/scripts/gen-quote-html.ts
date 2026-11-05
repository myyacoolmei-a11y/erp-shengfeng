(globalThis as any).window = { location: { origin: "https://example.com" } };

import fs from "fs";
import { buildQuotationHtml } from "../client/src/components/pdf/templates/QuotationTemplate.ts";

const quote = {
  id: 42,
  title: "測試",
  status: "待確認",
  createdAt: "2025-07-04",
  customerName: "王小明",
  customerPhone: "0912",
  salesRepName: "業務",
  address: "台中",
  taxType: "未稅",
  discountAmount: 0,
  description: "施工方式：壁掛\n施工天數：1天",
  notes: "有效30日",
  items: [
    { category: "裝新機", brand: "三菱", itemName: "壁掛A", model: "M1", quantity: 1, unit: "台", unitPrice: 10000, subtotal: 10000, notes: "n1" },
    { category: "裝新機", brand: "三菱", itemName: "壁掛B", model: "M2", quantity: 1, unit: "台", unitPrice: 20000, subtotal: 20000, notes: "" },
    { category: "配管", brand: "", itemName: "銅管", model: "", quantity: 1, unit: "式", unitPrice: 5000, subtotal: 5000, notes: "" },
    { category: "其他", brand: "", itemName: "支架", model: "", quantity: 2, unit: "支", unitPrice: 500, subtotal: 1000, notes: "" },
    { category: "其他", brand: "", itemName: "冷媒", model: "", quantity: 1, unit: "式", unitPrice: 3000, subtotal: 3000, notes: "" },
  ],
};

const html = buildQuotationHtml(quote);
fs.writeFileSync("/tmp/quote-print-test.html", html);
console.log("wrote", html.length, "PRINT?", html.includes("PRINT-TEMPLATE"));
