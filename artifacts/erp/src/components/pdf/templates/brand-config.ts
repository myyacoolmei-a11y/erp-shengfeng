// Brand configuration shared across all PDF templates
// Only constants & utility functions — each template has its own independent HTML+CSS layout

export const logoUrl = () => `${window.location.origin}/logo.png`;

export const COMPANY = {
  name: "\u666f\u98a8\u5de5\u7a0b\u6709\u9650\u516c\u53f8",
  shortName: "\u666f\u98a8\u5de5\u7a0b",
  subTitle: "\u51b7\u6c23\u5b89\u88dd\uff5c\u4fdd\u990a\uff5c\u7dad\u4fee\uff5c\u8a2d\u8a08",
  taxId: "\u7d71\u7de8\uff1a93388506",
  phone: "Tel\uff1a0955-980-738",
  email: "cfac07151025@gmail.com",
  address: "\u5f70\u5316\u7e23\u82b1\u58c7\u9109\u82b1\u5357\u8def212\u865f",
  bankCode: "\u9280\u884c\u4ee3\u78bc\uff1a013",
  bankAccount: "047035012164",
  bankName: "\u570b\u6cf0\u4e16\u83ef\u9280\u884c",
  bankAccountName: "\u6236\u540d\uff1a\u666f\u98a8\u5de5\u7a0b\u884c \u6d2a\u5b87\u98a8",
} as const;

export const COLORS = {
  primary: "#9ACD32",      // Fluorescent green brand color
  primaryDark: "#7FB800",
  black: "#111111",
  darkGray: "#333333",
  midGray: "#555555",
  lightGray: "#888888",
  borderGray: "#e0e0e0",
  bgLight: "#f7f7f7",
  white: "#ffffff",
  red: "#dc2626",
  green: "#15803d",
} as const;

export function esc(s: any): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fmtMoney(n: number | string | null | undefined): string {
  if (n == null) return "\u2014";
  const num = typeof n === "number" ? n : parseFloat(String(n));
  if (isNaN(num)) return "\u2014";
  return `NT$ ${Math.round(num).toLocaleString()}`;
}

export function fmtMoneyStr(s: string | null | undefined): string {
  if (!s) return "\u2014";
  const n = parseFloat(s);
  return isNaN(n) ? "\u2014" : `NT$ ${Math.round(n).toLocaleString()}`;
}

export function today(): string {
  return new Date().toLocaleDateString("zh-TW");
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "\u2014";
  return d;
}
