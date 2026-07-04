// 請款單 Template — A4 Portrait, 正式工程文件風格
// 獨立版面：修改此檔不影響其他 Template

import { logoUrl, COMPANY, COLORS, esc, fmtMoney, fmtDate, today } from "./brand-config";

export function buildStatementHtml(
  customerName: string,
  fromDate: string,
  toDate: string,
  items: { orderId: number; orderNumber: string | null; orderDate: string | null; productName: string; brand: string | null; model: string | null; spec: string | null; unit: string | null; qty: number; unitPrice: string | null; amount: string | null; notes: string | null }[],
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number,
  receivedAmount: number,
  receivableAmount: number,
): string {
  // Max 12 rows for A4 single page
  const maxRows = 12;
  const displayItems = items.slice(0, maxRows);
  const rows = displayItems.map((it) => `
    <tr>
      <td class="tac">${fmtDate(it.orderDate)}</td>
      <td class="tac">${it.orderNumber ?? "—"}</td>
      <td class="tal">${esc(it.productName)}</td>
      <td class="tac">${esc(it.model ?? "")}</td>
      <td class="tac">${it.qty}${it.unit ? " " + it.unit : ""}</td>
      <td class="tar">${fmtMoney(it.unitPrice)}</td>
      <td class="tar">${fmtMoney(it.amount)}</td>
      <td class="tal small">${esc(it.notes ?? "")}</td>
    </tr>
  `).join("");

  const padCount = Math.max(0, maxRows - displayItems.length);
  const padRows = Array.from({ length: padCount }, () => `
    <tr>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>`).join("");

  const printDate = today();

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>請款單 — ${esc(customerName)}</title>
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
  padding:0;position:relative;
}

/* ===== Header ===== */
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

/* Column widths */
.col-w12{width:12%}
.col-w14{width:14%}
.col-w10{width:10%}

/* ===== Info grid ===== */
.info-grid{
  display:grid;grid-template-columns:1fr 1fr;
  gap:1mm 6mm;font-size:8.5pt;margin-bottom:2mm;
  padding-bottom:2mm;border-bottom:1px solid ${COLORS.borderGray};
}
.info-label{font-size:7pt;color:${COLORS.lightGray}}

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
.paid{color:${COLORS.green};font-weight:600}
.unpaid{color:${COLORS.red};font-weight:700}

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

/* ===== Notice ===== */
.notice{
  position:absolute;bottom:20mm;left:0;right:82mm;
  font-size:7.5pt;color:${COLORS.midGray};line-height:1.6;
}

/* ===== Signature ===== */
.sig-row{
  position:absolute;bottom:12mm;left:0;right:0;
  display:grid;grid-template-columns:1fr 1fr;gap:20mm;
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
      <div class="doc-label">請款單</div>
      <div class="doc-en">PAYMENT REQUEST</div>
      <div class="doc-no">${esc(customerName)}_${fromDate}</div>
      <div class="doc-dates">
        請款日期：${printDate}<br>
        請款期間：${fromDate} — ${toDate}<br>
        列印：${printDate}
      </div>
    </div>
  </div>

  <!-- Client Info -->
  <div class="info-grid">
    <div><span class="info-label">客戶</span> <strong>${esc(customerName)}</strong></div>
    <div><span class="info-label">匯款資訊</span> <strong>${COMPANY.bankName}</strong></div>
    <div><span class="info-label">銀行代碼</span> <strong>${COMPANY.bankCode}</strong></div>
    <div><span class="info-label">帳號</span> <strong>${COMPANY.bankAccount}</strong></div>
  </div>

  <!-- Statement Detail -->
  <div class="sec">
    <div class="stitle">月結明細 Statement Detail</div>
    <table>
      <thead><tr class="head-row">
        <th class="col-w12">出貨日</th>
        <th class="col-w14">出貨單號</th>
        <th>商品</th>
        <th class="col-w12">型號</th>
        <th class="col-w10">數量</th>
        <th class="col-w12">單價</th>
        <th class="col-w12">金額</th>
        <th class="col-w12">備註</th>
      </tr></thead>
      <tbody>${rows}${padRows}</tbody>
    </table>
  </div>

  <!-- Amount Summary -->
  <div class="amt-box">
    <div class="amt-r"><span class="lbl">小計</span><span class="val">${fmtMoney(subtotal)}</span></div>
    ${taxRate > 0 ? `<div class="amt-r"><span class="lbl">稅額 (${taxRate}%)</span><span class="val">${fmtMoney(taxAmount)}</span></div>` : ""}
    <div class="amt-total"><span class="lbl">應付金額</span><span class="val">${fmtMoney(total)}</span></div>
    ${receivedAmount > 0 ? `<div class="amt-r"><span class="lbl">已收金額</span><span class="val paid">${fmtMoney(receivedAmount)}</span></div>` : ""}
    ${receivableAmount > 0 ? `<div class="amt-r"><span class="lbl">未收金額</span><span class="val unpaid">${fmtMoney(receivableAmount)}</span></div>` : ""}
  </div>

  <!-- Bank Info -->
  <div class="bank-box">
    <div class="bank-title">付款資訊</div>
    <div class="bank-row">
      <span><strong>銀行代碼：</strong>${COMPANY.bankCode}</span>
      <span><strong>帳號：</strong>${COMPANY.bankAccount}</span>
      <span><strong>戶名：</strong>${COMPANY.bankAccountName}</span>
    </div>
  </div>

  <!-- Notice -->
  <div class="notice">
    <strong>注意事項：</strong><br>
    1. 請於請款單發出後 7 日內完成付款。<br>
    2. 付款後請傳送匯款明細以便對帳。<br>
    3. 如有問題請聯絡業務人員。
  </div>

  <!-- Signature -->
  <div class="sig-row">
    <div class="sig-box">客戶簽章<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
    <div class="sig-box">製單日期：${printDate}<br><span style="font-size:6.5pt;color:#aaa">&nbsp;</span></div>
  </div>

  <!-- Footer -->
  <div class="pf">
    <div>${COMPANY.name}　${COMPANY.taxId}　${COMPANY.phone}</div>
    <div>列印：${printDate}</div>
  </div>
</div>
</body>
</html>`;
}
