/** Quote lifecycle status helpers (ERP quotes, not wholesale). */

export const QUOTE_STATUS_PENDING = "客戶確認中";
export const QUOTE_STATUS_WON = "已成交";
export const QUOTE_STATUS_LOST = "未成交";

export const QUOTE_STATUSES = [
  QUOTE_STATUS_PENDING,
  QUOTE_STATUS_WON,
  QUOTE_STATUS_LOST,
] as const;

export type QuoteLifecycleStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_LIST_TABS = ["尚未成交", "已成交", "未成交"] as const;
export type QuoteListTab = (typeof QUOTE_LIST_TABS)[number];

export const QUOTE_LOST_REASONS = [
  "價格因素",
  "客戶暫緩",
  "選擇其他廠商",
  "無法聯絡",
  "其他",
] as const;

export type QuoteLostReason = (typeof QUOTE_LOST_REASONS)[number];

const WON_RAW = new Set(["已成交", "已接受", "已完成"]);
const LOST_RAW = new Set(["未成交", "已拒絕", "已取消", "已失效"]);

export function normalizeQuoteStatus(status: string | null | undefined): QuoteLifecycleStatus {
  const s = (status ?? "").trim();
  if (WON_RAW.has(s)) return QUOTE_STATUS_WON;
  if (LOST_RAW.has(s)) return QUOTE_STATUS_LOST;
  return QUOTE_STATUS_PENDING;
}

export function isQuoteWon(status: string | null | undefined): boolean {
  return normalizeQuoteStatus(status) === QUOTE_STATUS_WON;
}

export function isQuoteLost(status: string | null | undefined): boolean {
  return normalizeQuoteStatus(status) === QUOTE_STATUS_LOST;
}

export function isQuotePending(status: string | null | undefined): boolean {
  return normalizeQuoteStatus(status) === QUOTE_STATUS_PENDING;
}

export function quoteStatusLabel(status: string | null | undefined): string {
  return normalizeQuoteStatus(status);
}

export function quoteListTab(status: string | null | undefined): QuoteListTab {
  const n = normalizeQuoteStatus(status);
  if (n === QUOTE_STATUS_WON) return "已成交";
  if (n === QUOTE_STATUS_LOST) return "未成交";
  return "尚未成交";
}

export function formatLostReason(reason?: string | null, detail?: string | null): string | null {
  const r = (reason ?? "").trim();
  if (!r) return null;
  if (r === "其他") {
    const extra = (detail ?? "").trim();
    return extra ? `其他：${extra}` : "其他";
  }
  return r;
}
