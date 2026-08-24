// 報價單 Template — A4 Portrait, 正式工程文件風格
// 獨立版面：修改此檔不影響其他 Template

import { logoUrl, COMPANY, COLORS, esc, fmtMoney, PRINT_DOC_TYPE_CSS, PRINT_CJK_FONT_STACK, printFontLinksHtml } from "./brand-config";
import { computeQuoteAmounts } from "../quote-amounts";
import { displayQuoteItemCategory } from "./printCategory";

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
  const TABLE_COL_WIDTHS = [
    "5%",
    "12%",
    "8%",
    "20%",
    "14%",
    "7%",
    "8%",
    "10%",
    "10%",
    "6%",
  ] as const;

  function renderItemRow(item: any, index: number): string {
    const category = displayQuoteItemCategory(item);
    const cells = [
      `<td class="tac">${index + 1}</td>`,
      `<td class="tac col-cat">${esc(category)}</td>`,
      `<td class="tac col-brand">${esc(item.brand || "—")}</td>`,
      `<td class="tal col-item">${esc(item.itemName || "")}</td>`,
      `<td class="tac col-model">${esc(item.model || "—")}</td>`,
      `<td class="tac col-qty">${Number(item.quantity ?? 0)}</td>`,
      `<td class="tac col-unit">${esc(item.unit || "")}</td>`,
      `<td class="tac col-price">${fmtMoney(Number(item.unitPrice ?? 0))}</td>`,
      `<td class="tac col-sub">${fmtMoney(Number(item.subtotal ?? 0))}</td>`,
      `<td class="tac col-notes">${esc(item.notes || "")}</td>`,
    ];
    if (cells.length !== TABLE_HEADERS.length) {
      throw new Error(
        `Quotation PDF column mismatch: row has ${cells.length} cells, header has ${TABLE_HEADERS.length}`,
      );
    }
    return `<tr>${cells.join("")}</tr>`;
  }

  const itemRows = items.map((item, index) => renderItemRow(item, index)).join("");

  const colgroupHtml = TABLE_COL_WIDTHS.map((w) => `<col style="width:${w}">`).join("");
  const theadHtml = TABLE_HEADERS.map((label) => `<th>${label}</th>`).join("");

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
html,body{margin:0;padding:0}
body,.quotation-print-page{
  font-family:${PRINT_CJK_FONT_STACK};
  font-stretch:100%;font-synthesis:none;font-variation-settings:normal;
  font-size:14px;font-weight:400;line-height:1.4;color:#111;background:#fff;
  transform:none;zoom:normal;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

@page{size:A4 portrait;margin:10mm 12mm}
.quotation-print-page{
  width:100%;
  min-height:calc(297mm - 20mm);
  margin:0;padding:0;
  display:flex;flex-direction:column;
  break-after:auto;page-break-after:auto;
}
.quotation-print-content{flex:0 0 auto}
.quotation-signature-section{
  margin-top:auto;
  break-inside:avoid;page-break-inside:avoid;
}

.hdr{
  display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:1px solid #ddd;
  padding-bottom:4mm;margin-bottom:5mm;
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

.sec{margin-bottom:5mm}
.stitle{
  color:#111;font-size:16px;font-weight:700;
  background:transparent;border:none;
  padding:0 0 1.5mm;margin:0 0 3mm;
  display:block;width:fit-content;
  border-bottom:2.5px solid ${COLORS.primary};
  letter-spacing:0;line-height:1.3;
}
.eq-title{
  color:#111;font-size:19px;font-weight:700;
  background:transparent;border:none;
  padding:0 0 1.5mm;margin:0 0 3mm;
  display:block;width:fit-content;
  border-bottom:2.5px solid ${COLORS.primary};
  letter-spacing:0;line-height:1.3;
}

.eq-wrap{width:100%;max-width:100%;overflow:visible}
.eq-table{
  width:100%;max-width:100%;
  border-collapse:collapse;border-spacing:0;
  table-layout:fixed;font-size:16px;line-height:1.4;
  font-family:${PRINT_CJK_FONT_STACK};
  font-stretch:100%;transform:none;zoom:normal;
}
.eq-table .head-row{background:#f4f4f4;color:#111}
.eq-table .head-row th{
  border:1px solid #ccc;
  font-size:14px;font-weight:700;text-align:center;vertical-align:middle;
  box-sizing:border-box;
  padding:10px 8px;
  line-height:1.4;color:#111;
  font-stretch:100%;letter-spacing:0;transform:none;zoom:normal;
}
.eq-table tbody td{
  border:1px solid #ccc;
  vertical-align:middle;font-size:16px;font-weight:500;
  box-sizing:border-box;
  padding:10px 8px;
  line-height:1.4;color:#111;text-align:center;
  font-stretch:100%;letter-spacing:0;transform:none;zoom:normal;
  overflow:visible;
}
.eq-table .col-item{
  font-size:18px;font-weight:700;text-align:left;
  word-wrap:break-word;word-break:break-word;white-space:normal;
}
.eq-table .col-cat,.eq-table .col-brand,.eq-table .col-model,
.eq-table .col-qty,.eq-table .col-unit,.eq-table .col-price,.eq-table .col-sub,
.eq-table .col-notes{
  text-align:center;font-weight:700;font-size:16px;
}
.eq-table .col-notes{font-size:13px;font-weight:400}
.eq-table tr{page-break-inside:avoid;break-inside:avoid}

.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.muted{color:#888}

.info-block{
  display:grid;grid-template-columns:1fr 1fr 1fr;
  gap:3mm 8mm;
  padding:1mm 0 1mm;
}
.info-item{display:flex;flex-direction:column;gap:1mm;min-width:0}
.info-item.span2{grid-column:span 2}
.info-label{font-size:13px;font-weight:500;color:#666;line-height:1.3}
.info-value{font-size:16px;font-weight:600;color:#111;line-height:1.4;word-break:break-word}

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
.amt-total .lbl{color:#111;font-size:16px;font-weight:700}
.amt-total .val{color:#111;font-size:24px;font-weight:700}

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
    width:210mm;
    margin:0!important;padding:0!important;
    overflow:visible!important;
  }
  .quotation-print-page{
    width:auto;
    min-height:calc(297mm - 20mm);
    height:auto;
    margin:0;padding:0;
    overflow:visible;
    break-after:auto;page-break-after:auto;
  }
  .quotation-signature-section{
    margin-top:auto;
    break-inside:avoid;page-break-inside:avoid;
  }
  .notes-totals-row,.amt-box,.bank-box,.sig-row,.quotation-signature-section{
    page-break-inside:avoid;break-inside:avoid;
  }
  .eq-table tr{page-break-inside:avoid;break-inside:avoid}
}
${PRINT_DOC_TYPE_CSS}
</style>
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
        <div class="info-item span2">
          <span class="info-label">施工地址</span>
          <span class="info-value">${esc(quote.address) || "—"}</span>
        </div>
        <div class="info-item">
          <span class="info-label">稅別</span>
          <span class="info-value">${esc(taxType)}</span>
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
            <div class="stitle">備註事項</div>
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
      <div class="sig-box">客戶確認簽名<br><span class="sig-date">日期：________</span></div>
      <div class="sig-box">業務簽名<br><span class="sig-date">日期：________</span></div>
      <div class="sig-box">公　司　章<br><span class="sig-date">&nbsp;</span></div>
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
