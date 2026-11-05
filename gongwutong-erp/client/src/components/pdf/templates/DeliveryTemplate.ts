// 出貨單 Template
// digital：既有 240×140mm PDF／LINE 分享（不改）
// continuous-print：與派工單相同的 9.5×5.5in 點陣連續紙 HTML print

import { logoUrl, COMPANY, COLORS, esc, fmtMoney, today, PRINT_CJK_FONT_STACK, printFontLinksHtml } from "./brand-config";
import {
  CONTINUOUS_PAPER,
  PRINT_CALIBRATION_DEFAULT,
  continuousPrintPageBoxCss,
  type PrintCalibration,
} from "@/lib/printPaperConfig";

export type DeliveryHtmlMode = "digital" | "continuous-print";

export interface DeliveryHtmlOptions {
  mode?: DeliveryHtmlMode;
  calibration?: PrintCalibration;
}

function dash(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  return s ? esc(s) : "—";
}

function lineAmount(it: any): number {
  const qty = Number(it.qty ?? 1);
  const price = Number(it.unitPrice ?? 0);
  const disc = Number(it.discount ?? 0);
  if (it.amount != null && it.amount !== "") {
    const n = Number(it.amount);
    if (Number.isFinite(n)) return n;
  }
  return Math.round(qty * price * (1 - disc / 100) * 100) / 100;
}

function itemName(it: any): string {
  return [it.brand, it.productName, it.model].filter(Boolean).join(" ").trim() || "—";
}

function buildContinuousDeliveryHtml(order: any, calibration: PrintCalibration): string {
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const orderNo = order.orderNumber || `DO-${String(order.id).padStart(4, "0")}`;
  const orderDate = order.orderDate || today();
  const deliveryDate = order.expectedDelivery || orderDate;
  const phone = order.customerPhone || order.mobile || order.telephone || "";
  const address = order.customerAddress || order.address || "";

  const displayItems = items.slice(0, 8);
  const rows = displayItems.map((it: any, i: number) => {
    const qty = Number(it.qty ?? 1);
    const unit = it.unit ? String(it.unit) : "";
    return `<div class="cp-row">
      <div class="cp-no">${i + 1}</div>
      <div class="cp-name">${esc(itemName(it))}</div>
      <div class="cp-qty">${esc(String(qty))}${unit ? esc(" " + unit) : ""}</div>
      <div class="cp-price">${esc(fmtMoney(Number(it.unitPrice ?? 0)))}</div>
      <div class="cp-amt">${esc(fmtMoney(lineAmount(it)))}</div>
    </div>`;
  }).join("");

  const { WIDTH_IN, HEIGHT_IN } = CONTINUOUS_PAPER;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>出貨單 ${esc(orderNo)}</title>
${printFontLinksHtml()}
<style>
*{margin:0;padding:0;box-sizing:border-box}
${continuousPrintPageBoxCss(calibration)}
*{
  -webkit-print-color-adjust:economy!important;
  print-color-adjust:economy!important;
  box-shadow:none!important;
  text-shadow:none!important;
  transform:none!important;
  zoom:normal!important;
}
html,body,.sheet{
  color:#000!important;
  background:#fff!important;
  opacity:1!important;
  visibility:visible!important;
}
.page{
  display:flex!important;
  flex-direction:column!important;
  color:#000!important;
  background:#fff!important;
  opacity:1!important;
  visibility:visible!important;
}
body{
  font-family:${PRINT_CJK_FONT_STACK};
  font-size:14px;
  line-height:1.35;
  font-weight:400;
  font-synthesis:none;
}
.cp-title{
  text-align:center;font-size:20px;font-weight:700;
  letter-spacing:1px;margin:0 0 0.4mm;line-height:1.25;
}
.cp-grid{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  column-gap:4mm;width:100%;margin:0 0 0.4mm;padding:0 0 0.4mm;
  border-bottom:0.3mm solid #000;
}
.cp-field{display:flex;gap:1.2mm;align-items:baseline;min-width:0;line-height:1.35}
.cp-lbl{flex:0 0 22mm;width:22mm;font-size:13px;white-space:nowrap}
.cp-val{flex:1 1 auto;font-size:14px;font-weight:600;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.cp-sec{font-size:14px;font-weight:700;margin:0 0 0.2mm}
.cp-items{
  flex:1 1 auto;display:flex;flex-direction:column;width:100%;
  margin:0;padding:0.2mm 0 0.4mm;border-bottom:0.3mm solid #000;overflow:visible;
}
.cp-head,.cp-row{
  display:grid;
  grid-template-columns:8% 44% 12% 18% 18%;
  width:100%;align-items:center;
}
.cp-head{
  font-size:13px;font-weight:700;padding:0.15mm 0 0.25mm;
  border-bottom:0.18mm dotted #888;
}
.cp-row{
  font-size:14px;padding:0.3mm 0;border-bottom:0.15mm dotted #999;
  min-height:4.5mm;
}
.cp-no,.cp-qty,.cp-price,.cp-amt{text-align:center}
.cp-name{text-align:left;min-width:0;padding-right:1mm;overflow-wrap:anywhere;word-break:break-word}
.cp-totals{
  width:100%;margin:0.4mm 0 0;font-size:13px;
  display:flex;justify-content:flex-end;
}
.cp-totals-inner{min-width:62mm}
.cp-tot-row{display:flex;justify-content:space-between;gap:4mm;line-height:1.4}
.cp-tot-row.grand{font-weight:700;border-top:0.3mm solid #000;margin-top:0.3mm;padding-top:0.3mm;font-size:15px}
.cp-notes{margin:0.4mm 0 0;font-size:13px;overflow-wrap:anywhere}
.cp-sigs{
  display:grid;grid-template-columns:1fr 1fr;gap:10mm;
  margin-top:1.5mm;flex:0 0 auto;
}
.cp-sig-title{font-size:13px;margin-bottom:3mm}
.cp-sig-line{border-top:0.3mm solid #000;padding-top:0.4mm;font-size:12px}
@media print{
  html,body,.sheet,.page{width:${CONTINUOUS_PAPER.WIDTH_MM}mm!important;height:${CONTINUOUS_PAPER.HEIGHT_MM}mm!important}
}
</style>
</head>
<body>
<div class="sheet" data-paper="${WIDTH_IN}x${HEIGHT_IN}in">
<div class="page">
  <div class="cp-title">晟風空調工程｜出貨單</div>
  <div class="cp-grid">
    <div>
      <div class="cp-field"><span class="cp-lbl">出貨單號：</span><span class="cp-val">${esc(orderNo)}</span></div>
      <div class="cp-field"><span class="cp-lbl">客戶：</span><span class="cp-val">${dash(order.customerName)}</span></div>
      <div class="cp-field"><span class="cp-lbl">電話：</span><span class="cp-val">${dash(phone)}</span></div>
      <div class="cp-field"><span class="cp-lbl">地址：</span><span class="cp-val">${dash(address)}</span></div>
    </div>
    <div>
      <div class="cp-field"><span class="cp-lbl">訂單日期：</span><span class="cp-val">${esc(String(orderDate))}</span></div>
      <div class="cp-field"><span class="cp-lbl">出貨日期：</span><span class="cp-val">${esc(String(deliveryDate))}</span></div>
      <div class="cp-field"><span class="cp-lbl">業務：</span><span class="cp-val">${dash(order.salesperson)}</span></div>
    </div>
  </div>
  <section class="cp-items" data-item-count="${displayItems.length}">
    <div class="cp-sec">商品明細</div>
    <div class="cp-head">
      <div class="cp-no">項次</div>
      <div class="cp-name">商品名稱</div>
      <div class="cp-qty">數量</div>
      <div class="cp-price">單價</div>
      <div class="cp-amt">小計</div>
    </div>
    ${rows || `<div class="cp-row"><div class="cp-no"></div><div class="cp-name">—</div><div class="cp-qty">—</div><div class="cp-price">—</div><div class="cp-amt">—</div></div>`}
  </section>
  <div class="cp-totals">
    <div class="cp-totals-inner">
      <div class="cp-tot-row"><span>項目小計</span><span>${esc(fmtMoney(Number(order.subtotal ?? 0)))}</span></div>
      <div class="cp-tot-row"><span>稅額</span><span>${esc(fmtMoney(Number(order.taxAmount ?? 0)))}</span></div>
      <div class="cp-tot-row"><span>運費</span><span>${esc(fmtMoney(Number(order.shippingFee ?? 0)))}</span></div>
      <div class="cp-tot-row grand"><span>合計</span><span>${esc(fmtMoney(Number(order.total ?? 0)))}</span></div>
    </div>
  </div>
  ${order.notes ? `<div class="cp-notes">備註：${esc(order.notes)}</div>` : ""}
  <div class="cp-sigs">
    <div>
      <div class="cp-sig-title">客戶簽收</div>
      <div class="cp-sig-line">日期：</div>
    </div>
    <div>
      <div class="cp-sig-title">經手簽名</div>
      <div class="cp-sig-line">日期：</div>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
}

export function buildDeliveryHtml(order: any, options: DeliveryHtmlOptions = {}): string {
  const mode: DeliveryHtmlMode = options.mode ?? "digital";
  const calibration = options.calibration ?? PRINT_CALIBRATION_DEFAULT;
  if (mode === "continuous-print") {
    return buildContinuousDeliveryHtml(order, calibration);
  }

  const items: any[] = order.items ?? [];
  const orderNo = order.orderNumber || `DO-${String(order.id).padStart(4, "0")}`;
  const orderDate = order.orderDate || today();
  const deliveryDate = order.expectedDelivery || "—";
  const printDate = today();

  const maxRows = 8;
  const displayItems = items.slice(0, maxRows);
  const rows = displayItems.map((it: any, i: number) => `
    <tr>
      <td class="tac">${i + 1}</td>
      <td class="tal">${esc(it.productName || "—")}</td>
      <td class="tal">${esc(it.brand ?? "")}</td>
      <td class="tal">${esc(it.model ?? "")}</td>
      <td class="tac">${it.qty ?? 1}${it.unit ? " " + it.unit : ""}</td>
      <td class="tar">${esc(fmtMoney(Number(it.unitPrice ?? 0)))}</td>
      <td class="tar">${esc(fmtMoney(lineAmount(it)))}</td>
    </tr>
  `).join("");

  const padCount = Math.max(0, maxRows - displayItems.length);
  const padRows = Array.from({ length: padCount }, () => `
    <tr>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>出貨單 ${orderNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:'Microsoft JhengHei','\u5fae\u8edf\u6b63\u9ed1\u9ad4',Arial,sans-serif;
  font-size:10pt;color:${COLORS.black};background:#fff;
}
@page{size:240mm 140mm landscape;margin:6mm}
.page{
  width:228mm;min-height:128mm;
  padding:0;position:relative;
}
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
.info{
  display:flex;justify-content:space-between;
  margin-bottom:2.5mm;font-size:9pt;
}
.info-left p{margin:1px 0}
.info-right{text-align:right}
.info-right p{margin:1px 0}
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
.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.col-w6{width:6%}
.col-w12{width:12%}
.col-w14{width:14%}
.col-w10{width:10%}
.notes-box{
  border:1px solid ${COLORS.borderGray};
  padding:2mm 3mm;margin-bottom:2mm;
  min-height:10mm;font-size:9pt;
}
.sig{
  position:absolute;bottom:12mm;left:0;right:0;
  display:grid;grid-template-columns:1fr 1fr;gap:20mm;
}
.sig-box{
  text-align:center;border-top:1.5px solid ${COLORS.black};
  padding-top:2mm;font-size:9pt;color:${COLORS.midGray};
  padding-bottom:3mm;
}
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
  <table>
    <thead><tr class="head-row">
      <th class="col-w6">項次</th>
      <th>商品</th>
      <th class="col-w12">品牌</th>
      <th class="col-w14">規格</th>
      <th class="col-w10">數量</th>
      <th class="col-w12">單價</th>
      <th class="col-w12">小計</th>
    </tr></thead>
    <tbody>${rows}${padRows}</tbody>
  </table>
  ${order.notes ? `<div class="notes-box"><strong>備註：</strong>${esc(order.notes)}</div>` : ""}
  <div class="sig">
    <div class="sig-box">客戶簽收<br><span style="font-size:7pt;color:#aaa">日期：________</span></div>
    <div class="sig-box">貨運簽名 / 公司經手<br><span style="font-size:7pt;color:#aaa">日期：________</span></div>
  </div>
  <div class="pf">
    <div>${COMPANY.name}　${COMPANY.phone}　${COMPANY.address}</div>
    <div>列印：${printDate}</div>
  </div>
</div>
</body>
</html>`;
}
