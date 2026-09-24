export const WHOLESALE_PAYMENT_TERMS = [
  "現金",
  "貨到付款",
  "月結 15 天",
  "月結 30 天",
  "月結 45 天",
  "月結 60 天",
  "自訂",
] as const;

export const WHOLESALE_PAYMENT_METHODS = ["現金", "匯款", "支票", "其他"] as const;

export type WholesaleOrderPayStatus = "未收款" | "部分收款" | "已結清";
export type WholesaleCompanyStatus = "未結帳" | "部分收款" | "已結清";

export function monthRange(month: string): { start: string; end: string; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    const now = new Date();
    return monthRange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const start = `${match[1]}-${match[2]}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const end = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, label: `${year} 年 ${mon} 月` };
}

export function shiftMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const mon = match ? Number(match[2]) : now.getMonth() + 1;
  const d = new Date(year, mon - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function orderPayStatus(paidAmount: number, remainingAmount: number): WholesaleOrderPayStatus {
  if (remainingAmount <= 0.009) return "已結清";
  if (paidAmount > 0.009) return "部分收款";
  return "未收款";
}

export function companyStatus(totalOutstanding: number, hasAnyPayment: boolean): WholesaleCompanyStatus {
  if (totalOutstanding <= 0.009) return "已結清";
  if (hasAnyPayment) return "部分收款";
  return "未結帳";
}

export function dueDateFromTerms(monthEnd: string, paymentTerms: string | null | undefined): string | null {
  if (!paymentTerms) return monthEnd;
  const d = new Date(`${monthEnd}T00:00:00`);
  if (paymentTerms.includes("15")) d.setDate(d.getDate() + 15);
  else if (paymentTerms.includes("30")) d.setDate(d.getDate() + 30);
  else if (paymentTerms.includes("45")) d.setDate(d.getDate() + 45);
  else if (paymentTerms.includes("60")) d.setDate(d.getDate() + 60);
  else if (paymentTerms === "現金" || paymentTerms === "貨到付款") return monthEnd;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatTwd(n: number | string | null | undefined): string {
  const num = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  if (!Number.isFinite(num)) return "NT$ 0";
  return `NT$ ${Math.round(num).toLocaleString()}`;
}

export function formatYmd(d: string | null | undefined): string {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  if (!y || !m || !day) return s;
  return `${y}/${m}/${day}`;
}
