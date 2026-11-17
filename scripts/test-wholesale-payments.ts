/**
 * Wholesale AR payment & monthly settlement tests — run: npx tsx scripts/test-wholesale-payments.ts
 */
(globalThis as any).window = { location: { origin: "" } };

import {
  allocateWholesalePayment,
  deriveWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
} from "../shared/wholesalePaymentMath.ts";
import {
  aggregateWholesaleSettlementSummary,
  computeStatementTotalsFromOrders,
  doesOrderMatchSettlementCustomer,
  explainOrderSettlementEligibility,
  type WholesaleSettlementOrderInput,
} from "../shared/wholesaleSettlementLogic.ts";
import { buildStatementHtml } from "../client/src/components/pdf/templates/StatementTemplate.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

function ledger(orderTotal: number, payments: number[]) {
  const received = parseMoney(payments.reduce((sum, amount) => sum + amount, 0));
  return {
    received,
    outstanding: remainingAmount(orderTotal, received),
    status: deriveWholesalePaymentStatus(received, orderTotal),
  };
}

assert(deriveWholesalePaymentStatus(0, 26500) === "未收款", "0 received → 未收款");
assert(deriveWholesalePaymentStatus(10000, 26500) === "部分收款", "10000/26500 → 部分收款");
assert(deriveWholesalePaymentStatus(26500, 26500) === "已收清", "26500/26500 → 已收清");
assert(deriveWholesalePaymentStatus(27000, 26500) === "已收清", "overpay still 已收清");
assert(remainingAmount(26500, 0) === 26500, "unpaid remaining is full total");
assert(remainingAmount(26500, 10000) === 16500, "partial remaining");
assert(remainingAmount(26500, 26500) === 0, "paid remaining is 0");

const unpaid = ledger(26500, []);
assert(unpaid.received === 0 && unpaid.outstanding === 26500 && unpaid.status === "未收款", "case: unpaid 26500");

const partial = ledger(26500, [10000]);
assert(partial.received === 10000 && partial.outstanding === 16500 && partial.status === "部分收款", "case: pay 10000");

const paid = ledger(26500, [10000, 16500]);
assert(paid.received === 26500 && paid.outstanding === 0 && paid.status === "已收清", "case: pay remaining 16500");

const afterDelete = ledger(26500, [10000]);
assert(afterDelete.received === 10000 && afterDelete.outstanding === 16500 && afterDelete.status === "部分收款", "case: delete second payment");

const fifo = allocateWholesalePayment(20000, [
  { orderId: 1, remaining: 10000 },
  { orderId: 2, remaining: 16500 },
]);
assert(fifo.length === 2 && fifo[0].amount === 10000 && fifo[1].amount === 10000, "FIFO splits across orders");

let overpayFailed = false;
try {
  allocateWholesalePayment(30000, [{ orderId: 1, remaining: 26500 }]);
} catch {
  overpayFailed = true;
}
assert(overpayFailed, "overpay is rejected");

// === Monthly Settlement: Distinct companies even when customerId is null or mismatched ===
const octOrders: WholesaleSettlementOrderInput[] = [
  {
    id: 11,
    orderNumber: "WO-202610-0011",
    customerId: null,
    customerName: "翊森空調工程行",
    orderDate: "2026-10-01", // boundary start date
    status: "已出貨",
    total: "202110",
  },
  {
    id: 19,
    orderNumber: "WO-202610-0019",
    customerId: null,
    customerName: "佶利電器廖豐興",
    orderDate: "2026-10-26",
    status: "已出貨",
    total: "54000",
  },
  {
    id: 20,
    orderNumber: "WO-202610-0020",
    customerId: null,
    customerName: "晟風空調和美店",
    orderDate: "2026-10-27",
    status: "已出貨",
    total: "24000",
  },
  {
    id: 21,
    orderNumber: "WO-202610-0021",
    customerId: 5,
    customerName: "裕昌電器行",
    orderDate: "2026-10-30", // boundary end date
    status: "已出貨",
    total: "450",
  },
  {
    id: 22,
    orderNumber: "WO-202609-0022",
    customerId: 5,
    customerName: "裕昌電器行",
    orderDate: "2026-09-30", // outside range, even if expectedDelivery is in Oct
    expectedDelivery: "2026-10-05",
    status: "已出貨",
    total: "99999",
  },
  {
    id: 23,
    orderNumber: "WO-202610-0023",
    customerId: 5,
    customerName: "裕昌電器行",
    orderDate: "2026-10-15",
    status: "備貨中", // not shipped yet
    total: "88888",
  },
];

const receivedMap = new Map<number, number>([
  [11, 50000],
  [19, 14000], // partial payment on WO-202610-0019
  [20, 0],
  [21, 450],
  [22, 99999], // Sept order payment must NOT leak into Oct summary
]);

const summary = aggregateWholesaleSettlementSummary(octOrders, receivedMap, [], {
  from: "2026-10-01",
  to: "2026-10-30",
});

assert(summary.length === 4, "all 4 companies with shipped Oct orders are listed separately");
const byName = new Map(summary.map((s) => [s.customerName, s]));
assert(byName.get("翊森空調工程行")?.totalAmount === 202110, "翊森空調工程行 total = 202,110");
assert(byName.get("佶利電器廖豐興")?.totalAmount === 54000, "WO-202610-0019 佶利電器廖豐興 total = 54,000");
assert(byName.get("佶利電器廖豐興")?.receivedAmount === 14000, "WO-202610-0019 佶利電器廖豐興 received = 14,000");
assert(byName.get("佶利電器廖豐興")?.receivableAmount === 40000, "WO-202610-0019 佶利電器廖豐興 receivable = 40,000");
assert(byName.get("晟風空調和美店")?.totalAmount === 24000, "WO-202610-0020 晟風空調和美店 total = 24,000");
assert(byName.get("裕昌電器行")?.totalAmount === 450, "WO-202610-0021 裕昌電器行 total = 450 (excludes Sept & unshipped)");
assert(byName.get("裕昌電器行")?.receivedAmount === 450 && byName.get("裕昌電器行")?.receivableAmount === 0, "裕昌電器行 cross-month payment isolated");

// Customer detail matching does not mix null-customerId companies
const hemeiDetail = octOrders.filter(
  (o) =>
    explainOrderSettlementEligibility(o, "2026-10-01", "2026-10-30").included &&
    doesOrderMatchSettlementCustomer(o, 0, "晟風空調和美店", []),
);
assert(hemeiDetail.length === 1 && hemeiDetail[0].orderNumber === "WO-202610-0020", "detail filter isolates 晟風空調和美店");

// Statement totals use saved order totals without recalculating from first order's taxRate
const mixedTaxOrders = [
  { subtotal: "10000", taxRate: "5", taxAmount: "500", shippingFee: "0", total: "10500", receivedAmount: 3000 },
  { subtotal: "20000", taxRate: "0", taxAmount: "0", shippingFee: "300", total: "20300", receivedAmount: 2000 },
];
const stTotals = computeStatementTotalsFromOrders(mixedTaxOrders);
assert(stTotals.subtotal === 30000, "statement subtotal sums saved subtotals");
assert(stTotals.taxAmount === 500, "statement taxAmount sums saved taxAmounts (not 5% of 30000)");
assert(stTotals.shippingFee === 300, "statement shippingFee sums saved shippingFees");
assert(stTotals.total === 30800, "statement total equals exact sum of saved order totals");
assert(stTotals.receivedAmount === 5000 && stTotals.receivableAmount === 25800, "statement received and receivable match");

// Statement PDF does not truncate >12 items and does not use absolute bottom positioning
const twentyItems = Array.from({ length: 20 }, (_, i) => ({
  orderId: i + 1,
  orderNumber: `WO-202610-${String(i + 1).padStart(4, "0")}`,
  orderDate: "2026-10-20",
  productName: `測試冷氣品項_${i + 1}`,
  brand: "日立",
  model: `RAC-${i + 1}`,
  spec: "2.8kW",
  unit: "台",
  qty: 1,
  unitPrice: "10000",
  amount: "10000",
  notes: null,
}));
const statementHtml = buildStatementHtml(
  "翊森空調工程行",
  "2026-10-01",
  "2026-10-30",
  twentyItems,
  200000,
  0,
  500,
  200500,
  50000,
  150500,
);
assert(statementHtml.includes("測試冷氣品項_1") && statementHtml.includes("測試冷氣品項_20"), "statement PDF renders all 20 items without 12-row truncation");
assert(statementHtml.includes("200,500") && statementHtml.includes("50,000") && statementHtml.includes("150,500"), "statement PDF includes total, received, and unpaid");
assert(!/\.amt-box\{[^}]*position:absolute/.test(statementHtml), "statement PDF footer uses normal flow, not position:absolute");

if (process.exitCode) {
  console.error("wholesale payment math tests failed");
  process.exit(process.exitCode);
}
console.log("wholesale payment math tests passed");
