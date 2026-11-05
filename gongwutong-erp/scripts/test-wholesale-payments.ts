/**
 * Wholesale AR payment math — run: npx tsx scripts/test-wholesale-payments.ts
 */
import {
  allocateWholesalePayment,
  deriveWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
} from "../shared/wholesalePaymentMath.ts";

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

if (process.exitCode) {
  console.error("wholesale payment math tests failed");
  process.exit(process.exitCode);
}
console.log("wholesale payment math tests passed");
