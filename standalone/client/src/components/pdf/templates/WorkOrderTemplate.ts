// 派工單 Template — 24×14cm Landscape, 工程現場單據風格
// 獨立版面：修改此檔不影響其他 Template

import { logoUrl, COMPANY, COLORS, esc, PDF_LAYOUT_CSS } from "./brand-config";
import { stripQuotePricingFromNotes } from "@/lib/quoteToWorkOrder";
import { CONTINUOUS_PAPER, PRINT_CALIBRATION_DEFAULT, type PrintCalibration } from "@/lib/printPaperConfig";

interface EquipmentRow {
  brand?: string | null;
  itemName?: string | null;
  model?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  indoorUnits?: number | null;
  outdoorUnits?: number | null;
  floor?: string | null;
}

function resolveEquipmentItems(order: Record<string, unknown>): EquipmentRow[] {
  const fromApi = (order.equipmentItems as EquipmentRow[] | undefined) ?? [];
  if (fromApi.length > 0) return fromApi;

  const hasLegacy = !!(
    order.acBrand ||
    order.modelNumber ||
    order.quantity != null ||
    order.indoorUnits != null ||
    order.outdoorUnits != null ||
    order.floorLevel
  );
  if (!hasLegacy) return [];

  return [{
    brand: (order.acBrand as string | null) ?? null,
    model: (order.modelNumber as string | null) ?? null,
    itemName: (order.modelNumber as string | null) ?? null,
    quantity: (order.quantity as number | null) ?? null,
    unit: "台",
    indoorUnits: (order.indoorUnits as number | null) ?? null,
    outdoorUnits: (order.outdoorUnits as number | null) ?? null,
    floor: (order.floorLevel as string | null) ?? null,
  }];
}

function equipmentName(it: EquipmentRow): string {
  const parts = [it.brand, it.itemName || it.model].filter(Boolean);
  return parts.join(" ").trim() || "—";
}

function equipmentSpec(it: EquipmentRow): string {
  const name = equipmentName(it);
  if (it.model && it.itemName && it.model !== it.itemName) {
    return `${name}（${it.model}）`;
  }
  return name;
}

function equipmentRemark(it: EquipmentRow): string {
  const parts: string[] = [];
  if (it.notes) parts.push(it.notes);
  if (it.indoorUnits != null) parts.push(`室內機${it.indoorUnits}台`);
  if (it.outdoorUnits != null) parts.push(`室外機${it.outdoorUnits}台`);
  if (it.floor) parts.push(it.floor);
  return parts.join("／");
}

function buildMaterialRows(equipment: EquipmentRow[]): string {
  if (equipment.length === 0) {
    return `<tr>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td>
      <td class="tac">&nbsp;</td>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td>
    </tr>`;
  }

  return equipment.map((it, i) => `
    <tr>
      <td class="tac">${i + 1}</td>
      <td class="tal col-item">${esc(equipmentSpec(it))}</td>
      <td class="tac">${it.quantity ?? ""}</td>
      <td class="tac">${esc(it.unit || "台")}</td>
      <td class="tal small col-notes">${esc(equipmentRemark(it))}</td>
    </tr>`).join("");
}

export type WorkOrderHtmlMode = "digital" | "continuous-print";

export interface WorkOrderHtmlOptions {
  /**
   * "digital"（預設）：既有 PDF 下載／行動裝置／LINE 分享流程使用，
   * 版面與既有輸出完全相同，不受連續報表紙改版影響。
   * "continuous-print"：實際列印到點陣印表機連續報表紙時使用 —
   * 套用送紙孔／撕線安全邊界，並套用「列印校正」偏移量，強制單頁輸出、
   * 100% 實際尺寸、不縮放。
   */
  mode?: WorkOrderHtmlMode;
  /** 僅 mode==="continuous-print" 時套用：正式列印時的上下左右位置校正（mm）。 */
  calibration?: PrintCalibration;
}

/**
 * 產生紙張／頁面容器的 CSS。
 * - digital 模式：完全維持既有輸出（240×140mm，四邊 6mm 邊距），供 PDF 下載／分享使用。
 * - continuous-print 模式：
 *   目標紙張為 9.5×5.5 in（${CONTINUOUS_PAPER.WIDTH_MM}×${CONTINUOUS_PAPER.HEIGHT_MM}mm）。
 *
 *   實機「左右拆成兩張」根因（已用 100% 縮放列印視口量測確認）：
 *   先前把 html/body/.sheet 寫死為固定 ${CONTINUOUS_PAPER.WIDTH_MM}mm 寬。
 *   當 Chrome 列印對話框實際可印寬度小於該固定值時（常見原因：
 *   Margins=Default 吃掉左右邊、印表機改用 Letter/A4、驅動回報可印寬 8.5in 等），
 *   版面在 100% 縮放下會水平跨成 2 頁。連續紙切換直向／橫向通常不改變紙寬，
 *   因此調 orientation 無效。
 *
 *   修正：html/body/.sheet/.page 一律 width/max-width:100%（相對 @page 頁面盒），
 *   不再使用會超過可印寬的固定 mm 寬度；送紙孔安全邊改由 padding 內縮；
 *   列印校正改調 padding（不用 transform，避免把內容推出頁面盒）。
 *   文字允許換行，表格 width:100% + table-layout:fixed，欄寬百分比加總 ≤100%。
 */
function buildPageBoxCss(mode: WorkOrderHtmlMode, calibration: PrintCalibration): string {
  if (mode !== "continuous-print") {
    // 注意：CSS @page 的 size 屬性不可將明確寬高兩個長度值與 landscape/portrait
    // 關鍵字併用（不符合 CSS Paged Media 規範，瀏覽器會整條宣告失效並改用預設
    // 紙張，例如 Letter）。寬 > 高本身已代表橫向，故不需再加 landscape 關鍵字。
    return `
@page{size:240mm 140mm;margin:6mm}
.sheet{}
.page{
  width:228mm;
  min-height:128mm;
  padding:0;
  display:flex;
  flex-direction:column;
}`;
  }

  const {
    WIDTH_IN, HEIGHT_IN,
    WIDTH_MM, HEIGHT_MM,
    MARGIN_LEFT_MM, MARGIN_RIGHT_MM,
    MARGIN_TOP_MM, MARGIN_BOTTOM_MM,
  } = CONTINUOUS_PAPER;
  const offsetXMm = Number.isFinite(calibration?.offsetXMm) ? calibration.offsetXMm : 0;
  const offsetYMm = Number.isFinite(calibration?.offsetYMm) ? calibration.offsetYMm : 0;
  // 校正併入 padding，避免 transform 把內容推出頁面盒造成水平第二頁
  const padTop = MARGIN_TOP_MM + offsetYMm;
  const padRight = Math.max(0, MARGIN_RIGHT_MM - offsetXMm);
  const padBottom = Math.max(0, MARGIN_BOTTOM_MM - offsetYMm);
  const padLeft = Math.max(0, MARGIN_LEFT_MM + offsetXMm);

  return `
/* 連續報表紙（點陣印表機）— 建議紙張 ${WIDTH_IN}in × ${HEIGHT_IN}in
   （${WIDTH_MM}mm × ${HEIGHT_MM}mm）。@page 使用英吋以貼近驅動紙張名稱；
   不可再併用 landscape 關鍵字。
   根容器採 100% 填滿「實際頁面盒」：即使對話框改用較窄紙張／Default 邊界，
   內容寬度仍跟隨可印區，不會因固定 mm 寬度水平拆成兩頁。
   送紙孔／撕線安全邊：左 ${MARGIN_LEFT_MM}mm／右 ${MARGIN_RIGHT_MM}mm／
   上 ${MARGIN_TOP_MM}mm／下 ${MARGIN_BOTTOM_MM}mm；列印校正 X=${offsetXMm}mm Y=${offsetYMm}mm。 */
@page{size:${WIDTH_IN}in ${HEIGHT_IN}in;margin:0}
html,body{
  box-sizing:border-box!important;
  width:100%!important;max-width:100%!important;
  height:100%!important;max-height:100%!important;
  margin:0!important;padding:0!important;
  overflow:hidden!important;
  background:#fff;
}
.sheet{
  box-sizing:border-box!important;
  width:100%!important;max-width:100%!important;
  height:100%!important;max-height:100%!important;
  padding:${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
  overflow:hidden!important;
  break-inside:avoid;page-break-inside:avoid;page-break-after:avoid;
  break-after:avoid;page-break-before:avoid;
}
.page{
  box-sizing:border-box!important;
  width:100%!important;max-width:100%!important;
  height:100%!important;max-height:100%!important;
  min-width:0;
  padding:0;margin:0;
  display:flex;flex-direction:column;
  overflow:hidden!important;
  transform:none!important;
  break-inside:avoid;page-break-inside:avoid;page-break-after:avoid;
}
/* 內容過長時：施工內容／備註優先收縮；禁止水平撐開 */
.section-flex{flex:0 1 auto;min-height:0;min-width:0;max-width:100%;overflow:hidden}
.section-flex-notes{flex:0 2 auto;min-height:0;min-width:0;max-width:100%;overflow:hidden}
.section,table,.grid,.box,.bottom-block,.sigs,.cp-title{
  max-width:100%!important;min-width:0;box-sizing:border-box!important;
}
table{
  width:100%!important;max-width:100%!important;
  table-layout:fixed!important;
}
.field,.val,.lbl,.col-item,.col-notes,td,th,div,span{
  min-width:0;
  max-width:100%;
  overflow-wrap:anywhere;
  word-break:break-word;
  white-space:normal!important;
}
.box{
  min-width:0;max-width:100%;
  overflow-wrap:anywhere;word-break:break-word;
  white-space:pre-wrap!important;
}
.lbl{flex-shrink:1!important}
.grid{
  width:100%;max-width:100%;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
}
.sigs{
  width:100%;max-width:100%;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);
}`;
}

/**
 * continuous-print 專用：點陣機極簡黑白樣式覆寫。
 *
 * - 頁首僅「晟風工程｜派工單」純文字標題（無 Logo、無副標、無品牌裝飾）。
 * - 全文件純黑 #000／白底；禁止色塊、灰底、反白字、裝飾線／圖示。
 * - 表格標題：白底、黑字粗體、黑色實線框。
 * - 版面緊湊以節省紙張與色帶；備註／客戶簽名／技師簽名保留手寫空間。
 * - 不影響 digital 模式（PDF 下載／LINE 分享）。
 * 必須置於 <style> 最後（PDF_LAYOUT_CSS 之後）以確保覆寫生效。
 */
function buildCompactOverridesCss(mode: WorkOrderHtmlMode): string {
  if (mode !== "continuous-print") return "";
  return `
/* ===== continuous-print：極簡點陣機（純黑／白底／無裝飾） ===== */
*{
  -webkit-print-color-adjust:economy!important;
  print-color-adjust:economy!important;
  box-shadow:none!important;
  text-shadow:none!important;
}
html,body,.sheet,.page,
.cp-title,.grid,.field,.lbl,.val,.sec-title,.section,
table,.head-row,.head-row th,tbody td,.box,
.bottom-block,.sigs,.sig,.sig-date{
  color:#000!important;
  background:#fff!important;
  background-color:#fff!important;
  opacity:1;
}
body{
  font-family:"Noto Sans TC","Microsoft JhengHei",Arial,sans-serif;
  line-height:1.15;
  font-size:10pt;
}

/* 頁首：僅文字標題，無底線／色塊／Logo */
.cp-title{
  font-size:12pt;font-weight:700;color:#000!important;
  text-align:left;letter-spacing:0.5px;
  margin:0 0 1.2mm;padding:0;line-height:1.2;
  flex-shrink:0;border:none;
}

/* 欄位區：緊湊雙欄；技師提前、工程名稱單欄以減少列數 */
.grid{gap:0.6mm 4mm;margin-bottom:1mm;font-size:10pt;width:100%;max-width:100%}
.lbl{font-size:9.5pt;font-weight:700;min-width:0;flex:0 1 auto;color:#000!important}
.val{font-size:11pt;font-weight:700;min-width:0;flex:1 1 auto;color:#000!important}
.f-tech{order:4}
.f-title{order:5;grid-column:auto}
.f-contact{order:6}
.f-address{order:7}

/* 區塊標題：白底黑字粗體＋黑色實線框（禁止黑底反白） */
.sec-title{
  background:#fff!important;color:#000!important;
  border:0.4mm solid #000;
  font-size:10.5pt;font-weight:700;
  padding:0.4mm 1.8mm;margin-bottom:0.6mm;
  letter-spacing:1px;
}
.section{margin-bottom:0.9mm}

/* 表格：白底黑字表頭＋黑色實線框；覆寫 PDF_LAYOUT_CSS 的大 padding／min-height */
table{font-size:10pt;line-height:1.15;border-collapse:collapse;width:100%!important;table-layout:fixed!important}
.head-row,.head-row th{background:#fff!important;color:#000!important}
.head-row th{
  border:0.4mm solid #000;border-color:#000!important;
  font-size:10pt;font-weight:700;
  padding:0.5mm 1.4mm;min-height:0;line-height:1.1;
}
tbody td{
  border:0.4mm solid #000;border-color:#000!important;
  background:#fff!important;color:#000!important;
  font-size:10pt;font-weight:600;
  padding:0.5mm 1.4mm;min-height:0;line-height:1.1;
}
tbody tr{min-height:0}
/* 欄寬加總 ≤100%（5+53+8+8+26），避免固定欄寬撐破父容器 */
.col-w6{width:5%!important}
.col-w8{width:8%!important}
.col-w25{width:26%!important}
.col-item{width:53%!important}

/* 施工內容／備註：白底黑框；備註保留手寫高度 */
.box{
  border:0.4mm solid #000;border-left:0.4mm solid #000;
  background:#fff!important;color:#000!important;
  padding:1mm 2mm;
  font-size:10pt;font-weight:600;line-height:1.2;
}
.section-flex .box{min-height:8mm}
.section-flex-notes .box{min-height:12mm}

/* 簽名列：保留手寫空間；隱藏品牌頁尾（公司全名／電話等無列印用途資訊） */
.bottom-block{margin-top:1mm}
.sigs{gap:4mm;margin-bottom:0}
.sig{
  font-size:10pt;font-weight:700;color:#000!important;
  border-top:0.4mm solid #000;
  padding-top:0.8mm;padding-bottom:9mm;min-height:14mm;
  background:#fff!important;
}
.sig-date{font-size:9pt;font-weight:700;color:#000!important}
.pf{display:none!important}
`;
}

export function buildWorkOrderHtml(order: any, options: WorkOrderHtmlOptions = {}): string {
  const mode: WorkOrderHtmlMode = options.mode ?? "digital";
  const calibration: PrintCalibration = options.calibration ?? PRINT_CALIBRATION_DEFAULT;
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

  const equipment = resolveEquipmentItems(order);
  const itemRows = buildMaterialRows(equipment);

  const sitePhone = order.mobilePhone || "";
  const companyPhone = order.telephone || "";
  const phoneDisplay = [sitePhone, companyPhone ? `公司 ${companyPhone}` : ""].filter(Boolean).join("　") || "—";
  const woNotes = stripQuotePricingFromNotes(order.notes || "");
  const isContinuousPrint = mode === "continuous-print";

  /** continuous-print：頁首僅文字標題；digital：完整品牌抬頭（含 Logo）。 */
  const headerHtml = isContinuousPrint
    ? `<div class="cp-title">晟風工程｜派工單</div>`
    : `<div class="hdr">
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
  </div>`;

  /** continuous-print：不列印品牌頁尾（公司全名／電話／列印日）；簽名欄保留。 */
  const footerBrandHtml = isContinuousPrint
    ? ""
    : `<div class="pf">
      <div>${COMPANY.name}　${COMPANY.phone}</div>
      <div>列印：${printDate}</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${woNum}</title>
<style>
/* ===== Base ===== */
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:'Microsoft JhengHei','\\5fae\\8edf\\6b63\\9ed1\\9ad4',Arial,sans-serif;
  font-size:10pt;color:${COLORS.black};background:#fff;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ===== Page setup ===== */
${buildPageBoxCss(mode, calibration)}

/* ===== Header ===== */
.hdr{
  display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:2px solid ${COLORS.black};
  padding-bottom:3mm;margin-bottom:3mm;
  flex-shrink:0;
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
  flex-shrink:0;
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
.section{margin-bottom:2mm}

/* ===== Table ===== */
table{
  width:100%;border-collapse:collapse;
  table-layout:fixed;font-size:9pt;
}
.head-row{background:${COLORS.black};color:${COLORS.primary}}
.head-row th{
  border:1px solid ${COLORS.black};
  font-size:8.5pt;font-weight:700;text-align:center;
}
tbody td{
  border:1px solid ${COLORS.black};
  vertical-align:middle;font-size:9pt;
}
tbody tr{page-break-inside:avoid;break-inside:avoid}

/* Text align helpers */
.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.small{font-size:8.5pt}

/* Column widths — continuous-print 另以覆寫確保加總 ≤100%；digital 維持原比例 */
.col-w6{width:6%}
.col-w8{width:8%}
.col-w25{width:25%}
.col-item{width:auto}

/* ===== Box ===== */
.box{
  border:1px solid ${COLORS.borderGray};
  border-left:3px solid ${COLORS.primary};
  padding:3mm 4mm;
  font-size:9pt;white-space:pre-wrap;
  line-height:1.6;background:#fafafa;
  page-break-inside:auto;break-inside:auto;
}

/* ===== Bottom block (signatures + footer) ===== */
.bottom-block{
  margin-top:4mm;
  flex-shrink:0;
  page-break-inside:avoid;break-inside:avoid;
}
.sigs{
  display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;
  margin-bottom:3mm;
}
.sig{
  text-align:center;border-top:1.5px solid ${COLORS.black};
  font-size:8.5pt;color:${COLORS.midGray};
}
.sig-date{font-size:6.5pt;color:#aaa}
.pf{
  display:flex;justify-content:space-between;align-items:center;
  font-size:6.5pt;color:${COLORS.lightGray};
  border-top:1px solid ${COLORS.borderGray};padding-top:1.5mm;
}
${PDF_LAYOUT_CSS}
${buildCompactOverridesCss(mode)}
</style>
</head>
<body>
<div class="sheet">
<div class="page">
  ${headerHtml}

  <!-- Field Grid -->
  <div class="grid">
    <div class="field wo-id-field"><span class="lbl">案件編號</span><span class="val">${woNum}</span></div>
    <div class="field f-date"><span class="lbl">日期</span><span class="val">${esc(order.scheduledDate || printDate)}</span></div>
    <div class="field f-customer"><span class="lbl">客戶</span><span class="val">${esc(order.customerName || "—")}</span></div>
    <div class="field f-phone"><span class="lbl">電話</span><span class="val">${esc(phoneDisplay)}</span></div>
    ${order.title ? `<div class="field full f-title"><span class="lbl">工程名稱</span><span class="val">${esc(order.title)}</span></div>` : ""}
    ${order.contactPerson ? `<div class="field f-contact"><span class="lbl">現場聯絡</span><span class="val">${esc(order.contactPerson)}</span></div>` : ""}
    <div class="field full f-address"><span class="lbl">地址</span><span class="val">${esc(order.installAddress || "—")}</span></div>
    <div class="field f-tech"><span class="lbl">技師</span><span class="val">${esc(techDisplay)}</span></div>
  </div>

  <!-- Work Content -->
  <div class="section section-flex">
    <div class="sec-title">施工內容</div>
    <div class="box">${esc(order.description || "（無）")}</div>
  </div>

  <!-- Materials -->
  <div class="section">
    <div class="sec-title">材料 / 設備</div>
    <table>
      <thead><tr class="head-row">
        <th class="col-w6">項次</th>
        <th>品牌 / 品項 / 型號</th>
        <th class="col-w8">數量</th>
        <th class="col-w8">單位</th>
        <th class="col-w25">備註</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- Notes -->
  <div class="section section-flex-notes">
    <div class="sec-title">備註</div>
    <div class="box">${esc(woNotes || "（無）")}</div>
  </div>

  <!-- Signature + Footer -->
  <div class="bottom-block">
    <div class="sigs">
      <div class="sig">客戶簽名<br><span class="sig-date">日期：________</span></div>
      <div class="sig">技師簽名<br><span class="sig-date">日期：________</span></div>
      <div class="sig">公司經手人<br><span class="sig-date">日期：________</span></div>
    </div>
    ${footerBrandHtml}
  </div>
</div>
</div>
</body>
</html>`;
}
