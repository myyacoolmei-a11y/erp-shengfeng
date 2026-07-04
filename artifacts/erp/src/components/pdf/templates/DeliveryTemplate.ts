// 出貨單 Template — 24×14cm Landscape, 出貨單據風格
// 獨立版面：修改此檔不影響其他 Template

import { logoUrl, COMPANY, COLORS, esc, fmtMoney, today } from "./brand-config";

export function buildDeliveryHtml(order: any): string {
  const items: any[] = order.items ?? [];
  const orderNo = order.orderNumber || `DO-${String(order.id).padStart(4, "0")}`;
  const orderDate = order.orderDate || today();
  const deliveryDate = order.expectedDelivery || "—";
  const printDate = today();

  // Max 8 rows for fixed 1-page
  const maxRows = 8;
  const displayItems = items.slice(0, maxRows);
  const rows = displayItems.map((it: any, i: number) => `
    <tr>
      <td class="tac">${i + 1}</td>
      <td class="tal">${esc(it.productName || "—")}</td>
      <td class="tal">${esc(it.brand ?? "")}</td>
      <td class="tal">${esc(it.model ?? "")}</td>
      <td class="tac">${it.qty ?? 1}${it.unit ? " " + it.unit : ""}</td>
      <td class="tal small">${esc(it.notes ?? "")}</td>
    </tr>
  `).join("");

  const padCount = Math.max(0, maxRows - displayItems.length);
  const padRows = Array.from({ length: padCount }, () => `
    <tr>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>出貨單 ${orderNo}</title>
<style>
/* ===== Base ===== */
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:'Microsoft JhengHei','\u5fae\u8edf\u6b63\u9ed1\u9ad4',Arial,sans-serif;
  font-size:10pt;color:${COLORS.black};background:#fff;
}

/* ===== Page setup ===== */
@page{size:240mm 140mm landscape;margin:6mm}
.page{
  width:228mm;min-height:128mm;
  padding:0;position:relative;
}

/* ===== Header ===== */
.hdr{
  display:flex;justify-content:space-between;align-items:flex-end;
  padding-bottom:3mm;border-bottom:2px solid ${COLORS.black};
  margin-bottom:3mm;
}
.co{display:flex;align-items:center;gap:3mm}
.co-logo{
  width:55px;height:55px;max-width:55px;max-height:55px;
  object-fit:contain;flex-shrink:0;
  border:1px solid ${COLORS.borderGray};border-radius:3px;
}
.co-name{font-size:13pt;font-weight:700}
.co-sub{font-size:7.5pt;color:${COLORS.midGray}}
.doc-info{text-align:right}
.doc-no{font-size:11pt;font-weight:700;color:${COLORS.primary};font-family:monospace}
.doc-meta{font-size:8pt;color:${COLORS.midGray};margin-top:1px}

/* ===== Info ===== */
.info{
  display:flex;justify-content:space-between;
  margin-bottom:2.5mm;font-size:9pt;
}
.info-left p{margin:1px 0}
.info-right{text-align:right}
.info-right p{margin:1px 0}

/* ===== Table ===== */
table{
  width:100%;border-collapse:collapse;
  table-layout:fixed;font-size:9pt;margin-bottom:2.5mm;
}
.head-row{background:${COLORS.black};color:${COLORS.primary}}
.head-row th{
  border:1px solid ${COLORS.black};padding:2px 4px;
  font-size:8pt;font-weight:700;text-align:center;
}
tbody td{
  border:1px solid ${COLORS.black};padding:2px 4px;
  vertical-align:top;font-size:9pt;
}
tr{page-break-inside:avoid;break-inside:avoid}

/* Text align helpers */
.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.small{font-size:8pt}

/* Column widths */
.col-w6{width:6%}
.col-w12{width:12%}
.col-w14{width:14%}
.col-w10{width:10%}

/* ===== Notes ===== */
.notes-box{
  border:1px solid ${COLORS.borderGray};
  padding:2mm 3mm;margin-bottom:2mm;
  min-height:10mm;font-size:9pt;
}

/* ===== Signature ===== */
.sig{
  position:absolute;bottom:12mm;left:0;right:0;
  display:grid;grid-template-columns:1fr 1fr;gap:20mm;
}
.sig-box{
  text-align:center;border-top:1.5px solid ${COLORS.black};
  padding-top:2mm;font-size:9pt;color:${COLORS.midGray};
  padding-bottom:3mm;
}

/* ===== Footer ===== */
.pf{
  position:absolute;bottom:3mm;left:0;right:0;
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
        <div class="co-name">${COMPANY.shortName} — 出貨單</div>
        <div class="co-sub">冷氣工程 / 批發材料</div>
      </div>
    </div>
    <div class="doc-info">
      <div class="doc-no">${orderNo}</div>
      <div class="doc-meta">出貨日期：${deliveryDate}　列印：${printDate}</div>
    </div>
  </div>

  <!-- Client Info -->
  <div class="info">
    <div class="info-left">
      <p><strong>客戶：</strong>${esc(order.customerName || "—")}</p>
      <p><strong>電話：</strong>${esc(order.customerPhone || "—")}</p>
      <p><strong>地址：</strong>${esc(order.customerAddress || "—")}</p>
    </div>
    <div class="info-right">
      <p><strong>訂單日期：</strong>${orderDate}</p>
      <p><strong>出貨日期：</strong>${deliveryDate}</p>
      ${order.salesperson ? `<p><strong>業務：</strong>${esc(order.salesperson)}</p>` : ""}
    </div>
  </div>

  <!-- Items Table -->
  <table>
    <thead><tr class="head-row">
      <th class="col-w6">項次</th>
      <th>商品</th>
      <th class="col-w12">品牌</th>
      <th class="col-w14">規格</th>
      <th class="col-w10">數量</th>
      <th>備註</th>
    </tr></thead>
    <tbody>${rows}${padRows}</tbody>
  </table>

  <!-- Notes -->
  ${order.notes ? `<div class="notes-box"><strong>備註：</strong>${esc(order.notes)}</div>` : ""}

  <!-- Signature -->
  <div class="sig">
    <div class="sig-box">客戶簽收<br><span style="font-size:7pt;color:#aaa">日期：________</span></div>
    <div class="sig-box">貨運簽名 / 公司經手<br><span style="font-size:7pt;color:#aaa">日期：________</span></div>
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
