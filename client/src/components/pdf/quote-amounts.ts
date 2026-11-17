/** Quote amount logic shared by form preview and PDF template */

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

export function computeQuoteAmounts(rawTotal: number, discountAmount: number, taxType: string) {
  const discAmt = Math.max(0, discountAmount || 0);
  const afterDiscount = Math.max(0, rawTotal - discAmt);
  const { preTax, taxAmt, total } = calcQuoteTax(afterDiscount, taxType);
  return { rawTotal, discAmt, preTax, taxAmt, total };
}
