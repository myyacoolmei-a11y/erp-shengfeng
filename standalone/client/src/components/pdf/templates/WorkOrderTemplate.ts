// 派工單 Template — 24×14cm Landscape, 工程現場單據風格
// 獨立版面：修改此檔不影響其他 Template
// continuous-print：EPSON 點陣機 9.5×5.5in（241.3×139.7mm）單頁極簡黑白版型

import { logoUrl, COMPANY, COLORS, esc, PRINT_DOC_TYPE_CSS, PRINT_CJK_FONT_STACK, PRINT_CJK_METRIC_CSS, printFontLinksHtml } from "./brand-config";
import { stripQuotePricingFromNotes } from "@/lib/quoteToWorkOrder";
import { CONTINUOUS_PAPER, PRINT_CALIBRATION_DEFAULT, type PrintCalibration } from "@/lib/printPaperConfig";
import { displayQuoteItemCategory } from "./printCategory";

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

/** digital 模式材料列：類別／品項／型號分開顯示；空資料仍留一空白列維持表格結構。 */
function buildMaterialRows(equipment: EquipmentRow[]): string {
  if (equipment.length === 0) {
    return `<tr>
      <td class="tac">&nbsp;</td>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td>
      <td class="tac">&nbsp;</td>
      <td class="tac">&nbsp;</td>
      <td class="tac">&nbsp;</td>
      <td>&nbsp;</td>
    </tr>`;
  }

  return equipment.map((it, i) => {
    const spec = [it.brand, it.itemName || it.model].filter(Boolean).join(" ").trim() || "—";
    const model = it.itemName && it.model && it.model !== it.itemName ? it.model : (it.itemName ? (it.model || "—") : "—");
    return `
    <tr>
      <td class="tac">${i + 1}</td>
      <td class="tac col-cat">${esc(displayQuoteItemCategory(it))}</td>
      <td class="tal col-item">${esc(spec)}</td>
      <td class="tac col-model">${esc(model)}</td>
      <td class="tac col-qty">${it.quantity ?? ""}</td>
      <td class="tac col-unit">${esc(it.unit || "台")}</td>
      <td class="tac col-notes">${esc(equipmentRemark(it))}</td>
    </tr>`;
  }).join("");
}

/**
 * continuous-print 材料列：同一 map、同一 row 元件，無最後一筆特殊定位。
 * 無資料時不輸出空白列。
 */
function buildContinuousMaterialRows(equipment: EquipmentRow[]): string {
  if (equipment.length === 0) return "";
  return equipment.map((it, i) => {
    // 連續紙只顯示數量數字，不附加單位／規格欄
    const qtyDisplay = it.quantity != null && String(it.quantity).trim() !== ""
      ? String(it.quantity)
      : "";
    const remark = equipmentRemark(it);
    const spec = equipmentSpec(it);
    const cat = displayQuoteItemCategory(it);
    const nameCore = remark ? `${spec}（${remark}）` : spec;
    const name = cat ? `${cat}｜${nameCore}` : nameCore;
    return `<div class="cp-mat-row" data-mat-index="${i + 1}">
      <div class="cp-mat-no">${i + 1}</div>
      <div class="cp-mat-name">${esc(name)}</div>
      <div class="cp-mat-qty">${esc(qtyDisplay)}</div>
      <div class="cp-mat-pad" aria-hidden="true"></div>
    </div>`;
  }).join("");
}

export type WorkOrderHtmlMode = "digital" | "continuous-print";

export interface WorkOrderHtmlOptions {
  /**
   * "digital"（預設）：既有 PDF 下載／行動裝置／LINE 分享流程使用，
   * 版面與既有輸出完全相同，不受連續報表紙改版影響。
   * "continuous-print"：實際列印到點陣印表機連續報表紙時使用 —
   * @page size:auto（方向由列印對話框決定），套用送紙孔／撕線安全邊界與列印校正。
   */
  mode?: WorkOrderHtmlMode;
  /** 僅 mode==="continuous-print" 時套用：正式列印時的上下左右位置校正（mm）。 */
  calibration?: PrintCalibration;
}

/**
 * 產生紙張／頁面容器的 CSS。
 * - digital：維持既有 240×140mm。
 * - continuous-print：@page 使用 size:auto（不鎖定直向／橫向），由 Windows 列印對話框
 *   的 9.5×5.5in 自訂紙張決定方向；內容根容器仍維持 241.3×139.7mm 版面。
 *   安全邊以 padding 內縮；不以 overflow:hidden 裁掉必要文字。
 */
function buildPageBoxCss(mode: WorkOrderHtmlMode, calibration: PrintCalibration): string {
  if (mode !== "continuous-print") {
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
  const offsetXMm = Number.isFinite(calibration?.offsetXMm) ? calibration.offsetXMm : 0;
  const offsetYMm = Number.isFinite(calibration?.offsetYMm) ? calibration.offsetYMm : 0;
  const padTop = MARGIN_TOP_MM + offsetYMm;
  const padRight = Math.max(0, MARGIN_RIGHT_MM - offsetXMm);
  const padBottom = Math.max(0, MARGIN_BOTTOM_MM - offsetYMm);
  const padLeft = Math.max(0, MARGIN_LEFT_MM + offsetXMm);

  return `
/* EPSON 點陣機連續紙半張內容區：${WIDTH_MM}mm × ${HEIGHT_MM}mm（9.5×5.5in）。
   @page size:auto — 不鎖定直向／橫向；由列印對話框自訂紙張控制方向。
   .sheet 高度固定 ${HEIGHT_MM}mm，寬度滿版；左右送紙孔以 padding 保留。
   .page 撐滿可印區；主要留白集中在材料清單下方手寫區；備註／收費／簽名緊湊。
   禁止 transform:scale／zoom／自動壓縮；禁止 overflow 裁切底部。 */
@page{size:auto;margin:0}
html,body{
  box-sizing:border-box;
  width:${WIDTH_MM}mm;
  height:${HEIGHT_MM}mm;
  max-width:${WIDTH_MM}mm;
  max-height:${HEIGHT_MM}mm;
  margin:0;padding:0;
  background:#fff;
  transform:none;
  zoom:normal;
}
.sheet{
  box-sizing:border-box;
  width:${WIDTH_MM}mm;
  height:${HEIGHT_MM}mm;
  max-width:${WIDTH_MM}mm;
  max-height:${HEIGHT_MM}mm;
  padding:${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
  break-inside:avoid;
  page-break-inside:avoid;
  page-break-after:avoid;
  page-break-before:avoid;
  break-after:avoid;
  break-before:avoid;
  position:static;
  overflow:visible;
  transform:none;
  zoom:normal;
}
.page{
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  width:100%;
  max-width:100%;
  height:100%;
  min-height:100%;
  max-height:100%;
  margin:0;padding:0;
  position:static;
  overflow:visible;
  break-inside:avoid;
  page-break-inside:avoid;
  transform:none;
  zoom:normal;
}
/* 標題／基本資料／施工／備註／列：依內容高度，不硬撐空白 */
.cp-title,.cp-grid,.cp-block,.cp-notes-block,.cp-mat-list,.cp-mat-row,.cp-mat-header,.cp-text,.cp-field,.cp-val,.cp-lbl,.cp-mat-name,.cp-mat-no,.cp-mat-qty,.cp-mat-pad,.cp-write-space,.cp-cust-space{
  box-sizing:border-box;
  position:static;
  flex-shrink:0;
  height:auto;
  min-height:auto;
  max-height:none;
  transform:none;
  zoom:normal;
}
/* 材料區吸收剩餘高度；手寫留白在清單與備註之間；不可縮到小於內容（避免壓到下方） */
.cp-mat-block{
  box-sizing:border-box;
  position:static;
  flex:1 1 auto;
  display:flex;
  flex-direction:column;
  height:auto;
  min-height:auto;
  max-height:none;
  transform:none;
  zoom:normal;
  overflow:visible;
}
.cp-mat-handwrite{
  box-sizing:border-box;
  position:static;
  flex:1 1 auto;
  width:100%;
  min-height:0;
  max-height:none;
  transform:none;
  zoom:normal;
}
/* 工程收費＋客戶備註：緊湊 */
.cp-fee-block{
  box-sizing:border-box;
  position:static;
  flex:0 0 auto;
  height:auto;
  min-height:auto;
  max-height:none;
  transform:none;
  zoom:normal;
}
/* 簽名：緊接收費區，不 margin-top:auto 拉開 */
.cp-sigs{
  box-sizing:border-box;
  position:static;
  flex:0 0 auto;
  margin-top:0;
  height:auto;
  min-height:auto;
  max-height:none;
  transform:none;
  zoom:normal;
}
.cp-text,.cp-val{
  overflow-wrap:anywhere;
  word-break:break-word;
  white-space:pre-wrap;
}
.cp-mat-name{
  overflow-wrap:anywhere;
  word-break:break-word;
  white-space:normal;
}`;
}

/**
 * continuous-print 點陣機極簡樣式。
 * 主區塊單條實線分隔；材料標題／列用淺虛線；簽名每側一條簽名線；日期不加線。
 * 主要留白在材料下方手寫區；禁止 scale／zoom／裁切；禁止連續多條貼近實線。
 */
function buildCompactOverridesCss(mode: WorkOrderHtmlMode): string {
  if (mode !== "continuous-print") return "";
  return `
*{
  -webkit-print-color-adjust:economy!important;
  print-color-adjust:economy!important;
  box-shadow:none!important;
  text-shadow:none!important;
  transform:none!important;
  zoom:normal!important;
}
html,body,.sheet,.page{
  color:#000!important;
  background:#fff!important;
  opacity:1!important;
}
body{
  font-family:${PRINT_CJK_FONT_STACK};
  font-size:15px;
  line-height:1.4;
  font-weight:500;
  font-stretch:100%;
  font-synthesis:none;
  font-variation-settings:normal;
  transform:none;
  zoom:normal;
}
.cp-title{
  display:block;
  text-align:center;
  font-size:24px;
  font-weight:700;
  color:#000!important;
  letter-spacing:1px;
  margin:0 0 0.3mm;
  padding:0;
  border:none;
  background:transparent!important;
  line-height:1.25;
  flex:0 0 auto;
}
.cp-grid{
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  column-gap:4mm;
  row-gap:0;
  width:100%;
  margin:0 0 0.2mm;
  padding:0 0 0.25mm;
  border:none;
  border-bottom:0.3mm solid #000;
  flex:0 0 auto;
}
.cp-col{display:block;min-width:0}
.cp-field{display:flex;gap:1.2mm;align-items:baseline;min-width:0;line-height:1.35;margin:0}
/* 技師：保留足夠手寫空間；無資料時空白（不加破折號），僅空值時顯示底線 */
.cp-field-tech{
  min-height:6mm;
  align-items:flex-end;
  margin-bottom:0.4mm;
}
.cp-field-tech .cp-val{
  min-height:4.8mm;
  padding-bottom:0.25mm;
}
.cp-field-tech.is-empty .cp-val{
  border-bottom:0.25mm solid #000;
}
.cp-lbl{
  flex:0 0 24mm;
  width:24mm;
  min-width:24mm;
  max-width:24mm;
  font-size:13px;font-weight:500;color:#000!important;
  white-space:nowrap;
  letter-spacing:0;
  overflow:visible;
  line-height:1.35;
}
.cp-val{
  flex:1 1 auto;
  font-size:16px;font-weight:600;color:#000!important;
  min-width:0;
  line-height:1.35;
}
/* 施工內容：精簡；約 1～2 行手寫補充；底部單條實線與材料分隔 */
.cp-block{
  display:flex;
  flex-direction:column;
  width:100%;
  margin:0;
  padding:0.12mm 0 0.2mm;
  border:none;
  border-bottom:0.3mm solid #000;
  overflow:visible;
  flex:0 0 auto;
}
.cp-sec{
  display:block;
  width:100%;
  font-size:16px;font-weight:700;color:#000!important;
  margin:0 0 0.12mm;padding:0;
  border:none;background:transparent!important;
  line-height:1.35;
  flex:0 0 auto;
}
.cp-text{
  display:block;
  width:100%;
  font-size:16px;font-weight:500;color:#000!important;
  margin:0;padding:0;line-height:1.4;
  border:none;background:transparent!important;
  flex:0 0 auto;
}
.cp-notes-block .cp-text{
  font-size:15px;
  line-height:1.4;
}
.cp-write-space{
  flex:0 0 auto;
  height:2.5mm;
  width:100%;
  margin-top:0.15mm;
  border:none;
}
/* 材料區：可長高吸收留白，但不縮到小於材料列（避免重疊下方） */
.cp-mat-block{
  display:flex;
  flex-direction:column;
  width:100%;
  margin:0;
  padding:0.15mm 0 0.25mm;
  border:none;
  border-bottom:0.3mm solid #000;
  overflow:visible;
  flex:1 1 auto;
  min-height:auto;
}
.cp-mat-block > .cp-sec{
  margin:0 0 0.15mm;
  flex:0 0 auto;
}
.cp-mat-header,
.cp-mat-row{
  display:grid;
  /* 數量縮窄並靠近品項；右側留白避免貼孔，但不把數量甩到紙緣 */
  grid-template-columns:8% 58% 12% 22%;
  column-gap:0;
  width:100%;
  max-width:100%;
  align-items:center;
  overflow:visible;
}
.cp-mat-header{
  font-size:14px;font-weight:700;color:#000!important;
  padding:0.2mm 0 0.25mm;
  margin:0;
  border:none;
  border-bottom:0.18mm dotted #888;
  line-height:1.35;
  flex:0 0 auto;
}
.cp-mat-list{
  display:block;
  width:100%;
  margin:0;
  padding:0;
  border:none;
  overflow:visible;
  flex:0 0 auto;
}
.cp-mat-row{
  font-size:16px;font-weight:500;color:#000!important;
  padding:0.35mm 0;
  margin:0;
  border:none;
  border-bottom:0.15mm dotted #999;
  line-height:1.4;
  min-height:5mm;
  flex:0 0 auto;
}
.cp-mat-row:last-child{
  border-bottom:0.15mm dotted #999;
}
.cp-mat-no{text-align:center;font-weight:700}
.cp-mat-name{text-align:left;min-width:0;padding-right:1.2mm;font-size:16px;font-weight:600}
.cp-mat-qty{text-align:center;font-weight:700;font-size:16px}
.cp-mat-pad{min-width:0}
/* 材料下方手寫留白：0/1/2 筆較大；5/8 筆縮小；有餘高時再伸展 */
.cp-mat-handwrite{
  flex:1 1 auto;
  width:100%;
  margin:0;
  padding:0;
  border:none;
  min-height:5mm;
}
.cp-mat-block[data-mat-count="0"] .cp-mat-handwrite{min-height:20mm}
.cp-mat-block[data-mat-count="1"] .cp-mat-handwrite{min-height:16mm}
.cp-mat-block[data-mat-count="2"] .cp-mat-handwrite{min-height:12mm}
.cp-mat-block[data-mat-count="3"] .cp-mat-handwrite{min-height:8mm}
.cp-mat-block[data-mat-count="4"] .cp-mat-handwrite{min-height:5mm}
.cp-mat-block[data-mat-count="5"] .cp-mat-handwrite{min-height:3mm}
.cp-mat-block[data-mat-count="6"] .cp-mat-handwrite{min-height:2mm}
.cp-mat-block[data-mat-count="7"] .cp-mat-handwrite{min-height:1.2mm}
.cp-mat-block[data-mat-count="8"] .cp-mat-handwrite{min-height:0.8mm}
/* 多筆材料時略壓列高，重要欄位不得小於 15px */
.cp-mat-block[data-mat-count="5"] .cp-mat-row,
.cp-mat-block[data-mat-count="6"] .cp-mat-row,
.cp-mat-block[data-mat-count="7"] .cp-mat-row,
.cp-mat-block[data-mat-count="8"] .cp-mat-row{
  padding:0.12mm 0;
  min-height:4.2mm;
  line-height:1.35;
  font-size:15px;
}
.cp-mat-block[data-mat-count="7"] .cp-mat-name,
.cp-mat-block[data-mat-count="8"] .cp-mat-name,
.cp-mat-block[data-mat-count="7"] .cp-mat-qty,
.cp-mat-block[data-mat-count="8"] .cp-mat-qty{
  font-size:15px;
}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-write-space{height:0}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-cust-space{min-height:0}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-sig-date{margin-top:0.6mm}
.page:has(.cp-mat-block[data-mat-count="7"]) .cp-write-space,
.page:has(.cp-mat-block[data-mat-count="6"]) .cp-write-space,
.page:has(.cp-mat-block[data-mat-count="5"]) .cp-write-space{height:1.2mm}
.page:has(.cp-mat-block[data-mat-count="7"]) .cp-val,
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-val{font-size:15px}
.page:has(.cp-mat-block[data-mat-count="7"]) .cp-field-tech,
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-field-tech,
.page:has(.cp-mat-block[data-mat-count="7"]) .cp-field-tech .cp-val,
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-field-tech .cp-val{min-height:0}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-block,
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-notes-block,
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-mat-block{padding-top:0;padding-bottom:0}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-fee-block{padding:0 0 0.1mm}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-grid{margin:0;padding-bottom:0.15mm}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-fee-opt{margin:0;line-height:1.25}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-mat-handwrite{min-height:0}
/* 備註：僅標題＋內容；緊湊；與工程收費之間不加分隔線，僅留白銜接 */
.cp-notes-block{
  display:flex;
  flex-direction:column;
  width:100%;
  margin:0;
  padding:0.1mm 0 0.55mm;
  border:none;
  overflow:visible;
  flex:0 0 auto;
}
/* 工程收費（左）＋客戶備註（右）；底部單條實線與簽名分隔 */
.cp-fee-block{
  display:grid;
  grid-template-columns:minmax(0,42%) minmax(0,58%);
  column-gap:4mm;
  align-items:stretch;
  width:100%;
  margin:0;
  padding:0.2mm 0 0.15mm;
  border:none;
  border-bottom:0.3mm solid #000;
  overflow:visible;
  flex:0 0 auto;
}
.cp-fee-left,.cp-fee-right{
  display:flex;
  flex-direction:column;
  min-width:0;
  overflow:visible;
}
.cp-fee-opt{
  display:flex;
  align-items:center;
  gap:1.4mm;
  font-size:15px;font-weight:700;color:#000!important;
  line-height:1.35;
  margin:0.15mm 0 0;
}
.cp-check{
  box-sizing:border-box;
  flex:0 0 4mm;
  width:4mm;
  height:4mm;
  min-width:4mm;
  min-height:4mm;
  border:0.35mm solid #000;
  background:transparent!important;
  display:inline-block;
}
.cp-fee-blank{
  display:inline-block;
  width:28mm;
  max-width:28mm;
  min-width:25mm;
  border:none;
  border-bottom:0.3mm solid #000;
  height:0;
  vertical-align:baseline;
  margin:0 0.8mm 0 0.5mm;
}
/* 客戶備註：乾淨留白，不畫輔助線 */
.cp-cust-space{
  flex:1 1 auto;
  min-height:3.5mm;
  width:100%;
  margin-top:0.1mm;
  border:none;
}
/* 簽名：與上方分隔線留 2–3mm → 標題 → 12mm 留白 → 簽名線 → 短距 → 日期：（不加線） */
.cp-sigs{
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  column-gap:8mm;
  width:100%;
  max-width:100%;
  margin-top:0;
  margin-bottom:0;
  padding-top:2.4mm;
  border:none;
  overflow:visible;
  align-items:start;
  flex:0 0 auto;
}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-sigs{padding-top:0.6mm}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-notes-block{padding-bottom:0}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-sig-date{margin-top:0.3mm}
.page:has(.cp-mat-block[data-mat-count="7"]) .cp-title,
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-title{font-size:24px;line-height:1.25;margin:0}
.page:has(.cp-mat-block[data-mat-count="7"]) .cp-field,
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-field{line-height:1.3}
.page:has(.cp-mat-block[data-mat-count="8"]) .cp-mat-row{line-height:1.25;min-height:0}
.cp-sig{
  box-sizing:border-box;
  min-width:0;
  height:auto;
  display:flex;
  flex-direction:column;
  color:#000!important;
  background:transparent!important;
  border:none;
  overflow:visible;
}
.cp-sig-title{
  font-size:13px;font-weight:700;
  margin:0;padding:0;
  flex:0 0 auto;
  line-height:1.35;
}
.cp-sig-space{
  flex:0 0 12mm;
  height:12mm;
  min-height:12mm;
  width:100%;
}
.cp-sig-line{
  width:100%;
  max-width:75mm;
  border:none;
  border-bottom:0.3mm solid #000;
  height:0;
  margin:0;
  flex:0 0 auto;
}
.cp-sig-date{
  font-size:12px;font-weight:700;
  display:block;
  margin-top:1.2mm;
  flex:0 0 auto;
  line-height:1.35;
  border:none;
}
.hdr,.co-logo,.pf,.head-row{display:none!important}
`;
}

/** 從備註抽出「負責業務」供基本資料欄顯示（列印版面用，不改資料來源）。 */
function splitSalesRepFromNotes(notes: string, order: Record<string, unknown>): { notesText: string; salesRep: string } {
  let salesRep = String(order.salesRepName || order.primarySalesRepName || "").trim();
  const kept: string[] = [];
  for (const line of notes.split(/\r?\n/)) {
    const m = line.match(/^\s*負責業務\s*[：:]\s*(.*)$/);
    if (m) {
      if (!salesRep) salesRep = String(m[1] || "").trim();
      continue;
    }
    kept.push(line);
  }
  return {
    notesText: kept.join("\n").replace(/\n+$/g, "").trim(),
    salesRep,
  };
}

function dash(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  return s ? esc(s) : "—";
}

export function buildWorkOrderHtml(order: any, options: WorkOrderHtmlOptions = {}): string {
  const mode: WorkOrderHtmlMode = options.mode ?? "digital";
  const calibration: PrintCalibration = options.calibration ?? PRINT_CALIBRATION_DEFAULT;
  const woNum = order.workOrderNumber || `WO-${String(order.id).padStart(4, "0")}`;
  const printDate = new Date().toLocaleDateString("zh-TW");
  let techDisplay = "";
  try {
    const techs = order.technicians ? JSON.parse(order.technicians) : null;
    if (Array.isArray(techs) && techs.length) techDisplay = techs.join("、");
  } catch { /* ignore */ }
  if (order.assignedTo) {
    techDisplay = order.assignedTo + (order.assistantTo ? ` / ${order.assistantTo}` : "");
  }
  const techDisplayDigital = techDisplay || "—";

  const equipment = resolveEquipmentItems(order);
  const itemRows = buildMaterialRows(equipment);

  const sitePhone = order.mobilePhone || "";
  const companyPhone = order.telephone || "";
  const phoneDisplay = [sitePhone, companyPhone ? `公司 ${companyPhone}` : ""].filter(Boolean).join("　") || "—";
  const woNotes = stripQuotePricingFromNotes(order.notes || "");
  const isContinuousPrint = mode === "continuous-print";

  if (isContinuousPrint) {
    const matRows = buildContinuousMaterialRows(equipment);
    const descText = (order.description && String(order.description).trim()) || "—";
    const { notesText: notesBody, salesRep } = splitSalesRepFromNotes(woNotes, order);
    const notesText = (notesBody && notesBody.trim()) || "—";
    const matList = matRows;
    const matBody = `<div class="cp-mat-header"><div class="cp-mat-no">項次</div><div class="cp-mat-name">品項名稱</div><div class="cp-mat-qty">數量</div><div class="cp-mat-pad" aria-hidden="true"></div></div>
    <div class="cp-mat-list">${matList}</div>
    <div class="cp-mat-handwrite" aria-hidden="true"></div>`;
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${esc(woNum)}</title>
${printFontLinksHtml()}
<style>
*{margin:0;padding:0;box-sizing:border-box}
${buildPageBoxCss(mode, calibration)}
${buildCompactOverridesCss(mode)}
${PRINT_CJK_METRIC_CSS}
</style>
</head>
<body>
<div class="sheet">
<div class="page">
  <div class="cp-title">晟風空調工程｜派工單</div>

  <div class="cp-grid">
    <div class="cp-col">
      <div class="cp-field"><span class="cp-lbl">案件編號：</span><span class="cp-val">${esc(woNum)}</span></div>
      <div class="cp-field"><span class="cp-lbl">客戶：</span><span class="cp-val">${dash(order.customerName)}</span></div>
      <div class="cp-field cp-field-tech${techDisplay ? "" : " is-empty"}"><span class="cp-lbl">技師：</span><span class="cp-val">${esc(techDisplay)}</span></div>
      <div class="cp-field"><span class="cp-lbl">現場聯絡人：</span><span class="cp-val">${dash(order.contactPerson)}</span></div>
      <div class="cp-field"><span class="cp-lbl">地址：</span><span class="cp-val">${dash(order.installAddress)}</span></div>
    </div>
    <div class="cp-col">
      <div class="cp-field"><span class="cp-lbl">日期：</span><span class="cp-val">${dash(order.scheduledDate || printDate)}</span></div>
      <div class="cp-field"><span class="cp-lbl">電話：</span><span class="cp-val">${esc(phoneDisplay)}</span></div>
      <div class="cp-field"><span class="cp-lbl">工程名稱：</span><span class="cp-val">${dash(order.title)}</span></div>
      <div class="cp-field"><span class="cp-lbl">負責業務：</span><span class="cp-val">${dash(salesRep)}</span></div>
    </div>
  </div>

  <section class="cp-block">
    <h2 class="cp-sec">施工內容：</h2>
    <div class="cp-text">${esc(descText)}</div>
    <div class="cp-write-space" aria-hidden="true"></div>
  </section>

  <section class="cp-mat-block" data-mat-count="${equipment.length}">
    <h2 class="cp-sec">材料／設備</h2>
    ${matBody}
  </section>

  <section class="cp-notes-block">
    <h2 class="cp-sec">備註：</h2>
    <div class="cp-text">${esc(notesText)}</div>
  </section>

  <section class="cp-fee-block">
    <div class="cp-fee-left">
      <h2 class="cp-sec">工程收費：</h2>
      <div class="cp-fee-opt"><span class="cp-check" aria-hidden="true"></span>收費 <span class="cp-fee-blank"></span> 元</div>
      <div class="cp-fee-opt"><span class="cp-check" aria-hidden="true"></span>無收費</div>
    </div>
    <div class="cp-fee-right">
      <h2 class="cp-sec">客戶備註：</h2>
      <div class="cp-cust-space" aria-hidden="true"></div>
    </div>
  </section>

  <div class="cp-sigs">
    <div class="cp-sig">
      <div class="cp-sig-title">客戶簽名：</div>
      <div class="cp-sig-space"></div>
      <div class="cp-sig-line"></div>
      <div class="cp-sig-date">日期：</div>
    </div>
    <div class="cp-sig">
      <div class="cp-sig-title">技師簽名：</div>
      <div class="cp-sig-space"></div>
      <div class="cp-sig-line"></div>
      <div class="cp-sig-date">日期：</div>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
  }

  // ─── digital 模式：維持既有 PDF／LINE 版面 ───
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${woNum}</title>
${printFontLinksHtml()}
<style>
/* ===== Base ===== */
*{margin:0;padding:0;box-sizing:border-box}
body,.sheet,.page{
  font-family:${PRINT_CJK_FONT_STACK};
  font-stretch:100%;font-synthesis:none;font-variation-settings:normal;
  font-size:14px;font-weight:400;line-height:1.4;color:#111;background:#fff;
  transform:none;zoom:normal;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ===== Page setup ===== */
${buildPageBoxCss(mode, calibration)}

/* ===== Header ===== */
.hdr{
  display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:1px solid #ddd;
  padding-bottom:2mm;margin-bottom:2.5mm;
  flex-shrink:0;
}
.co{display:flex;align-items:center;gap:3mm}
.co-logo{
  width:44px;height:44px;max-width:44px;max-height:44px;
  object-fit:contain;flex-shrink:0;
}
.co-name{font-size:15px;font-weight:700;line-height:1.4;color:#111}
.co-sub{font-size:12px;font-weight:400;color:#666;line-height:1.4}
.wo-right{text-align:right}
.wo-label{font-size:28px;font-weight:700;color:#111;letter-spacing:2px;line-height:1.2}
.wo-num{font-size:13px;font-weight:600;font-family:monospace;line-height:1.4}
.wo-meta{font-size:12px;font-weight:400;color:#666;margin-top:1px;line-height:1.4}

.grid{
  display:grid;grid-template-columns:1fr 1fr;
  gap:1.2mm 6mm;margin-bottom:2.5mm;
  flex-shrink:0;
}
.field{display:flex;flex-direction:column;gap:0.6mm}
.lbl{font-size:13px;font-weight:500;color:#666;line-height:1.3}
.val{font-size:16px;font-weight:600;color:#111;line-height:1.4}
.full{grid-column:1/-1}

.sec-title{
  color:#111;font-size:16px;font-weight:700;
  background:transparent;border:none;
  padding:0 0 1.2mm;margin:0 0 2mm;
  display:block;width:fit-content;
  border-bottom:2.5px solid ${COLORS.primary};
  letter-spacing:0;line-height:1.3;
}
.eq-title{
  color:#111;font-size:18px;font-weight:700;
  background:transparent;border:none;
  padding:0 0 1.2mm;margin:0 0 2mm;
  display:block;width:fit-content;
  border-bottom:2.5px solid ${COLORS.primary};
}
.section{margin-bottom:2.5mm;flex:0 0 auto}

.eq-table{
  width:100%;border-collapse:collapse;
  table-layout:fixed;font-size:16px;line-height:1.4;
  font-family:${PRINT_CJK_FONT_STACK};
  font-stretch:100%;transform:none;zoom:normal;
}
.eq-table .head-row{background:#f4f4f4;color:#111}
.eq-table .head-row th{
  border:1px solid #ccc;
  font-size:14px;font-weight:700;text-align:center;
  vertical-align:middle;line-height:1.4;
  padding:8px 6px;color:#111;
  font-stretch:100%;letter-spacing:0;transform:none;zoom:normal;
  white-space:nowrap;
}
.eq-table tbody td{
  border:1px solid #ccc;
  vertical-align:middle;font-size:16px;font-weight:500;
  line-height:1.4;padding:8px 6px;color:#111;text-align:center;
  font-stretch:100%;letter-spacing:0;transform:none;zoom:normal;
  overflow:visible;
}
.eq-table tbody tr{page-break-inside:avoid;break-inside:avoid}
.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.eq-table .col-item{font-size:18px;font-weight:700;text-align:left;word-break:break-word}
.eq-table .col-cat,.eq-table .col-model,.eq-table .col-qty,.eq-table .col-unit{text-align:center;font-weight:700;font-size:16px}
.eq-table .col-qty,.eq-table .col-unit{white-space:nowrap}
.eq-table .col-notes{font-size:13px;font-weight:400;text-align:center}
.col-w6{width:6%}
.col-w10{width:12%}
.col-w12{width:16%}
.col-w8{width:10%}
.col-w16{width:14%}

.box{
  border:1px solid #e5e5e5;
  padding:2mm 3mm;
  font-size:16px;font-weight:500;white-space:pre-wrap;
  line-height:1.45;background:#fff;color:#111;
}
.section-flex-notes .box{font-size:15px}

.bottom-block{
  margin-top:auto;
  flex-shrink:0;
  page-break-inside:avoid;break-inside:avoid;
}
.sigs{
  display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;
  margin-bottom:1.5mm;
}
.sig{
  text-align:center;border-top:1px solid #111;
  font-size:13px;font-weight:500;color:#555;line-height:1.4;
  padding-top:2mm;padding-bottom:6mm;
}
.sig-date{font-size:12px;font-weight:400;color:#888;line-height:1.4}
.pf{
  display:flex;justify-content:space-between;align-items:center;
  font-size:12px;font-weight:400;color:#888;line-height:1.4;
  border-top:1px solid #eee;padding-top:1.5mm;
}
${PRINT_DOC_TYPE_CSS}
.section-flex .box{font-size:16px!important;font-weight:500!important}
.section-flex-notes .box{font-size:15px!important;font-weight:400!important}
.eq-table .head-row th,.eq-table tbody td{padding:8px 6px!important}
</style>
</head>
<body>
<div class="sheet">
<div class="page" data-mat-count="${equipment.length}">
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

  <div class="grid">
    <div class="field wo-id-field"><span class="lbl">案件編號</span><span class="val">${woNum}</span></div>
    <div class="field f-date"><span class="lbl">日期</span><span class="val">${esc(order.scheduledDate || printDate)}</span></div>
    <div class="field f-customer"><span class="lbl">客戶</span><span class="val">${esc(order.customerName || "—")}</span></div>
    <div class="field f-phone"><span class="lbl">電話</span><span class="val">${esc(phoneDisplay)}</span></div>
    ${order.title ? `<div class="field full f-title"><span class="lbl">工程名稱</span><span class="val">${esc(order.title)}</span></div>` : ""}
    ${order.contactPerson ? `<div class="field f-contact"><span class="lbl">現場聯絡</span><span class="val">${esc(order.contactPerson)}</span></div>` : ""}
    <div class="field full f-address"><span class="lbl">地址</span><span class="val">${esc(order.installAddress || "—")}</span></div>
    <div class="field f-tech"><span class="lbl">技師</span><span class="val">${esc(techDisplayDigital)}</span></div>
  </div>

  <div class="section section-flex">
    <div class="sec-title">施工內容</div>
    <div class="box">${esc(order.description || "（無）")}</div>
  </div>

  <div class="section">
    <div class="eq-title">材料／設備</div>
    <table class="eq-table">
      <thead><tr class="head-row">
        <th class="col-w6">項次</th>
        <th class="col-w10">類別</th>
        <th>品項／規格</th>
        <th class="col-w12">型號</th>
        <th class="col-w8">數量</th>
        <th class="col-w8">單位</th>
        <th class="col-w16">備註</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <div class="section section-flex-notes">
    <div class="sec-title">備註</div>
    <div class="box">${esc(woNotes || "（無）")}</div>
  </div>

  <div class="bottom-block">
    <div class="sigs">
      <div class="sig">客戶簽名<br><span class="sig-date">日期：________</span></div>
      <div class="sig">技師簽名<br><span class="sig-date">日期：________</span></div>
      <div class="sig">公司經手人<br><span class="sig-date">日期：________</span></div>
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
