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
 * - continuous-print 模式：換算連續報表紙的送紙孔／撕線安全邊距，並以
 *   `transform: translate()` 套用列印校正偏移量（僅影響列印視覺位置，
 *   不影響版面資料）。同時將 html/body/.sheet 固定為紙張實際尺寸並
 *   overflow:hidden，確保絕不因內容過長而產生第二頁或空白頁。
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
    WIDTH_MM, HEIGHT_MM,
    MARGIN_LEFT_MM, MARGIN_RIGHT_MM,
    MARGIN_TOP_MM, MARGIN_BOTTOM_MM,
  } = CONTINUOUS_PAPER;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const contentWidthMm = round2(WIDTH_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM);
  const contentHeightMm = round2(HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM);
  const offsetXMm = Number.isFinite(calibration?.offsetXMm) ? calibration.offsetXMm : 0;
  const offsetYMm = Number.isFinite(calibration?.offsetYMm) ? calibration.offsetYMm : 0;

  return `
/* 連續報表紙（點陣印表機）— 紙張 ${WIDTH_MM}mm × ${HEIGHT_MM}mm，實際尺寸 100% 輸出，
   不縮放、不自動 fit-to-page。已預留左右送紙孔安全邊距
   ${MARGIN_LEFT_MM}mm／${MARGIN_RIGHT_MM}mm，上下（含中央撕線）安全邊距
   ${MARGIN_TOP_MM}mm／${MARGIN_BOTTOM_MM}mm。列印校正偏移：X=${offsetXMm}mm，Y=${offsetYMm}mm。
   注意：size 使用明確寬高兩個長度值時不可再併用 landscape 關鍵字（不符合
   CSS Paged Media 規範會導致整條宣告失效、退回瀏覽器預設紙張如 Letter），
   寬 > 高已代表橫向，故省略該關鍵字。 */
@page{size:${WIDTH_MM}mm ${HEIGHT_MM}mm;margin:0}
html,body{
  width:${WIDTH_MM}mm;height:${HEIGHT_MM}mm;
  overflow:hidden;
}
.sheet{
  position:relative;
  width:${WIDTH_MM}mm;height:${HEIGHT_MM}mm;
  overflow:hidden;
}
.page{
  position:absolute;
  top:${MARGIN_TOP_MM}mm;left:${MARGIN_LEFT_MM}mm;
  width:${contentWidthMm}mm;height:${contentHeightMm}mm;
  padding:0;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  transform:translate(${offsetXMm}mm, ${offsetYMm}mm);
}
  /* 內容過長時（例如長備註或設備品項較多）：由「施工內容」「備註」兩個
   自由文字區塊優先收縮並裁切多餘內容，表頭／欄位／材料表格／簽名列維持
   完整顯示，確保絕不因此產生第二頁或跨頁空白。備註（補充說明）的收縮
   優先權高於施工內容（核心施工說明），空間不足時備註會先被壓縮。 */
.section-flex{flex:0 1 auto;min-height:0;overflow:hidden}
.section-flex-notes{flex:0 2 auto;min-height:0;overflow:hidden}`;
}

/**
 * continuous-print 專用的緊湊排版覆寫。
 *
 * 共用的 PDF_LAYOUT_CSS（brand-config.ts）針對 A4 報表調整為較寬鬆的行高／
 * 表格列高（例如 min-height:40px），在 240×140mm 的連續報表紙上會過度
 * 佔用有限高度，導致「施工內容」「備註」等可收縮區塊被壓縮到接近 0
 * 而顯示不出來。此處提供更緊湊的間距，且僅套用於 continuous-print 模式，
 * 不影響 digital 模式（PDF 下載／LINE 分享）既有輸出。
 * 必須置於 <style> 區塊最後（PDF_LAYOUT_CSS 之後）以確保覆寫生效。
 */
function buildCompactOverridesCss(mode: WorkOrderHtmlMode): string {
  if (mode !== "continuous-print") return "";
  return `
/* ===== continuous-print 緊湊排版覆寫 ===== */
.hdr{padding-bottom:2mm;margin-bottom:2mm}
.co-logo{width:40px;height:40px;max-width:40px;max-height:40px}
.grid{gap:0.8mm 5mm;margin-bottom:1mm}
.lbl{min-width:44px}
.section{margin-bottom:1mm}
.sec-title{padding:0.6mm 2mm;margin-bottom:0.8mm}
.box{padding:1.5mm 3mm;line-height:1.3}
.head-row th{padding:1px 3px;min-height:0;line-height:1.3}
tbody td{padding:1px 3px;min-height:0;line-height:1.3}
tbody tr{min-height:0}
.bottom-block{margin-top:1.5mm}
.sigs{gap:6mm;margin-bottom:1.5mm}
.sig{font-size:7.5pt;padding-top:1.5mm;padding-bottom:0;min-height:0}
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

/* Column widths */
.col-w6{width:6%}
.col-w8{width:8%}
.col-w25{width:25%}

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
    <div class="field"><span class="lbl">電話</span><span class="val">${esc(phoneDisplay)}</span></div>
    ${order.title ? `<div class="field full"><span class="lbl">工程名稱</span><span class="val">${esc(order.title)}</span></div>` : ""}
    ${order.contactPerson ? `<div class="field"><span class="lbl">現場聯絡</span><span class="val">${esc(order.contactPerson)}</span></div>` : ""}
    <div class="field full"><span class="lbl">地址</span><span class="val">${esc(order.installAddress || "—")}</span></div>
    <div class="field"><span class="lbl">技師</span><span class="val">${esc(techDisplay)}</span></div>
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
      <div class="sig">客戶簽名<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
      <div class="sig">技師簽名<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
      <div class="sig">公司經手人<br><span style="font-size:6.5pt;color:#aaa">日期：________</span></div>
    </div>
    <div class="pf">
      <div>${COMPANY.name}　${COMPANY.phone}</div>
      <div>列印：${printDate}</div>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
}
