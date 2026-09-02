// 報價單 Template — A4 Portrait, 正式工程文件風格
// 獨立版面：修改此檔不影響其他 Template

import { logoUrl, COMPANY, COLORS, esc, fmtMoney, PRINT_DOC_TYPE_CSS, PRINT_CJK_FONT_STACK, printFontLinksHtml } from "./brand-config";
import { computeQuoteAmounts } from "../quote-amounts";
import { displayQuoteItemCategory, displayQuoteItemBrand } from "./printCategory";

/** A4 直式工程設備明細：固定欄寬，避免 PDF 依內容重分配。 */
export const QUOTE_EQ_COL_WIDTHS = [
  "4%",
  "10%",
  "7%",
  "22%",
  "16%",
  "5%",
  "5%",
  "10%",
  "10%",
  "11%",
] as const;

function quoteEqColWidthCss(prefix: string): string {
  return QUOTE_EQ_COL_WIDTHS.map((w, i) => {
    const n = i + 1;
    return `${prefix} col:nth-child(${n}),${prefix} th:nth-child(${n}),${prefix} td:nth-child(${n}){width:${w}!important;max-width:${w}!important;min-width:0!important}`;
  }).join("\n");
}

export function buildQuotationHtml(quote: any, baseOrigin?: string): string {
  // Line items come only from quotation.items (quotes / quote_items).
  // Never fall back to work-order equipmentItems or other dispatch fields.
  const items: any[] = Array.isArray(quote?.items) ? quote.items : [];
  const d = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const quoteNo = `Q-${ymd}-${String(quote.id).padStart(4, "0")}`;
  const quoteDate = d.toLocaleDateString("zh-TW");
  const validDate = new Date(d.getTime() + 30 * 86400000).toLocaleDateString("zh-TW");
  const printDate = new Date().toLocaleDateString("zh-TW");
  const taxType = quote.taxType || "未稅";

  const rawTotal = items.length > 0
    ? items.reduce((s: number, i: any) => s + Number(i.subtotal || 0), 0)
    : Number(quote.finalAmount ?? quote.amount ?? 0);
  const { discAmt, preTax, taxAmt, total } = computeQuoteAmounts(
    rawTotal,
    Number(quote.discountAmount ?? 0),
    taxType,
  );

  const TABLE_HEADERS = [
    "項次",
    "類別",
    "品牌",
    "品項／規格",
    "型號",
    "數量",
    "單位",
    "單價",
    "小計",
    "備註",
  ] as const;
  /* A4 186mm 固定欄寬（第二組）：品項／型號／備註優先，品牌縮窄。 */
  const TABLE_COL_WIDTHS = QUOTE_EQ_COL_WIDTHS;

  function fieldText(raw: unknown): string {
    return String(raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  /** Escape + preserve author line breaks. Never concatenate 品項／型號／備註. */
  function cellText(raw: unknown): string {
    const text = fieldText(raw);
    if (!text) return "";
    return text.split("\n").map((line) => esc(line)).join("<br>");
  }

  /** If 備註 already lives inside 品項／規格, do not print the same sentence again. */
  function notesIfNotDuplicated(itemNameRaw: unknown, notesRaw: unknown): string {
    const name = fieldText(itemNameRaw);
    const notes = fieldText(notesRaw);
    if (!notes) return "";
    if (name.includes(notes)) return "";
    return notes;
  }

  const EQ_TABLE_FLOW_CSS = `
.quotation-print-page .eq-wrap{
  width:100%!important;
  max-width:100%!important;
  overflow:hidden!important;
}
.quotation-print-page .eq-table{
  table-layout:fixed!important;
  width:100%!important;
  max-width:100%!important;
  height:auto!important;
  max-height:none!important;
  border-collapse:collapse!important;
  border-spacing:0!important;
  font-size:15px!important;
  line-height:1.35!important;
  transform:none!important;
}
${quoteEqColWidthCss(".quotation-print-page .eq-table")}
.quotation-print-page .eq-table tr,
.quotation-print-page .eq-table thead tr,
.quotation-print-page .eq-table tbody tr{
  height:auto!important;
  max-height:none!important;
  min-height:0!important;
}
.quotation-print-page .eq-table th,
.quotation-print-page .eq-table td{
  box-sizing:border-box!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  padding:6px 5px!important;
  vertical-align:middle!important;
  white-space:normal!important;
  word-break:break-word!important;
  overflow-wrap:anywhere!important;
  line-height:1.35!important;
  overflow:hidden!important;
  position:static!important;
  transform:none!important;
  top:auto!important;
  left:auto!important;
}
.quotation-print-page .eq-table .head-row,
.quotation-print-page .eq-table .head-row th{
  background:#111!important;color:#fff!important;
  border-color:#111!important;
  text-align:center!important;
  font-weight:700!important;font-size:13px!important;
  white-space:normal!important;
  word-break:break-word!important;
  overflow-wrap:anywhere!important;
  padding:6px 5px!important;
  line-height:1.35!important;
}
.quotation-print-page .eq-table .head-row th.col-no,
.quotation-print-page .eq-table .head-row th.col-qty,
.quotation-print-page .eq-table .head-row th.col-unit{
  white-space:nowrap!important;
  padding:6px 2px!important;
}
.quotation-print-page .eq-table tbody td{
  font-size:15px!important;
  line-height:1.35!important;
}
.quotation-print-page .eq-table tbody td .cell-text{
  display:block!important;
  width:100%!important;
  max-width:100%!important;
  box-sizing:border-box!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  padding:0!important;
  position:static!important;
  transform:none!important;
  white-space:inherit!important;
  overflow-wrap:anywhere!important;
  word-break:break-word!important;
  line-height:1.35!important;
  overflow:hidden!important;
}
.quotation-print-page .eq-table .col-no,
.quotation-print-page .eq-table .col-qty,
.quotation-print-page .eq-table .col-unit,
.quotation-print-page .eq-table .col-no .cell-text,
.quotation-print-page .eq-table .col-qty .cell-text,
.quotation-print-page .eq-table .col-unit .cell-text{
  white-space:nowrap!important;
  text-align:center!important;
  word-break:keep-all!important;
  overflow-wrap:normal!important;
}
.quotation-print-page .eq-table .col-cat,
.quotation-print-page .eq-table .col-cat .cell-text{
  font-size:15px!important;font-weight:600!important;
  text-align:center!important;
}
.quotation-print-page .eq-table .col-brand,
.quotation-print-page .eq-table .col-brand .cell-text{
  font-size:15px!important;font-weight:600!important;
  text-align:center!important;
  white-space:normal!important;
}
.quotation-print-page .eq-table .col-item,
.quotation-print-page .eq-table .col-item .cell-text{
  font-size:16px!important;font-weight:700!important;
  text-align:left!important;
  white-space:normal!important;
}
.quotation-print-page .eq-table .col-model,
.quotation-print-page .eq-table .col-model .cell-text{
  font-size:15px!important;font-weight:600!important;
  text-align:center!important;
  white-space:normal!important;
}
.quotation-print-page .eq-table tbody td.col-price,
.quotation-print-page .eq-table tbody td.col-sub,
.quotation-print-page .eq-table .col-price .cell-text,
.quotation-print-page .eq-table .col-sub .cell-text{
  white-space:nowrap!important;
  word-break:keep-all!important;
  overflow-wrap:normal!important;
  font-size:15px!important;
  font-weight:600!important;
  font-variant-numeric:tabular-nums;
  text-align:center!important;
}
.quotation-print-page .eq-table .col-notes,
.quotation-print-page .eq-table .col-notes .cell-text{
  font-size:13px!important;font-weight:400!important;
  text-align:center!important;
  white-space:normal!important;
}
.quotation-print-page .amt-total .lbl{font-size:14px!important;font-weight:700!important}
.quotation-print-page .amt-total .val{font-size:16px!important;font-weight:700!important}
.quotation-print-page .info-label{font-size:12px!important;font-weight:500!important;color:#888!important}
.quotation-print-page .info-value{font-size:15px!important;font-weight:600!important}
`;

  function td(className: string, inner: string): string {
    return `<td class="${className}"><div class="cell-text">${inner}</div></td>`;
  }

  function renderItemRow(item: any, index: number): string {
    const category = displayQuoteItemCategory(item);
    const brand = displayQuoteItemBrand(item);
    const itemName = cellText(item.itemName || "");
    const model = cellText(item.model) || "—";
    const notes = cellText(notesIfNotDuplicated(item.itemName, item.notes));
    const cells = [
      td("tac col-no", String(index + 1)),
      td("tac col-cat", cellText(category)),
      td("tac col-brand", cellText(brand)),
      td("tal col-item", itemName),
      td("tac col-model", model),
      td("tac col-qty", String(Number(item.quantity ?? 0))),
      td("tac col-unit", cellText(item.unit || "")),
      td("tac col-price", esc(fmtMoney(Number(item.unitPrice ?? 0)))),
      td("tac col-sub", esc(fmtMoney(Number(item.subtotal ?? 0)))),
      td("tac col-notes", notes),
    ];
    if (cells.length !== TABLE_HEADERS.length) {
      throw new Error(
        `Quotation PDF column mismatch: row has ${cells.length} cells, header has ${TABLE_HEADERS.length}`,
      );
    }
    return `<tr>${cells.join("")}</tr>`;
  }

  const itemRows = items.map((item, index) => renderItemRow(item, index)).join("");

  const TH_CLASSES = [
    "col-no",
    "col-cat",
    "col-brand",
    "col-item",
    "col-model",
    "col-qty",
    "col-unit",
    "col-price",
    "col-sub",
    "col-notes",
  ] as const;
  const colgroupHtml = TABLE_COL_WIDTHS.map((w) => `<col style="width:${w}">`).join("");
  const theadHtml = TABLE_HEADERS.map(
    (label, i) => `<th class="${TH_CLASSES[i]}">${label}</th>`,
  ).join("");

  const notesList = (quote.notes ?? "").split(/\n/).filter((l: string) => l.trim()).slice(0, 3)
    .map((l: string) => `<div class="note-line">${esc(l)}</div>`).join("")
    || `<div class="note-line muted">報價單有效期限30日，施工前請支付50%訂金，完工驗收後付清尾款。</div>`;

  const discountVal = discAmt > 0
    ? `<span class="val disc-val">– ${fmtMoney(discAmt)}</span>`
    : `<span class="val">${fmtMoney(0)}</span>`;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>報價單 ${quoteNo}</title>
${printFontLinksHtml()}
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{
  margin:0;padding:0;
  width:186mm;
  min-height:277mm;
}
body,.quotation-print-page{
  font-family:${PRINT_CJK_FONT_STACK};
  font-synthesis:none;font-variation-settings:normal;
  font-size:14px;font-weight:400;line-height:1.4;color:#111;background:#fff;
  transform:none;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

@page{size:A4 portrait;margin:10mm 12mm} /* 紙張 210mm × 297mm 直式；左右 12mm、上下 10mm */
.quotation-print-page{
  width:186mm;
  max-width:186mm;
  min-height:277mm;
  margin:0;padding:0;
  display:flex;flex-direction:column;
  break-after:auto;page-break-after:auto;
  transform:none;
}
.quotation-print-content{flex:0 0 auto}
.quotation-signature-section{
  margin-top:auto;
  break-inside:avoid;page-break-inside:avoid;
}

.hdr{
  display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:1px solid #ddd;
  padding-bottom:3mm;margin-bottom:3.5mm;
}
.co{display:flex;align-items:flex-start;gap:3.5mm}
.co-logo{
  width:48px;height:48px;max-width:48px;max-height:48px;
  object-fit:contain;flex-shrink:0;
}
.co-name{font-size:15px;font-weight:700;letter-spacing:0.3px;line-height:1.4;color:#111}
.co-sub{font-size:12px;font-weight:400;color:#666;margin-top:1px;line-height:1.4}
.co-info{font-size:12px;font-weight:400;color:#666;margin-top:2px;line-height:1.45}
.doc-r{text-align:right}
.doc-label{font-size:28px;font-weight:700;color:#111;letter-spacing:2px;line-height:1.2}
.doc-en{font-size:12px;font-weight:500;color:#888;letter-spacing:2px;line-height:1.4;margin-top:1px}
.doc-no{font-size:13px;font-weight:600;margin-top:2mm;line-height:1.4}
.doc-dates{font-size:12px;font-weight:400;color:#666;line-height:1.45;margin-top:1mm}

.sec{margin-bottom:3.5mm}
.stitle{
  color:#111;font-size:16px;font-weight:700;
  background:transparent;border:none;
  padding:0 0 1mm;margin:0 0 2mm;
  display:block;width:fit-content;
  border-bottom:2.5px solid ${COLORS.primary};
  letter-spacing:0;line-height:1.3;
}
.eq-title{
  color:#111;font-size:19px;font-weight:700;
  background:transparent;border:none;
  padding:0 0 1mm;margin:0 0 2mm;
  display:block;width:fit-content;
  border-bottom:2.5px solid ${COLORS.primary};
  letter-spacing:0;line-height:1.3;
}

.eq-wrap{width:100%;max-width:100%;overflow:hidden}
.eq-table{
  width:100%;max-width:100%;
  border-collapse:collapse;border-spacing:0;
  table-layout:fixed;font-size:15px;line-height:1.35;
  font-family:${PRINT_CJK_FONT_STACK};
  transform:none;height:auto;
}
.eq-table .head-row{background:#111;color:#fff}
.eq-table .head-row th{
  background:#111;color:#fff;
  border:1px solid #111;
  font-size:13px;font-weight:700;
  text-align:center;vertical-align:middle;
  box-sizing:border-box;
  padding:6px 5px;
  height:auto;max-height:none;min-height:0;
  line-height:1.35;letter-spacing:0;transform:none;
  white-space:normal;overflow:hidden;position:static;
  word-break:break-word;overflow-wrap:anywhere;
}
.eq-table tbody td{
  border:1px solid #ccc;
  vertical-align:middle;font-size:15px;font-weight:500;
  box-sizing:border-box;
  padding:6px 5px;
  height:auto;max-height:none;min-height:0;
  line-height:1.35;color:#111;text-align:center;
  letter-spacing:0;transform:none;position:static;
  overflow:hidden;white-space:normal;
  word-break:break-word;overflow-wrap:anywhere;
}
.eq-table tbody td .cell-text{
  display:block;width:100%;max-width:100%;
  height:auto;max-height:none;min-height:0;
  position:static;transform:none;top:auto;left:auto;
  white-space:inherit;overflow-wrap:anywhere;word-break:break-word;
  line-height:1.35;overflow:hidden;box-sizing:border-box;
}
.eq-table .col-item,.eq-table .col-item .cell-text{
  font-size:16px;font-weight:700;text-align:left;
}
.eq-table .col-cat,.eq-table .col-cat .cell-text{
  text-align:center;font-weight:600;font-size:15px;
}
.eq-table .col-brand,.eq-table .col-model,
.eq-table .col-qty,.eq-table .col-unit,.eq-table .col-price,.eq-table .col-sub,
.eq-table .col-brand .cell-text,.eq-table .col-model .cell-text,
.eq-table .col-qty .cell-text,.eq-table .col-unit .cell-text,
.eq-table .col-price .cell-text,.eq-table .col-sub .cell-text{
  text-align:center;font-weight:600;font-size:15px;
}
.eq-table .col-model .cell-text{font-variant-ligatures:none}
.eq-table .col-price .cell-text,.eq-table .col-sub .cell-text{
  font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap;
}
.eq-table .col-notes,.eq-table .col-notes .cell-text{
  font-size:13px;font-weight:400;text-align:center;
}
.eq-table tr,.eq-table tbody tr{
  height:auto;max-height:none;min-height:0;
  page-break-inside:avoid;break-inside:avoid;
}

.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.muted{color:#888}

.info-block{
  display:flex;flex-direction:column;gap:3.5mm;
  padding:1mm 0 2mm;
}
.info-row{
  display:grid;grid-template-columns:1fr 1fr 1fr;
  gap:2.5mm 8mm;
}
.info-row.addr-row{grid-template-columns:2fr 1fr}
.info-item{display:flex;flex-direction:column;gap:1mm;min-width:0}
.info-label{font-size:12px;font-weight:500;color:#888;line-height:1.3}
.info-value{font-size:15px;font-weight:600;color:#111;line-height:1.4;word-break:break-word}

.notes-totals-row{
  display:flex;
  gap:5mm;
  align-items:flex-start;
  margin-top:2mm;
  margin-bottom:4mm;
  page-break-inside:avoid;
  break-inside:avoid;
}
.notes-column{flex:1 1 auto;min-width:0}
.totals-column{flex:0 0 62mm;width:62mm;max-width:62mm}
.row2{display:flex;gap:4mm}
.box{
  flex:1;border:1px solid #e5e5e5;
  padding:2.5mm 3mm;font-size:14px;font-weight:400;
  white-space:pre-wrap;line-height:1.45;
  color:#333;background:#fff;
  min-height:12mm;
}
.notes-box{
  border:1px solid #e5e5e5;
  padding:2.5mm 3mm;font-size:13px;font-weight:400;
  line-height:1.45;min-height:12mm;background:#fff;
}
.note-line{font-size:13px;line-height:1.45;color:#333}

.amt-box{
  width:100%;
  border:1px solid #ddd;
  overflow:hidden;
  background:#fff;
}
.amt-r{
  display:flex;justify-content:space-between;align-items:center;
  border-bottom:1px solid #eee;
  font-size:13px;font-weight:500;line-height:1.4;
  padding:1.6mm 3mm;
}
.amt-r .lbl{color:#666;padding-right:3mm;flex-shrink:0;font-weight:500}
.amt-r .val{font-weight:600;text-align:right;flex-shrink:0;font-size:14px;color:#111}
.disc-val{color:${COLORS.red}}
.amt-total{
  background:#fff;
  display:flex;justify-content:space-between;align-items:baseline;
  padding:2mm 3mm;
  border-top:1.5px solid #111;
}
.amt-total .lbl{color:#111;font-size:14px;font-weight:700}
.amt-total .val{color:#111;font-size:16px;font-weight:700}

.bank-box{
  border-top:1px solid #eee;
  padding:3mm 0 1mm;
  margin-bottom:3mm;
}
.bank-title{
  color:#111;font-size:14px;font-weight:700;
  background:transparent;border:none;
  padding:0 0 1.5mm;margin:0 0 2mm;
  display:block;width:fit-content;
  border-bottom:2px solid ${COLORS.primary};
}
.bank-row{
  display:flex;gap:6mm;font-size:13px;font-weight:400;
  color:#333;line-height:1.4;flex-wrap:wrap;
}
.bank-row span{white-space:nowrap}

.sig-row{
  display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm;
  margin-bottom:3mm;
}
.sig-box{
  text-align:center;border-top:1px solid #111;
  font-size:13px;font-weight:500;color:#555;line-height:1.4;
  padding-top:3mm;padding-bottom:8mm;
}
.sig-date{font-size:12px;font-weight:400;color:#888}

.pf{
  display:flex;justify-content:space-between;align-items:center;
  font-size:12px;font-weight:400;color:#888;
  border-top:1px solid #eee;padding-top:2mm;
}

@media print{
  html,body{
    width:186mm;
    min-height:277mm;
    margin:0!important;padding:0!important;
    overflow:visible!important;
  }
  .quotation-print-page{
    width:186mm;
    min-height:277mm;
    height:auto;
    margin:0;padding:0;
    overflow:visible;
    break-after:auto;page-break-after:auto;
    transform:none;
  }
  .quotation-signature-section{
    margin-top:auto;
    break-inside:avoid;page-break-inside:avoid;
  }
  .notes-totals-row,.amt-box,.bank-box,.sig-row,.quotation-signature-section{
    page-break-inside:avoid;break-inside:avoid;
  }
  .eq-table tr,.eq-table tbody tr,.eq-table th,.eq-table td,.eq-table .cell-text{
    height:auto!important;
    max-height:none!important;
    min-height:unset!important;
    page-break-inside:avoid;break-inside:avoid;
  }
${EQ_TABLE_FLOW_CSS}
}
${PRINT_DOC_TYPE_CSS}
.quotation-print-page,.quotation-print-page *{transform:none!important}
${EQ_TABLE_FLOW_CSS}
@media print{
${EQ_TABLE_FLOW_CSS}
}</style>
</head>
<body>
<div class="quotation-print-page">
  <header class="hdr">
    <div class="co">
      <img src="${logoUrl(baseOrigin)}" class="co-logo" alt="">
      <div>
        <div class="co-name">${COMPANY.name}</div>
        <div class="co-sub">${COMPANY.subTitle}</div>
        <div class="co-info">
          ${COMPANY.taxId}　${COMPANY.phone}<br>
          ${COMPANY.email}<br>
          ${COMPANY.address}
        </div>
      </div>
    </div>
    <div class="doc-r">
      <div class="doc-label">報價單</div>
      <div class="doc-en">QUOTATION</div>
      <div class="doc-no">${quoteNo}</div>
      <div class="doc-dates">
        狀態：${esc(quote.status || "待確認")}<br>
        報價日期：${quoteDate}<br>
        有效期限：${validDate}<br>
        列印：${printDate}
      </div>
    </div>
  </header>

  <main class="quotation-print-content">
    <div class="sec">
      <div class="stitle">客戶資訊</div>
      <div class="info-block">
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">客戶名稱</span>
            <span class="info-value">${esc(quote.customerName) || "—"}</span>
          </div>
          <div class="info-item">
            <span class="info-label">聯絡電話</span>
            <span class="info-value">${esc(quote.customerPhone) || "—"}</span>
          </div>
          <div class="info-item">
            <span class="info-label">負責業務</span>
            <span class="info-value">${esc(quote.salesRepName) || "—"}</span>
          </div>
        </div>
        <div class="info-row addr-row">
          <div class="info-item">
            <span class="info-label">施工地址</span>
            <span class="info-value">${esc(quote.address) || "—"}</span>
          </div>
          <div class="info-item">
            <span class="info-label">稅別</span>
            <span class="info-value">${esc(taxType)}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="eq-title">工程設備明細</div>
      <div class="eq-wrap">
        <table class="eq-table">
          <colgroup>${colgroupHtml}</colgroup>
          <thead><tr class="head-row">${theadHtml}</tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>

    <div class="notes-totals-row">
      <div class="notes-column">
        <div class="row2">
          <div style="flex:0 0 55%">
            <div class="stitle">服務內容</div>
            <div class="box">${esc(quote.description) || "施工方式：\n施工天數：\n注意事項："}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div class="stitle">備註</div>
            <div class="notes-box">${notesList}</div>
          </div>
        </div>
      </div>
      <div class="totals-column">
        <div class="stitle">金額總計</div>
        <div class="amt-box">
          <div class="amt-r"><span class="lbl">項目小計</span><span class="val">${fmtMoney(rawTotal)}</span></div>
          <div class="amt-r"><span class="lbl">折扣</span>${discountVal}</div>
          <div class="amt-r"><span class="lbl">未稅小計</span><span class="val">${fmtMoney(preTax)}</span></div>
          <div class="amt-r"><span class="lbl">稅額 5%</span><span class="val">${fmtMoney(taxAmt)}</span></div>
          <div class="amt-total"><span class="lbl">含稅總計</span><span class="val">${fmtMoney(total)}</span></div>
        </div>
      </div>
    </div>

    <div class="bank-box">
      <div class="bank-title">匯款資訊</div>
      <div class="bank-row">
        <span><strong>銀行代碼：</strong>${COMPANY.bankCode}</span>
        <span><strong>帳號：</strong>${COMPANY.bankAccount}</span>
        <span><strong>戶名：</strong>${COMPANY.bankAccountName}</span>
      </div>
    </div>
  </main>

  <footer class="quotation-signature-section">
    <div class="sig-row">
      <div class="sig-box">客戶簽名</div>
      <div class="sig-box">業務簽名</div>
      <div class="sig-box">日期</div>
    </div>
    <div class="pf">
      <div>${COMPANY.name}　${COMPANY.phone}　${COMPANY.address}</div>
      <div>列印：${printDate}</div>
    </div>
  </footer>
</div>
</body>
</html>`;
}
