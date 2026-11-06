/** Same display-total logic as quotes list page (items → discount → tax). */

function toAmount(val: unknown): number {
  if (val == null) return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  return Number.isFinite(n) ? n : 0;
}

export function calcQuoteTax(subtotal: number, taxType: string) {
  // 新報價「不另加稅」不計入額外 5%；舊報價「未稅／含稅」沿用原計算，避免歷史金額變動。
  if (taxType === "不另加稅") {
    return { preTax: subtotal, taxAmt: 0, total: subtotal };
  }
  if (taxType === "含稅") {
    const preTax = Math.round(subtotal / 1.05);
    return { preTax, taxAmt: subtotal - preTax, total: subtotal };
  }
  const taxAmt = Math.round(subtotal * 0.05);
  return { preTax: subtotal, taxAmt, total: subtotal + taxAmt };
}

export function computeQuoteDisplayTotal(
  quote: {
    amount?: unknown;
    finalAmount?: unknown;
    discountAmount?: unknown;
    taxType?: string | null;
  },
  items: Array<{ subtotal?: unknown }>,
): number {
  const raw = items.length > 0
    ? items.reduce((s, i) => s + toAmount(i.subtotal), 0)
    : toAmount(quote.finalAmount ?? quote.amount);
  const discount = Math.max(0, toAmount(quote.discountAmount));
  return calcQuoteTax(Math.max(0, raw - discount), quote.taxType ?? "未稅").total;
}
