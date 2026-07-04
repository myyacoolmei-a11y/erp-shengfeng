// PDF V2 Templates
// Returns complete HTML document strings for each document type

const logoUrl = () => `${window.location.origin}/logo.png`;
function esc(s: any) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtMoney(n: number) { return `NT$ ${Math.round(n).toLocaleString()}`; }
function fmtMoneyStr(s: string | null | undefined) {
  if (!s) return "—";
  const n = parseFloat(s);
  return isNaN(n) ? "—" : `NT$ ${Math.round(n).toLocaleString()}`;
}
function today() { return new Date().toLocaleDateString("zh-TW"); }
function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
  return d;
}

/* ────────── 1. 報價單 (Quotation) ────────── */
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

  const statusStyles: Record<string, string> = {
    "草稿": "background:#e5e7eb;color:#374151",
    "已送出": "background:#dbeafe;color:#1d4ed8",
    "已接受": "background:#dcfce7;color:#15803d",
    "已拒絕": "background:#fee2e2;color:#dc2626",
    "已完成": "background:#d1fae5;color:#065f46",
  };
  const statusBadge = `<span style="font-size:8pt;font-weight:700;padding:1mm 3mm;border-radius:1mm;${statusStyles[quote.status] ?? ""}">${quote.status ?? ""}</span>`;

  const itemRows = items.length > 0
    ? items.map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(item.category)}</td>
        <td>${esc(item.brand || "—")}</td>
        <td class="tl">${esc(item.itemName)}</td>
        <td>${Number(item.quantity)}</td>
        <td>${esc(item.unit)}</td>
        <td style="text-align:right">${fmtMoney(Number(item.unitPrice))}</td>
        <td style="text-align:right;font-weight:600">${fmtMoney(Number(item.subtotal))}</td>
        <td class="tl">${esc(item.notes || "")}</td>
      </tr>`).join("")
    : `<tr><td>1</td><td>工程</td><td>—</td><td class="tl">${esc(quote.title)}</td><td>1</td><td>式</td><td style="text-align:right">${fmtMoney(rawTotal)}</td><td style="text-align:right;font-weight:600">${fmtMoney(rawTotal)}</td><td></td></tr>`;

  const padRows = Array.from({ length: Math.max(0, 4 - items.length) }, (_, i) => `
    <tr><td>${items.length + i + 1}</td><td></td><td></td><td class="tl"></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");

  const notesHtml = (quote.notes ?? "").split(/\n/).filter((l: string) => l.trim()).slice(0, 5)
    .map((l: string, i: number) => `<div style="display:flex;gap:2mm;padding:0.8mm 0;font-size:8pt;line-height:1.4"><span style="color:#9ACD32;font-weight:700;min-width:4mm">${i + 1}.</span><span>${esc(l.replace(/^\d+[.)\u3001\uff0e]\s*/, ""))}</span></div>`).join("")
    || ["報價單有效期限為 30 日，逾期請重新確認。","施工前請支付 50% 訂金，完工驗收後付清尾款。","施工費已含基本配管耗材，特殊工程另計。","不含配電工程，如需配電請另行報價。"]
      .map((l, i) => `<div style="display:flex;gap:2mm;padding:0.8mm 0;font-size:8pt;line-height:1.4"><span style="color:#9ACD32;font-weight:700;min-width:4mm">${i + 1}.</span><span>${l}</span></div>`).join("");

  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>報價單 ${quoteNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei','微軟正黑體',Arial,sans-serif;font-size:8.5pt;color:#111;background:#fff}
@page{size:A4;margin:10mm}
.doc{max-width:190mm;margin:0 auto;padding-bottom:16mm}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:3mm;border-bottom:2.5px solid #9ACD32;margin-bottom:3mm}
.hdr-l{display:flex;align-items:center;gap:3mm}
.hdr-logo{width:14mm;height:14mm;border-radius:50%;object-fit:cover;border:2px solid #9ACD32}
.co-name{font-size:15pt;font-weight:900}
.co-sub{font-size:7pt;color:#666;margin-top:1mm}
.co-info{font-size:6.5pt;color:#888;margin-top:1mm;line-height:1.5}
.doc-r{text-align:right}
.doc-label{font-size:20pt;font-weight:900;color:#9ACD32;letter-spacing:8px;line-height:1}
.doc-en{font-size:8pt;color:#aaa;letter-spacing:2px}
.doc-no{font-size:9pt;font-weight:700;font-family:monospace;margin-top:2mm}
.doc-dates{font-size:7.5pt;color:#555;line-height:1.7;margin-top:1mm}
.sec{margin-bottom:3mm}
.stitle{font-size:7pt;font-weight:700;background:#111;color:#9ACD32;padding:1mm 3mm;letter-spacing:2px;margin-bottom:1.5mm;display:flex;align-items:center;justify-content:space-between}
.ci-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0.8mm 4mm}
.ci-r{display:flex;align-items:baseline;gap:1.5mm;padding:0.8mm 0;border-bottom:1px dotted #e0e0e0}
.ci-l{font-size:6.5pt;color:#888;min-width:14mm;flex-shrink:0}
.ci-v{font-size:8pt;font-weight:600;flex:1}
.ci-wide{grid-column:span 2}
table{width:100%;border-collapse:collapse;font-size:7.5pt}
thead th{background:#111;color:#9ACD32;padding:1.5mm 1.5mm;text-align:center;font-weight:700;font-size:7pt;border-right:1px solid #333;white-space:nowrap}
thead th:last-child{border-right:none}
tbody tr:nth-child(even){background:#f7f7f7}
tbody td{padding:1.5mm 1.5mm;text-align:center;border-bottom:1px solid #ebebeb;vertical-align:middle}
tbody td.tl{text-align:left}
tbody tr:last-child td{border-bottom:1.5px solid #9ACD32}
.row{display:flex;gap:3mm}
.mid-r{flex:1;border:1px solid #e0e0e0;border-left:3px solid #9ACD32;padding:2mm 2.5mm;font-size:8pt;white-space:pre-wrap;line-height:1.5;color:#333;background:#fafafa;min-height:20mm}
.bot-l{flex:1}
.bot-r{flex:0 0 70mm}
.amt-box{border:2px solid #9ACD32;border-radius:1mm;overflow:hidden}
.amt-r{display:flex;justify-content:space-between;padding:1.5mm 4mm;border-bottom:1px solid #ebebeb;font-size:8pt}
.amt-r .lbl{color:#777}
.amt-r .val{font-weight:600}
.amt-total{background:#111;padding:3mm 4mm;display:flex;justify-content:space-between;align-items:center}
.amt-total .lbl{color:#9ACD32;font-size:9.5pt;font-weight:900;letter-spacing:1px}
.amt-total .val{color:#fff;font-size:14pt;font-weight:900;font-family:monospace}
.sig-row{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-top:1mm}
.sig-box{border:1px solid #ccc;border-radius:1mm;padding:1.5mm;min-height:22mm;display:flex;flex-direction:column}
.sig-sp{flex:1}
.sig-lbl{font-size:7pt;color:#555;border-top:1px solid #aaa;padding-top:1mm;text-align:center}
.sig-dt{font-size:6.5pt;color:#bbb;text-align:center;margin-top:0.5mm}
.pf{border-top:2px solid #9ACD32;padding-top:2mm;margin-top:3mm;display:flex;justify-content:space-between;align-items:center}
.pf-l{display:flex;align-items:center;gap:2mm}
.pf-logo{width:8mm;height:8mm;border-radius:50%;object-fit:cover;border:1px solid #9ACD32}
.pf-info{font-size:6.5pt;color:#666;line-height:1.5}
.pf-r{font-size:6.5pt;color:#aaa;text-align:right;line-height:1.6}
</style></head><body>
<div class="doc">
<div class="hdr">
  <div class="hdr-l">
    <img src="${logoUrl()}" class="hdr-logo" alt="">
    <div>
      <div class="co-name">景風工程有限公司</div>
      <div class="co-sub">冷氣安裝｜保養｜維修｜設計</div>
      <div class="co-info">統編：93388506　Tel：0955-980-738<br>cfac07151025@gmail.com　彰化縣花壇鄉花南路212號</div>
    </div>
  </div>
  <div class="doc-r">
    <div class="doc-label">報價單</div>
    <div class="doc-en">QUOTATION</div>
    <div class="doc-no">${quoteNo}&nbsp;&nbsp;${statusBadge}</div>
    <div class="doc-dates">報價日期：${quoteDate}　有效期限：${validDate}<br>列印日期：${printDate}</div>
  </div>
</div>

<div class="sec">
  <div class="stitle">▌ 客戶資訊　Client Information</div>
  <div class="ci-grid">
    <div class="ci-r"><span class="ci-l">客戶名稱</span><span class="ci-v">${esc(quote.customerName) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">聯絡人</span><span class="ci-v">${esc(quote.contactPerson) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">聯絡電話</span><span class="ci-v">${esc(quote.customerPhone) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">負責業務</span><span class="ci-v">${esc(quote.salesRepName) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">工程名稱</span><span class="ci-v">${esc(quote.title) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">稅別</span><span class="ci-v">${esc(taxType)}</span></div>
    <div class="ci-r ci-wide"><span class="ci-l">施工地址</span><span class="ci-v">${esc(quote.address) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">付款條件</span><span class="ci-v">　</span></div>
  </div>
</div>

<div class="sec">
  <div class="stitle">▌ 工程設備明細　Equipment Schedule</div>
  <table>
    <thead><tr>
      <th style="width:6mm">項次</th><th style="width:16mm">類別</th>
      <th style="width:14mm">品牌</th><th>品項</th>
      <th style="width:9mm">數量</th><th style="width:9mm">單位</th>
      <th style="width:22mm">單價</th><th style="width:22mm">小計</th>
      <th style="width:18mm">備註</th>
    </tr></thead>
    <tbody>${itemRows}${padRows}</tbody>
  </table>
</div>

<div class="row sec">
  <div style="flex:0 0 54%">
    <div class="stitle">▌ 備註說明　Notes &amp; Remarks</div>
    <div class="mid-r" style="min-height:${quote.description ? "auto" : "24mm"};margin-left:0;border-left:3px solid #9ACD32">${esc(quote.description) || "施工方式：\n施工天數：\n注意事項："}</div>
  </div>
  <div style="flex:1">
    <div class="stitle">▌ 注意事項　Terms &amp; Conditions</div>
    ${notesHtml}
  </div>
</div>

<div class="row sec">
  <div class="bot-l"></div>
  <div class="bot-r">
    <div class="amt-box">
      <div class="amt-r"><span class="lbl">項目小計</span><span class="val">${fmtMoney(rawTotal)}</span></div>
      ${discAmt > 0 ? `<div class="amt-r"><span class="lbl">折扣</span><span class="val" style="color:#dc2626">－ ${fmtMoney(discAmt)}</span></div>` : ""}
      <div class="amt-r"><span class="lbl">未稅小計</span><span class="val">${fmtMoney(preTax)}</span></div>
      <div class="amt-r"><span class="lbl">稅額 5%</span><span class="val">${fmtMoney(taxAmt)}</span></div>
      <div class="amt-total"><span class="lbl">含稅總計</span><span class="val">${fmtMoney(total)}</span></div>
    </div>
  </div>
</div>

<div class="sec">
  <div class="stitle">▌ 確認簽署　Authorization</div>
  <div class="sig-row">
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">客戶簽名</div><div class="sig-dt">日期：＿＿＿＿＿＿</div></div>
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">業務簽名</div><div class="sig-dt">日期：＿＿＿＿＿＿</div></div>
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">公　司　章</div><div class="sig-dt">&nbsp;</div></div>
  </div>
</div>
</div>

<div class="pf">
  <div class="pf-l">
    <img src="${logoUrl()}" class="pf-logo" alt="">
    <div class="pf-info"><b>景風工程有限公司</b>　統編：93388506<br>Tel：0955-980-738　彰化縣花壇鄉花南路212號</div>
  </div>
  <div class="pf-r">Generated by 景風工程 ERP<br>列印：${printDate}</div>
</div>
</body></html>`;
}

/* ────────── 2. 派工單 (Work Order) ────────── */
export function buildWorkOrderHtml(order: any): string {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const printDate = new Date().toLocaleDateString("zh-TW");
  let techDisplay = "—";
  try {
    const techs = order.technicians ? JSON.parse(order.technicians) : null;
    if (Array.isArray(techs) && techs.length) techDisplay = techs.join("、");
  } catch { /* ignore */ }
  if (order.assignedTo) {
    techDisplay = order.assignedTo + (order.assistantTo ? ` / ${order.assistantTo}` : "");
  }

  return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>派工單 ${woNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei',Arial,sans-serif;font-size:11pt;color:#111;background:#fff}
.page{padding:12mm 16mm;position:relative;min-height:267mm}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:4mm;margin-bottom:4mm}
.co-name{font-size:20pt;font-weight:700}.co-sub{font-size:8.5pt;color:#555;margin-top:2px}
.wo-right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2mm}
.wo-num{font-size:14pt;font-weight:700}.wo-meta{font-size:9pt;color:#555}
h2{font-size:10pt;font-weight:700;background:#f3f3f3;padding:1.5mm 4mm;margin:3.5mm 0 2.5mm;border-left:3px solid #444}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm 10mm;margin:0 0 2mm}
.field{display:flex;gap:3mm;align-items:baseline}
.lbl{font-size:8pt;color:#666;min-width:50px;flex-shrink:0}.val{font-size:10pt;font-weight:500}
.full{grid-column:1/-1}
.box{border:1px solid #ccc;border-radius:2px;padding:2mm 3mm;min-height:14mm;font-size:10pt;white-space:pre-wrap;line-height:1.5}
.sigs{margin-top:10mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm}
.sig{text-align:center;border-top:1px solid #555;padding-top:2mm;font-size:8pt;color:#555;padding-bottom:6mm}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:4mm">
      <img src="${logoUrl()}" style="width:14mm;height:14mm;border-radius:50%;object-fit:cover;border:1.5px solid #16a34a" alt="">
      <div>
        <div class="co-name">景風工程</div>
        <div class="co-sub">冷氣空調工程專業服務</div>
      </div>
    </div>
    <div class="wo-right">
      <div>
        <div class="wo-num">派工單 ${woNum}</div>
        <div class="wo-meta">狀態：${order.status}　列印：${printDate}</div>
        <div class="wo-meta">工程類型：${order.projectType || '—'}</div>
      </div>
    </div>
  </div>

  <h2>客戶資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">客戶名稱</span><span class="val">${esc(order.customerName || '—')}</span></div>
    <div class="field"><span class="lbl">聯絡人</span><span class="val">${esc(order.contactPerson || '—')}</span></div>
    <div class="field"><span class="lbl">行動電話</span><span class="val">${esc(order.mobilePhone || '—')}</span></div>
    <div class="field"><span class="lbl">聯絡電話</span><span class="val">${esc(order.telephone || '—')}</span></div>
    <div class="field full"><span class="lbl">施工地址</span><span class="val">${esc(order.installAddress || '—')}</span></div>
  </div>

  <h2>施工資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">施工日期</span><span class="val">${esc(order.scheduledDate || '—')}</span></div>
    <div class="field"><span class="lbl">施工時間</span><span class="val">${esc(order.scheduledTime || '—')}</span></div>
    <div class="field"><span class="lbl">完成日期</span><span class="val">${esc(order.completedDate || '—')}</span></div>
    <div class="field"><span class="lbl">狀態</span><span class="val">${esc(order.status)}</span></div>
    <div class="field full"><span class="lbl">施工技師</span><span class="val">${esc(techDisplay)}</span></div>
  </div>

  <h2>設備資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">冷氣品牌</span><span class="val">${esc(order.acBrand || '—')}</span></div>
    <div class="field"><span class="lbl">型號</span><span class="val">${esc(order.modelNumber || '—')}</span></div>
    <div class="field"><span class="lbl">數量</span><span class="val">${order.quantity != null ? order.quantity + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">室內機</span><span class="val">${order.indoorUnits != null ? order.indoorUnits + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">室外機</span><span class="val">${order.outdoorUnits != null ? order.outdoorUnits + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">樓層</span><span class="val">${esc(order.floorLevel || '—')}</span></div>
    <div class="field"><span class="lbl">電梯</span><span class="val">${esc(order.hasElevator || '—')}</span></div>
  </div>

  <h2>施工內容</h2>
  <div class="box">${esc(order.description || '（無）')}</div>

  <h2>施工備註</h2>
  <div class="box">${esc(order.notes || '（無）')}</div>

  <div class="sigs">
    <div class="sig">客戶簽名</div>
    <div class="sig">技師簽名</div>
    <div class="sig">公司經手人</div>
  </div>
</div>
</body></html>`;
}

/* ────────── 3. 批發出貨單 (Wholesale Order / Shipment) ────────── */
export function buildWholesaleOrderHtml(order: any): string {
  const items: any[] = order.items ?? [];
  const orderNo = order.orderNumber || `WO-${String(order.id).padStart(4, "0")}`;
  const orderDate = order.orderDate || today();
  const deliveryDate = order.expectedDelivery || "—";
  const printDate = today();
  const subtotal = items.reduce((s: number, it: any) => s + (it.qty ?? 1) * parseFloat(it.unitPrice ?? "0") * (1 - parseFloat(it.discount ?? "0") / 100), 0);
  const taxRate = parseFloat(order.taxRate ?? "0");
  const taxAmt = Math.round(subtotal * taxRate / 100 * 100) / 100;
  const shippingFee = parseFloat(order.shippingFee ?? "0");
  const total = subtotal + taxAmt + shippingFee;

  const rows = items.map((it: any, i: number) => `
    <tr>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.productName)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.brand ?? "")}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.model ?? "")}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:center">${it.qty ?? 1}${it.unit ? " " + it.unit : ""}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoneyStr(it.unitPrice)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoneyStr(it.discount ? String(it.discount) + "%" : "")}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoney((it.qty ?? 1) * parseFloat(it.unitPrice ?? "0") * (1 - parseFloat(it.discount ?? "0") / 100))}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.notes ?? "")}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>出貨單 ${orderNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei','Heiti TC',sans-serif;font-size:12px;color:#000;background:#fff;padding:20px}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:2px solid #222;margin-bottom:16px}
.co{font-size:18px;font-weight:700}
.co-sub{font-size:11px;color:#555}
.doc-info{text-align:right}
.doc-no{font-size:14px;font-weight:700}
.meta{font-size:11px;color:#555;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:#f0f0f0;border:1px solid #000;padding:5px;font-size:11px;font-weight:700;text-align:left}
td{border:1px solid #000;padding:5px;font-size:11px}
.amt-box{width:240px;margin-left:auto;border:2px solid #222;padding:8px 12px}
.amt-row{display:flex;justify-content:space-between;padding:2px 0;font-size:12px}
.amt-total{display:flex;justify-content:space-between;padding:4px 0;border-top:2px solid #000;font-size:14px;font-weight:700;margin-top:4px}
.sig{margin-top:40px;display:flex;justify-content:space-between;font-size:12px}
.sig-box{width:160px;border-top:1px solid #000;padding-top:4px;text-align:center}
</style></head><body>
<div class="hdr">
  <div>
    <div class="co">景風工程有限公司 — 批發出貨單</div>
    <div class="co-sub">冷氣工程 / 批發材料</div>
  </div>
  <div class="doc-info">
    <div class="doc-no">${orderNo}</div>
    <div class="meta">狀態：${order.status}　列印：${printDate}</div>
  </div>
</div>

<div style="display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px">
  <div>
    <p style="margin:2px 0"><strong>客戶：</strong>${esc(order.customerName || "—")}</p>
    <p style="margin:2px 0"><strong>訂單日期：</strong>${orderDate}</p>
    <p style="margin:2px 0"><strong>預計交貨：</strong>${deliveryDate}</p>
    ${order.salesperson ? `<p style="margin:2px 0"><strong>業務：</strong>${esc(order.salesperson)}</p>` : ""}
  </div>
  <div style="text-align:right">
    <p style="margin:2px 0"><strong>匯款資訊</strong></p>
    <p style="margin:2px 0">國泰世華銀行</p>
    <p style="margin:2px 0">代號 013 / 帳號 047035012164</p>
    <p style="margin:2px 0">戶名：景風工程行 洪宇風</p>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:40px;text-align:center">項次</th>
      <th>商品名稱</th>
      <th style="width:80px">品牌</th>
      <th style="width:100px">型號</th>
      <th style="width:60px;text-align:center">數量</th>
      <th style="width:80px;text-align:right">單價</th>
      <th style="width:60px;text-align:right">折扣</th>
      <th style="width:80px;text-align:right">小計</th>
      <th style="width:80px">備註</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<div class="amt-box">
  <div class="amt-row"><span>小計</span><span>${fmtMoney(subtotal)}</span></div>
  ${taxRate > 0 ? `<div class="amt-row"><span>稅額 (${taxRate}%)</span><span>${fmtMoney(taxAmt)}</span></div>` : ""}
  ${shippingFee > 0 ? `<div class="amt-row"><span>運費</span><span>${fmtMoney(shippingFee)}</span></div>` : ""}
  <div class="amt-total"><span>合計金額</span><span>${fmtMoney(total)}</span></div>
</div>

<div class="sig">
  <div class="sig-box">客戶簽收</div>
  <div class="sig-box">貨運簽名</div>
  <div class="sig-box">制單簽名</div>
</div>
${order.notes ? `<div style="margin-top:16px;font-size:11px"><strong>備註：</strong>${esc(order.notes)}</div>` : ""}
</body></html>`;
}

/* ────────── 4. 批發月結請款單 (Wholesale Settlement) ────────── */
export function buildWholesaleSettlementHtml(
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
  const rows = items.map((it) => `
    <tr>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${fmtDate(it.orderDate)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${it.orderNumber ?? "—"}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.productName)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.model ?? "")}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.spec ?? "")}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:center">${it.qty}${it.unit ? " " + it.unit : ""}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoneyStr(it.unitPrice)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px;text-align:right">${fmtMoneyStr(it.amount)}</td>
      <td style="border:1px solid #000;padding:5px;font-size:12px">${esc(it.notes ?? "")}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>請款單 — ${customerName}</title>
<style>
body{font-family:'Microsoft JhengHei','Heiti TC',sans-serif;padding:20px;max-width:720px;margin:0 auto;color:#000}
h1{text-align:center;font-size:20px;margin-bottom:4px;letter-spacing:2px}
h2{text-align:center;font-size:11px;color:#333;margin:0 0 24px 0}
.info{display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:#f0f0f0;border:1px solid #000;padding:5px;font-size:12px;text-align:left}
td{border:1px solid #000;padding:5px;font-size:12px}
.amt-box{width:260px;margin-left:auto;border:2px solid #222;padding:10px 14px}
.amt-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;border-bottom:1px solid #ddd}
.amt-total{display:flex;justify-content:space-between;padding:4px 0;font-size:14px;font-weight:700;border-top:2px solid #000;margin-top:4px}
.paid-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:#15803d}
.unpaid-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:#dc2626;font-weight:700}
sig{margin-top:40px;display:flex;justify-content:space-between;font-size:12px}
sig-box{width:160px;border-top:1px solid #000;padding-top:4px;text-align:center}
</style></head><body>
<h1>景風工程有限公司</h1>
<h2>冷氣工程 / 批發請款單</h2>

<div class="info">
  <div>
    <p style="margin:2px 0"><strong>客戶：</strong>${esc(customerName)}</p>
    <p style="margin:2px 0"><strong>日期區間：</strong>${fromDate} — ${toDate}</p>
  </div>
  <div style="text-align:right">
    <p style="margin:2px 0"><strong>匯款資訊</strong></p>
    <p style="margin:2px 0">國泰世華銀行</p>
    <p style="margin:2px 0">代號 013 / 帳號 047035012164</p>
    <p style="margin:2px 0">戶名：景風工程行 洪宇風</p>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:70px">出貨日</th>
      <th style="width:80px">出貨單號</th>
      <th>商品</th>
      <th style="width:80px">型號</th>
      <th style="width:80px">規格</th>
      <th style="width:50px;text-align:center">數量</th>
      <th style="width:70px;text-align:right">單價</th>
      <th style="width:70px;text-align:right">金額</th>
      <th style="width:80px">備註</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="amt-box">
  <div class="amt-row"><span>小計</span><span>${fmtMoney(subtotal)}</span></div>
  ${taxRate > 0 ? `<div class="amt-row"><span>稅額 (${taxRate}%)</span><span>${fmtMoney(taxAmount)}</span></div>` : ""}
  <div class="amt-total"><span>總金額</span><span>${fmtMoney(total)}</span></div>
  ${receivedAmount > 0 ? `<div class="paid-row"><span>已收金額</span><span>${fmtMoney(receivedAmount)}</span></div>` : ""}
  ${receivableAmount > 0 ? `<div class="unpaid-row"><span>未收金額</span><span>${fmtMoney(receivableAmount)}</span></div>` : ""}
</div>

<div class="sig">
  <div class="sig-box">客戶簽收</div>
  <div class="sig-box">制單日期：${today()}</div>
</div>
</body></html>`;
}
