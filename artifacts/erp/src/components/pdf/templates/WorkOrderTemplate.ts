// 派工單 Template — 24×14cm Landscape, 工程現場單據風格
// 獨立版面：修改此檔不影響其他 Template

import { logoUrl, COMPANY, COLORS, esc } from "./brand-config";

export function buildWorkOrderHtml(order: any): string {
  const woNum = order.workOrderNumber || `WO-${String(order.id).padStart(4, "0")}`;
  const printDate = new Date().toLocaleDateString("zh-TW");
  let techDisplay = "—";
  try {
    const techs = order.technicians ? JSON.parse(order.technicians) : null;
    if (Array.isArray(techs) && techs.length) techDisplay = techs.join("、");
  } catch { /* ignore */ }
  if (order.assignedTo) {
    techDisplay = order.assignedTo + (order.assistantTo ? ` / ${order.assistantTo}` : "");
  }

  const items: any[] = order.items ?? [];
  const itemRows = items.length > 0
    ? items.map((it: any, i: number) => `
      <tr>
        <td class="tac">${i + 1}</td>
        <td class="tal">${esc(it.productName || it.description || "—")}</td>
        <td class="tac">${it.qty ?? 1}</td>
        <td class="tac">${esc(it.unit || "個")}</td>
        <td class="tal small">${esc(it.notes || "")}</td>
      </tr>`).join("")
    : `<tr>
        <td class="tac">1</td>
        <td class="tal">${esc(order.description || "施工內容")}</td>
        <td class="tac">1</td>
        <td class="tac">式</td>
        <td class="tal small"></td>
      </tr>`;

  // Pad to 6 rows max for fixed 1-page
  const rowCount = Math.max(items.length || 1, 1);
  const padCount = Math.max(0, 6 - rowCount);
  const padRows = Array.from({ length: padCount }, () => `
    <tr>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${woNum}</title>
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
  display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:2px solid ${COLORS.black};
  padding-bottom:3mm;margin-bottom:3mm;
}
.co{display:flex;align-items:center;gap:3mm}
.co-logo{
  width:55px;height:55px;max-width:55px;max-height:55px;
  object-fit:contain;flex-shrink:0;
  border:1px solid ${COLORS.borderGray};border-radius:3px;
}
.co-name{font-size:13pt;font-weight:700}
.co-sub{font-size:7.5pt;color:${COLORS.midGray}}
.wo-right{text-align:right}
.wo-label{font-size:14pt;font-weight:700;color:${COLORS.primary};letter-spacing:4px}
.wo-num{font-size:10pt;font-weight:700;font-family:monospace}
.wo-meta{font-size:8pt;color:${COLORS.midGray};margin-top:1px}

/* ===== Field grid ===== */
.grid{
  display:grid;grid-template-columns:1fr 1fr;
  gap:1.5mm 6mm;margin-bottom:2mm;font-size:9pt;
}
.field{display:flex;gap:2mm;align-items:baseline}
.lbl{font-size:7.5pt;color:${COLORS.midGray};min-width:52px;flex-shrink:0}
.val{font-size:9.5pt;font-weight:600}
.full{grid-column:1/-1}

/* ===== Section titles ===== */
.sec-title{
  font-size:7.5pt;font-weight:700;
  background:${COLORS.black};color:${COLORS.primary};
  padding:1mm 2.5mm;letter-spacing:2px;margin-bottom:1.5mm;
  display:inline-block;
}

/* ===== Table ===== */
table{
  width:100%;border-collapse:collapse;
  table-layout:fixed;font-size:9pt;margin-bottom:2mm;
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
.col-w8{width:8%}
.col-w25{width:25%}

/* ===== Box ===== */
.box{
  border:1px solid ${COLORS.borderGray};
  border-left:3px solid ${COLORS.primary};
  padding:2mm 3mm;min-height:10mm;
  font-size:9pt;white-space:pre-wrap;
  line-height:1.5;background:#fafafa;
}

/* ===== Signature ===== */
.sigs{
  position:absolute;bottom:14mm;left:0;right:0;
  display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;
}
.sig{
  text-align:center;border-top:1.5px solid ${COLORS.black};
  padding-top:2mm;font-size:8pt;color:${COLORS.midGray};
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
        <div class="co-name">${COMPANY.shortName}</div>
        <div class="co-sub">${COMPANY.subTitle}</div>
      </div>
    </div>
    <div class="wo-right">
      <div class="wo-label">派工單</div>
      <div class="wo-num">${woNum}</div>
      <div class="wo-meta">
        日期：${esc(order.scheduledDate || printDate)}　狀態：${esc(order.status || "—")}
      </div>
    </div>
  </div>

  <!-- Field Grid -->
  <div class="grid">
    <div class="field"><span class="lbl">案件編號</span><span class="val">${woNum}</span></div>
    <div class="field"><span class="lbl">日期</span><span class="val">${esc(order.scheduledDate || printDate)}</span></div>
    <div class="field"><span class="lbl">客戶</span><span class="val">${esc(order.customerName || "—")}</span></div>
    <div class="field"><span class="lbl">電話</span><span class="val">${esc(order.mobilePhone || order.telephone || "—")}</span></div>
    <div class="field full"><span class="lbl">地址</span><span class="val">${esc(order.installAddress || "—")}</span></div>
    <div class="field"><span class="lbl">技師</span><span class="val">${esc(techDisplay)}</span></div>
  </div>

  <!-- Work Content -->
  <div style="margin-bottom:2mm">
    <div class="sec-title">施工內容</div>
    <div class="box">${esc(order.description || "（無）")}</div>
  </div>

  <!-- Materials -->
  <div style="margin-bottom:2mm">
    <div class="sec-title">材料</div>
    <table>
      <thead><tr class="head-row">
        <th class="col-w6">項次</th>
        <th>材料名稱 / 規格</th>
        <th class="col-w8">數量</th>
        <th class="col-w8">單位</th>
        <th class="col-w25">備註</th>
      </tr></thead>
      <tbody>${itemRows}${padRows}</tbody>
    </table>
  </div>

  <!-- Notes -->
  <div style="margin-bottom:2mm">
    <div class="sec-title">備註</div>
    <div class="box" style="min-height:10mm;font-size:9pt">${esc(order.notes || "（無）")}</div>
  </div>

  <!-- Signature -->
  <div class="sigs">
    <div class="sig">客戶簽名<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
    <div class="sig">技師簽名<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
    <div class="sig">公司經手人<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
  </div>

  <!-- Footer -->
  <div class="pf">
    <div>${COMPANY.name}　${COMPANY.phone}</div>
    <div>列印：${printDate}</div>
  </div>
</div>
</body>
</html>`;
}
