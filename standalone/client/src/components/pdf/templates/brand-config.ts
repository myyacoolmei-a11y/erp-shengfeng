// Brand configuration shared across all PDF templates
// Only constants & utility functions — each template has its own independent HTML+CSS layout

/** Logo absolute URL; pass baseOrigin on the server (no `window`). */
export function logoUrl(baseOrigin?: string): string {
  const origin =
    baseOrigin ??
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "");
  return `${origin}/logo.png`;
}

export const COMPANY = {
  name: "\u665f\u98a8\u5de5\u7a0b\u6709\u9650\u516c\u53f8",
  shortName: "\u665f\u98a8\u5de5\u7a0b",
  subTitle: "\u51b7\u6c23\u5b89\u88dd\uff5c\u4fdd\u990a\uff5c\u7dad\u4fee\uff5c\u8a2d\u8a08",
  taxId: "\u7d71\u7de8\uff1a93388506",
  phone: "Tel\uff1a0955-980-798",
  email: "cfac07151025@gmail.com",
  address: "\u5f70\u5316\u7e23\u82b1\u58c7\u9109\u82b1\u5357\u8def212\u865f",
  bankCode: "013",
  bankAccount: "047035012164",
  bankName: "\u570b\u6cf0\u4e16\u83ef",
  bankAccountName: "\u665f\u98a8\u5de5\u7a0b\u884c \u6d2a\u5b87\u98a8",
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

/** Shared table / notes / amount / signature spacing for all PDF templates */
export const PDF_LAYOUT_CSS = `
/* ===== Shared PDF readability ===== */
body{line-height:1.55}
table{font-size:9pt;line-height:1.55}
.head-row th{
  padding:6px 8px;
  min-height:40px;
  line-height:1.55;
  vertical-align:middle;
}
tbody td{
  padding:6px 8px;
  min-height:40px;
  line-height:1.55;
  vertical-align:middle;
}
tbody tr{min-height:40px}
.col-item{
  word-wrap:break-word;
  word-break:break-word;
  white-space:normal;
}
.col-notes{
  padding-left:10px!important;
  padding-right:10px!important;
}
.notes-box,.remarks-box{
  border:1px solid ${COLORS.borderGray};
  padding:3mm 4mm;
  font-size:9pt;
  line-height:1.6;
  min-height:18mm;
  background:#fafafa;
}
.note-line{
  font-size:8.5pt;
  line-height:1.6;
  padding:1px 0;
  color:${COLORS.darkGray};
}
.amt-r{
  padding:2.5mm 5mm!important;
}
.amt-r .val{
  text-align:right;
  min-width:28mm;
  padding-left:4mm;
  font-variant-numeric:tabular-nums;
}
.amt-total{
  padding:3mm 5mm!important;
}
.amt-total .val{
  text-align:right;
  padding-left:4mm;
  font-variant-numeric:tabular-nums;
}
.sig-box,.sig{
  padding-top:3mm;
  padding-bottom:10mm;
  min-height:18mm;
}
`;

/** 報價單／派工單中文：靜態比例字型，禁止窄體／可變寬度軸。 */
export const PRINT_CJK_FONT_STACK =
  '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

/** 自架靜態 woff2 + 系統正黑體；不用 Google variable／unicode-range 切片（html2canvas 會變形）。 */
export const PRINT_CJK_FONT_FACE_CSS = `
@font-face{
  font-family:"Noto Sans TC";font-style:normal;font-weight:400;font-stretch:100%;font-display:block;
  src:local("Microsoft JhengHei"),local("Microsoft JhengHei UI"),local("PingFang TC"),local("Noto Sans CJK TC");
}
@font-face{
  font-family:"Noto Sans TC";font-style:normal;font-weight:700;font-stretch:100%;font-display:block;
  src:local("Microsoft JhengHei Bold"),local("Microsoft JhengHei"),local("PingFang TC"),local("Noto Sans CJK TC Bold"),local("Noto Sans CJK TC");
}
@font-face{
  font-family:"Noto Sans TC";font-style:normal;font-weight:400;font-stretch:100%;font-display:block;
  src:url("/fonts/NotoSansTC-latin-400.woff2") format("woff2");
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face{
  font-family:"Noto Sans TC";font-style:normal;font-weight:700;font-stretch:100%;font-display:block;
  src:url("/fonts/NotoSansTC-latin-700.woff2") format("woff2");
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face{
  font-family:"Noto Sans TC";font-style:normal;font-weight:400;font-stretch:100%;font-display:block;
  src:url("/fonts/NotoSansTC-TC-400.woff2") format("woff2");
  unicode-range:U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF;
}
@font-face{
  font-family:"Noto Sans TC";font-style:normal;font-weight:700;font-stretch:100%;font-display:block;
  src:url("/fonts/NotoSansTC-TC-700.woff2") format("woff2");
  unicode-range:U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF;
}
`;

export function printFontLinksHtml(): string {
  return `<style data-print-cjk-font>${PRINT_CJK_FONT_FACE_CSS}</style>`;
}

/**
 * 套在列印根節點與工程設備表格：clone 進主文件時不會繼承 App 的 Inter。
 * 禁止 scale／zoom／font-stretch／過度 letter-spacing。
 */
export const PRINT_CJK_METRIC_CSS = `
.quotation-print-page,.sheet,.page,.cp-mat-block,.eq-table{
  font-family:${PRINT_CJK_FONT_STACK}!important;
  font-stretch:100%!important;
  font-synthesis:none!important;
  font-variation-settings:normal!important;
  font-optical-sizing:none!important;
  transform:none!important;
  zoom:normal!important;
}
.eq-table,.eq-table th,.eq-table td,
.cp-mat-header,.cp-mat-row,.cp-mat-no,.cp-mat-name,.cp-mat-qty{
  font-family:${PRINT_CJK_FONT_STACK}!important;
  font-stretch:100%!important;
  font-synthesis:none!important;
  font-variation-settings:normal!important;
  font-optical-sizing:none!important;
  transform:none!important;
  zoom:normal!important;
  letter-spacing:0!important;
  word-spacing:normal!important;
  font-kerning:normal!important;
}
.eq-table{
  table-layout:fixed;
  width:100%;
  border-collapse:collapse;
}
.eq-table th,.eq-table td{
  vertical-align:middle!important;
  overflow:visible!important;
  white-space:normal;
  word-break:break-word;
  overflow-wrap:break-word;
  line-height:1.4!important;
  border:1px solid #ccc!important;
  color:#111!important;
}
.eq-table .head-row{background:#f4f4f4!important;color:#111!important}
.eq-table .head-row th{
  font-size:14px!important;
  font-weight:700!important;
  text-align:center!important;
  padding:10px 6px!important;
  min-height:0!important;
  white-space:nowrap!important;
}
.eq-table tbody td{
  font-size:16px!important;
  font-weight:400!important;
  text-align:center!important;
  padding:10px 8px!important;
  min-height:0!important;
}
.eq-table .col-item,td.col-item{
  font-size:18px!important;
  font-weight:700!important;
  text-align:left!important;
  padding:10px 10px!important;
}
.eq-table .col-cat,.eq-table .col-brand,.eq-table .col-model,
.eq-table .col-qty,.eq-table .col-unit,.eq-table .col-price,.eq-table .col-sub{
  font-size:16px!important;
  font-weight:700!important;
  text-align:center!important;
}
.eq-table .col-cat,.eq-table .col-brand{white-space:nowrap}
.eq-table .col-qty,.eq-table .col-unit{white-space:nowrap}
.eq-table .col-model{overflow-wrap:anywhere}
.eq-table .col-notes{font-size:13px!important;font-weight:400!important;text-align:center!important}
`;

/**
 * 報價單／派工單列印視覺（僅這兩份單據引用）。
 * 必須接在各 template 自己的 CSS 之後。出貨單／對帳單不要引用。
 * 層級：工程設備明細 > 客戶資料 > 其他資訊 > 主標題／金額。
 */
export const PRINT_DOC_TYPE_CSS = `
${PRINT_CJK_FONT_FACE_CSS}
body{
  font-family:${PRINT_CJK_FONT_STACK}!important;
  font-stretch:100%!important;
  font-synthesis:none!important;
  font-variation-settings:normal!important;
  font-weight:400;
  color:#111!important;
  background:#fff!important;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
${PRINT_CJK_METRIC_CSS}
.co-name{font-size:15px!important;font-weight:700;line-height:1.4!important;color:#111!important}
.co-sub,.co-info{font-size:12px!important;font-weight:400;line-height:1.4!important;color:#555!important}
.doc-label,.wo-label{
  font-size:28px!important;font-weight:700!important;line-height:1.2!important;
  color:#111!important;letter-spacing:2px!important;
}
.doc-en{font-size:12px!important;font-weight:500;color:#888!important;letter-spacing:2px!important}
.doc-no,.wo-num{font-size:13px!important;font-weight:600;line-height:1.4!important}
.doc-dates,.wo-meta,.pf,.sig-date{font-size:12px!important;font-weight:400;line-height:1.4!important;color:#666!important}
.stitle,.sec-title,.bank-title,.eq-title{
  color:#111!important;
  background:transparent!important;
  border:none!important;
  padding:0 0 2mm!important;
  margin:0 0 2.5mm!important;
  letter-spacing:0!important;
  display:block!important;
  width:fit-content;
  max-width:100%;
  border-bottom:2.5px solid ${COLORS.primary}!important;
  font-weight:700!important;
  line-height:1.3!important;
  font-family:${PRINT_CJK_FONT_STACK}!important;
  font-stretch:100%!important;
  transform:none!important;
  zoom:normal!important;
}
.eq-title,.stitle-eq{font-size:19px!important}
.stitle,.sec-title,.bank-title{font-size:16px!important}
.info-label,.lbl{font-size:13px!important;font-weight:500!important;color:#666!important}
.info-value,.val,.info-grid strong{font-size:16px!important;font-weight:600!important;color:#111!important;line-height:1.4!important}
.amt-r{font-size:13px!important;font-weight:500!important;line-height:1.4!important}
.amt-r .val{font-size:14px!important;font-weight:600!important}
.amt-total .lbl{font-size:16px!important;font-weight:700!important;color:#111!important}
.amt-total .val{font-size:24px!important;font-weight:700!important;color:#111!important}
.box,.notes-box,.remarks-box{font-size:14px!important;line-height:1.45!important;font-weight:400}
.note-line{font-size:13px!important;line-height:1.45!important}
.bank-row{font-size:13px!important;line-height:1.4!important}
.sig-box,.sig{font-size:13px!important;line-height:1.4!important;min-height:14mm!important;padding-bottom:6mm!important}
`;
