/** Quote lifecycle status helpers (ERP quotes, not wholesale). */

export const QUOTE_STATUSES = ["草稿", "已送出", "已成交", "已拒絕"] as const;

export function normalizeQuoteStatus(status: string | null | undefined): string {
  if (status === "已接受") return "已成交";
  if (status === "已完成") return "已成交";
  return status ?? "草稿";
}

export function isQuoteWon(status: string | null | undefined): boolean {
  const s = status ?? "";
  return s === "已成交" || s === "已接受";
}

export function formatQuoteNumber(id: number, createdAt: unknown): string {
  const d = createdAt instanceof Date ? createdAt : createdAt ? new Date(String(createdAt)) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `Q-${ymd}-${String(id).padStart(4, "0")}`;
}
