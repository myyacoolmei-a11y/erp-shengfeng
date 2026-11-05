import { logoUrl, COMPANY, COLORS, esc, fmtMoney, fmtDate, today, PDF_LAYOUT_CSS } from "./brand-config";
import type { Receivable } from "@workspace/api-client-react";
import type { WorkOrder } from "@workspace/api-client-react";
import type { Quote } from "@workspace/api-client-react";
import type { EquipmentItemForm } from "@/components/work-order-form";

export interface ReceivableSummaryPrintData {
  receivable: Receivable;
  workOrder?: WorkOrder | null;
  quote?: Quote | null;
  equipment: EquipmentItemForm[];
}

function equipmentModelCells(it: EquipmentItemForm): { indoor: string; outdoor: string } {
  const modelText = it.model || it.itemName || "—";
  const hasIndoor = it.indoorUnits != null && it.indoorUnits > 0;
  const hasOutdoor = it.outdoorUnits != null && it.outdoorUnits > 0;
  if (hasIndoor || hasOutdoor) {
    return {
      indoor: hasIndoor ? modelText : "—",
      outdoor: hasOutdoor ? (it.model || "—") : "—",
    };
  }
  if (it.model || it.itemName) {
    return { indoor: modelText, outdoor: "—" };
  }
  return { indoor: "—", outdoor: "—" };
}

function equipmentRows(equipment: EquipmentItemForm[]): string {
  const rows = equipment.filter(it => it.brand || it.itemName || it.model || it.quantity);
  if (rows.length === 0) {
    return `<tr><td colspan="4" class="tac muted">無設備明細</td></tr>`;
  }
  return rows.map(it => {
    const { indoor, outdoor } = equipmentModelCells(it);
    const qty = it.quantity != null ? `${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : "—";
    return `<tr>
      <td>${esc(it.brand || "—")}</td>
      <td>${esc(indoor)}</td>
      <td>${esc(outdoor)}</td>
      <td class="tac">${esc(qty)}</td>
    </tr>`;
  }).join("");
}

function quoteItemRows(quote?: Quote | null): string {
  const items = quote?.items ?? [];
  if (items.length === 0) {
    return `<tr><td colspan="4" class="tac muted">無報價明細</td></tr>`;
  }
  return items.map(it => `<tr>
    <td>${esc(it.itemName)}</td>
    <td class="tac">${it.quantity}${it.unit ? ` ${esc(it.unit)}` : ""}</td>
    <td class="tar">${fmtMoney(it.unitPrice)}</td>
    <td class="tar">${fmtMoney(it.subtotal)}</td>
  </tr>`).join("");
}

export function buildReceivableSummaryHtml(data: ReceivableSummaryPrintData): string {
  const { receivable: r, workOrder, quote, equipment } = data;
  const unpaid = r.totalAmount - r.receivedAmount;
  const projectType = workOrder?.projectType || r.projectType || "—";
  const projectName = workOrder?.title || r.projectName || "—";
  const installAddress = workOrder?.installAddress || quote?.address || "—";
  const woNum = r.workOrderNumber || (workOrder?.workOrderNumber ?? "—");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>施工摘要 — ${esc(r.customerName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei','微軟正黑體',Arial,sans-serif;font-size:10pt;color:${COLORS.black};background:#fff}
@page{size:A4 portrait;margin:12mm}
.page{width:186mm;min-height:273mm;padding:0}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid ${COLORS.black};padding-bottom:4mm;margin-bottom:4mm}
.co{display:flex;align-items:center;gap:3mm}
.co-logo{width:50px;height:50px;object-fit:contain;border:1px solid ${COLORS.borderGray};border-radius:3px}
.co-name{font-size:12pt;font-weight:700}
.co-sub{font-size:7.5pt;color:${COLORS.midGray};margin-top:1px}
.doc-r{text-align:right}
.doc-label{font-size:15pt;font-weight:700;color:${COLORS.primary};letter-spacing:3px}
.doc-sub{font-size:8pt;color:${COLORS.lightGray};margin-top:2px}
.sec{margin-bottom:4mm}
.sec-title{font-size:9.5pt;font-weight:700;border-left:3px solid ${COLORS.primary};padding-left:2mm;margin-bottom:2mm;color:${COLORS.darkGray}}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 4mm;font-size:9pt;margin-bottom:2mm}
.info-grid p span{color:${COLORS.midGray}}
.amt-row{display:flex;gap:3mm;margin-bottom:3mm}
.amt-box{flex:1;border:1px solid ${COLORS.borderGray};border-radius:2px;padding:2mm;text-align:center}
.amt-box .lbl{font-size:7.5pt;color:${COLORS.midGray}}
.amt-box .val{font-size:11pt;font-weight:700;margin-top:1px}
.amt-box.unpaid .val{color:${COLORS.red}}
.amt-box.received .val{color:${COLORS.green}}
table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-top:1mm}
th,td{border:1px solid ${COLORS.borderGray};padding:1.5mm 2mm}
th{background:${COLORS.bgLight};font-weight:600;text-align:left}
.tac{text-align:center}
.tar{text-align:right}
.muted{color:${COLORS.lightGray}}
.footer{margin-top:5mm;padding-top:2mm;border-top:1px solid ${COLORS.borderGray};font-size:7.5pt;color:${COLORS.lightGray};display:flex;justify-content:space-between}
${PDF_LAYOUT_CSS}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div class="co">
      <img class="co-logo" src="${logoUrl()}" alt="logo" />
      <div>
        <div class="co-name">${COMPANY.name}</div>
        <div class="co-sub">${COMPANY.subTitle}</div>
      </div>
    </div>
    <div class="doc-r">
      <div class="doc-label">施工摘要</div>
      <div class="doc-sub">列印日期：${today()}</div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">基本資訊</div>
    <div class="info-grid">
      <p><span>客戶：</span>${esc(r.customerName)}</p>
      <p><span>派工單號：</span>${esc(woNum)}</p>
      <p><span>工程類型：</span>${esc(projectType)}</p>
      <p><span>工程名稱：</span>${esc(projectName)}</p>
      <p style="grid-column:1/-1"><span>施工地址：</span>${esc(installAddress)}</p>
      <p><span>完工日期：</span>${fmtDate(r.completionDate)}</p>
      <p><span>預計收款：</span>${fmtDate(r.expectedPaymentDate)}</p>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">收款摘要</div>
    <div class="amt-row">
      <div class="amt-box"><div class="lbl">應收金額</div><div class="val">${fmtMoney(r.totalAmount)}</div></div>
      <div class="amt-box received"><div class="lbl">已收金額</div><div class="val">${fmtMoney(r.receivedAmount)}</div></div>
      <div class="amt-box unpaid"><div class="lbl">未收金額</div><div class="val">${fmtMoney(unpaid)}</div></div>
    </div>
    <div class="info-grid">
      <p><span>收款狀態：</span>${esc(r.paymentStatus)}</p>
      <p><span>發票狀態：</span>${esc(r.invoiceStatus)}</p>
      ${r.invoiceNumber ? `<p><span>發票號碼：</span>${esc(r.invoiceNumber)}</p>` : ""}
      ${r.invoiceTitle ? `<p><span>發票抬頭：</span>${esc(r.invoiceTitle)}</p>` : ""}
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">設備明細</div>
    <table>
      <thead><tr><th>品牌</th><th>室內機型號</th><th>室外機型號</th><th class="tac">數量</th></tr></thead>
      <tbody>${equipmentRows(equipment)}</tbody>
    </table>
  </div>

  <div class="sec">
    <div class="sec-title">報價明細</div>
    <table>
      <thead><tr><th>品項</th><th class="tac">數量</th><th class="tar">單價</th><th class="tar">小計</th></tr></thead>
      <tbody>${quoteItemRows(quote)}</tbody>
    </table>
  </div>

  ${workOrder?.description ? `<div class="sec"><div class="sec-title">施工內容</div><p style="font-size:9pt;white-space:pre-wrap">${esc(workOrder.description)}</p></div>` : ""}

  <div class="footer">
    <span>${COMPANY.phone}　${COMPANY.address}</span>
    <span>應收帳款 #${r.id}</span>
  </div>
</div>
</body>
</html>`;
}
