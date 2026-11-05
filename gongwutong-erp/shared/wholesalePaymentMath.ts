export const WHOLESALE_PAYMENT_METHODS = ["現金", "匯款", "支票", "其他"] as const;
export type WholesalePaymentMethod = (typeof WHOLESALE_PAYMENT_METHODS)[number];

export const WHOLESALE_PAYMENT_STATUSES = ["未收款", "部分收款", "已收清"] as const;
export type WholesalePaymentStatus = (typeof WHOLESALE_PAYMENT_STATUSES)[number];

export function parseMoney(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function remainingAmount(totalAmount: number, receivedAmount: number): number {
  return Math.max(0, parseMoney(totalAmount) - parseMoney(receivedAmount));
}

/** Snapshot rows may still say 已收款; UI/API treat that as 已收清. */
export function normalizeWholesalePaymentStatus(status: string | null | undefined): WholesalePaymentStatus {
  if (status === "已收款" || status === "已收清") return "已收清";
  if (status === "部分收款") return "部分收款";
  return "未收款";
}

export function deriveWholesalePaymentStatus(receivedAmount: number, totalAmount: number): WholesalePaymentStatus {
  const received = parseMoney(receivedAmount);
  const total = parseMoney(totalAmount);
  if (received <= 0) return "未收款";
  if (received >= total) return "已收清";
  return "部分收款";
}

export type UnpaidWholesaleOrder = {
  orderId: number;
  remaining: number;
};

export type WholesalePaymentAllocation = {
  orderId: number;
  amount: number;
};

/**
 * FIFO allocate a payment across unpaid orders.
 * Throws if amount is not positive or exceeds remaining.
 */
export function allocateWholesalePayment(
  amount: number,
  orders: UnpaidWholesaleOrder[],
): WholesalePaymentAllocation[] {
  const pay = parseMoney(amount);
  if (!(pay > 0)) {
    throw new Error("本次收款金額必須大於 0");
  }

  const outstanding = parseMoney(orders.reduce((sum, order) => sum + Math.max(0, order.remaining), 0));
  if (pay > outstanding + 0.009) {
    throw new Error(`收款金額不可超過未收金額（${outstanding.toLocaleString("zh-TW")}）`);
  }

  const allocations: WholesalePaymentAllocation[] = [];
  let left = pay;
  for (const order of orders) {
    const remaining = parseMoney(Math.max(0, order.remaining));
    if (remaining <= 0 || left <= 0) continue;
    const take = parseMoney(Math.min(left, remaining));
    if (take <= 0) continue;
    allocations.push({ orderId: order.orderId, amount: take });
    left = parseMoney(left - take);
  }

  if (left > 0.009) {
    throw new Error(`收款金額不可超過未收金額（${outstanding.toLocaleString("zh-TW")}）`);
  }

  return allocations;
}
