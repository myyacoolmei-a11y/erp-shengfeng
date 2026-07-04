// 報價單 Template — A4 Portrait, 正式工程文件風格
// 獨立版面：修改此檔不影響其他 Template

import { logoUrl, COMPANY, COLORS, esc, fmtMoney } from "./brand-config";

export function buildQuotationHtml(quote: any): string {
  const items: any[] = quote.items ?? [];
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
  const discAmt = Number(quote.discountAmount ?? 0);
  const subtotal = Math.max(0, rawTotal - discAmt);
  const taxRate = taxType === "含稅" ? 0 : 0.05;
  const preTax = taxType === "含稅" ? subtotal / 1.05 : subtotal;
  const taxAmt = subtotal - preTax;
  const total = preTax + taxAmt;

  // Max 10 rows for A4 single page
  const maxRows = 10;
  const displayItems = items.slice(0, maxRows);
  const itemRows = displayItems.length > 0
    ? displayItems.map((item: any, i: number) => `
      <tr>
        <td class="tac">${i + 1}</td>
        <td class="tac">${esc(item.category)}</td>
        <td class="tac">${esc(item.brand || "—")}</td>
        <td class="tal">${esc(item.itemName)}</td>
        <td class="tac">${Number(item.quantity)}</td>
        <td class="tac">${esc(item.unit)}</td>
        <td class="tar">${fmtMoney(Number(item.unitPrice))}</td>
        <td class="tar fw7">${fmtMoney(Number(item.subtotal))}</td>
        <td class="tal small">${esc(item.notes || "")}</td>
      </tr>`).join("")
    : `<tr>
        <td class="tac">1</td>
        <td class="tac">工程</td>
        <td class="tac">—</td>
        <td class="tal">${esc(quote.title)}</td>
        <td class="tac">1</td>
        <td class="tac">式</td>
        <td class="tar">${fmtMoney(rawTotal)}</td>
        <td class="tar fw7">${fmtMoney(rawTotal)}</td>
        <td class="tal small"></td>
      </tr>`;

  const padCount = Math.max(0, maxRows - displayItems.length - (items.length === 0 ? 1 : 0));
  const padRows = Array.from({ length: padCount }, () => `
    <tr>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>`).join("");

  const notesList = (quote.notes ?? "").split(/\n/).filter((l: string) => l.trim()).slice(0, 3)
    .map((l: string) => `<div class="note-line">${esc(l)}</div>`).join("")
    || `<div class="note-line muted">報價單有效期限30日，施工前請支付50%訂金，完工驗收後付清尾款。</div>`;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>報價單 ${quoteNo}</title>
<style>
/* ===== Base ===== */
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:'Microsoft JhengHei','\u5fae\u8edf\u6b63\u9ed1\u9ad4',Arial,sans-serif;
  font-size:10pt;color:${COLORS.black};background:#fff;
}

/* ===== Page setup ===== */
@page{size:A4 portrait;margin:12mm}
.page{
  width:186mm;min-height:273mm;
  padding:0;
  position:relative;
}

/* ===== Logo & Header ===== */
.hdr{
  display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:2.5px solid ${COLORS.black};
  padding-bottom:4mm;margin-bottom:3mm;
}
.co{display:flex;align-items:center;gap:3mm}
.co-logo{
  width:55px;height:55px;max-width:55px;max-height:55px;
  object-fit:contain;flex-shrink:0;
  border:1px solid ${COLORS.borderGray};border-radius:3px;
}
.co-name{font-size:13pt;font-weight:700;letter-spacing:0.5px}
.co-sub{font-size:7.5pt;color:${COLORS.midGray};margin-top:1px}
.co-info{font-size:7pt;color:${COLORS.lightGray};margin-top:2px;line-height:1.6}
.doc-r{text-align:right}
.doc-label{font-size:16pt;font-weight:700;color:${COLORS.primary};letter-spacing:4px}
.doc-en{font-size:7pt;color:#aaa;letter-spacing:1px}
.doc-no{font-size:9pt;font-weight:700;font-family:monospace;margin-top:2px}
.doc-dates{font-size:7.5pt;color:${COLORS.midGray};line-height:1.6;margin-top:1px}

/* ===== Section titles ===== */
.sec{margin-bottom:2.5mm}
.stitle{
  font-size:7.5pt;font-weight:700;
  background:${COLORS.black};color:${COLORS.primary};
  padding:1mm 2.5mm;letter-spacing:2px;margin-bottom:1.5mm;
  display:inline-block;
}

/* ===== Table ===== */
table{
  width:100%;border-collapse:collapse;
  table-layout:fixed;font-size:8.5pt;
}
.head-row{background:${COLORS.black};color:${COLORS.primary}}
.head-row th{
  border:1px solid ${COLORS.black};padding:2px 3px;
  font-size:7.5pt;font-weight:700;text-align:center;
}
tbody td{
  border:1px solid ${COLORS.black};padding:2px 3px;
  vertical-align:top;font-size:8.5pt;
}
tr{page-break-inside:avoid;break-inside:avoid}

/* Text align helpers */
.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.fw7{font-weight:700}
.small{font-size:7.5pt}
.muted{color:${COLORS.midGray}}

/* Column widths */
.col-w6{width:6%}
.col-w8{width:8%}
.col-w10{width:10%}
.col-w12{width:12%}
.col-w14{width:14%}

/* ===== Info grid ===== */
.info-grid{
  display:grid;grid-template-columns:1fr 1fr 1fr;
  gap:1mm 4mm;font-size:8.5pt;margin-bottom:2mm;
}
.info-grid .full{grid-column:span 2}
.info-label{font-size:7pt;color:${COLORS.lightGray}}

/* ===== Service & Notes ===== */
.row2{display:flex;gap:3mm;margin-bottom:2mm}
.box{
  flex:1;border:1px solid ${COLORS.borderGray};
  border-left:3px solid ${COLORS.primary};
  padding:2mm 2.5mm;font-size:8.5pt;
  white-space:pre-wrap;line-height:1.5;
  color:${COLORS.darkGray};background:#fafafa;
  min-height:18mm;
}
.note-line{font-size:8pt;line-height:1.5;color:${COLORS.darkGray}}

/* ===== Amount box ===== */
.amt-box{
  position:absolute;bottom:58mm;right:0;width:72mm;
  border:2px solid ${COLORS.primary};overflow:hidden;
}
.amt-r{
  display:flex;justify-content:space-between;
  padding:1.5mm 3mm;border-bottom:1px solid #ebebeb;
  font-size:8.5pt;
}
.amt-r .lbl{color:${COLORS.lightGray}}
.amt-r .val{font-weight:600}
.amt-total{
  background:${COLORS.black};padding:2mm 3mm;
  display:flex;justify-content:space-between;align-items:center;
}
.amt-total .lbl{color:${COLORS.primary};font-size:9pt;font-weight:700;letter-spacing:1px}
.amt-total .val{color:#fff;font-size:12pt;font-weight:700;font-family:monospace}

/* ===== Bank info ===== */
.bank-box{
  position:absolute;bottom:36mm;left:0;right:80mm;
  border:1px solid ${COLORS.borderGray};padding:2mm 3mm;
}
.bank-title{
  font-size:7pt;font-weight:700;
  background:${COLORS.black};color:${COLORS.primary};
  padding:1mm 2mm;display:inline-block;margin-bottom:1.5mm;
}
.bank-row{
  display:flex;gap:6mm;font-size:8pt;
  color:${COLORS.darkGray};line-height:1.6;flex-wrap:wrap;
}
.bank-row span{white-space:nowrap}

/* ===== Signature ===== */
.sig-row{
  position:absolute;bottom:12mm;left:0;right:0;
  display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;
}
.sig-box{
  text-align:center;border-top:1.5px solid ${COLORS.black};
  padding-top:2mm;font-size:8pt;color:${COLORS.midGray};
  padding-bottom:4mm;
}

/* ===== Footer ===== */
.pf{
  position:absolute;bottom:2mm;left:0;right:0;
  display:flex;justify-content:space-between;align-items:center;
  font-size:6.5pt;color:${COLORS.lightGray};
  border-top:1px solid ${COLORS.borderGray};padding-top:1mm;
}
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="hdr">
    <div class="co">
      <img src="${logoUrl()}" class="co-logo" alt="">
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
  </div>

  <!-- Client Info -->
  <div class="sec">
    <div class="stitle">客戶資訊 Client Information</div>
    <div class="info-grid">
      <div><span class="info-label">客戶名稱</span> <strong>${esc(quote.customerName) || "—"}</strong></div>
      <div><span class="info-label">聯絡電話</span> <strong>${esc(quote.customerPhone) || "—"}</strong></div>
      <div><span class="info-label">負責業務</span> <strong>${esc(quote.salesRepName) || "—"}</strong></div>
      <div class="full"><span class="info-label">施工地址</span> <strong>${esc(quote.address) || "—"}</strong></div>
      <div><span class="info-label">稅別</span> <strong>${esc(taxType)}</strong></div>
    </div>
  </div>

  <!-- Equipment Schedule -->
  <div class="sec">
    <div class="stitle">工程設備明細 Equipment Schedule</div>
    <table>
      <thead><tr class="head-row">
        <th class="col-w6">項次</th>
        <th class="col-w10">類別</th>
        <th class="col-w8">品牌</th>
        <th>品項</th>
        <th class="col-w6">數量</th>
        <th class="col-w6">單位</th>
        <th class="col-w12">單價</th>
        <th class="col-w12">小計</th>
        <th class="col-w12">備註</th>
      </tr></thead>
      <tbody>${itemRows}${padRows}</tbody>
    </table>
  </div>

  <!-- Notes & Service -->
  <div class="row2">
    <div style="flex:0 0 55%">
      <div class="stitle">服務內容 Notes &amp; Remarks</div>
      <div class="box">${esc(quote.description) || "施工方式：\n施工天數：\n注意事項："}</div>
    </div>
    <div style="flex:1">
      <div class="stitle">備註</div>
      <div style="border:1px solid ${COLORS.borderGray};padding:2mm 2.5mm;font-size:8.5pt;min-height:18mm">
        ${notesList}
      </div>
    </div>
  </div>

  <!-- Amount Summary -->
  <div class="amt-box">
    <div class="amt-r"><span class="lbl">項目小計</span><span class="val">${fmtMoney(rawTotal)}</span></div>
    ${discAmt > 0 ? `<div class="amt-r"><span class="lbl">折扣</span><span class="val" style="color:${COLORS.red}">– ${fmtMoney(discAmt)}</span></div>` : ""}
    <div class="amt-r"><span class="lbl">未稅小計</span><span class="val">${fmtMoney(preTax)}</span></div>
    <div class="amt-r"><span class="lbl">稅額 5%</span><span class="val">${fmtMoney(taxAmt)}</span></div>
    <div class="amt-total"><span class="lbl">含稅總計</span><span class="val">${fmtMoney(total)}</span></div>
  </div>

  <!-- Bank Info -->
  <div class="bank-box">
    <div class="bank-title">匯款資訊</div>
    <div class="bank-row">
      <span><strong>銀行代碼：</strong>${COMPANY.bankCode}</span>
      <span><strong>帳號：</strong>${COMPANY.bankAccount}</span>
      <span><strong>戶名：</strong>${COMPANY.bankAccountName}</span>
    </div>
  </div>

  <!-- Signature -->
  <div class="sig-row">
    <div class="sig-box">客戶確認簽名<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
    <div class="sig-box">業務簽名<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
    <div class="sig-box">公　司　章<br><span style="font-size:6.5pt;color:#aaa">&nbsp;</span></div>
  </div>

  <!-- Footer -->
  <div class="pf">
    <div>${COMPANY.name}　${COMPANY.phone}　${COMPANY.address}</div>
    <div>列印：${printDate}</div>
  </div>
</div>
</body>
</html>`;
}
