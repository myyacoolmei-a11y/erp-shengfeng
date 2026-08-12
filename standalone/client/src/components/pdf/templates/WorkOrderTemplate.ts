// 派工單 Template — 24×14cm Landscape, 工程現場單據風格
// 獨立版面：修改此檔不影響其他 Template
// continuous-print：EPSON 點陣機 9.5×5.5in（241.3×139.7mm）單頁極簡黑白版型

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

/** digital 模式材料列（含單位／備註）；空資料仍留一空白列維持表格結構。 */
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

/**
 * continuous-print 材料列：同一 map、同一 row 元件，無最後一筆特殊定位。
 * 無資料時不輸出空白列。
 */
function buildContinuousMaterialRows(equipment: EquipmentRow[]): string {
  if (equipment.length === 0) return "";
  return equipment.map((it, i) => {
    const qty = it.quantity != null ? String(it.quantity) : "—";
    const unit = it.unit ? esc(it.unit) : "";
    const qtyDisplay = unit ? `${qty}${unit}` : qty;
    const remark = equipmentRemark(it);
    const name = remark ? `${equipmentSpec(it)}（${remark}）` : equipmentSpec(it);
    return `<div class="cp-mat-row" data-mat-index="${i + 1}">
      <div class="cp-mat-no">${i + 1}</div>
      <div class="cp-mat-name">${esc(name)}</div>
      <div class="cp-mat-qty">${qtyDisplay}</div>
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
   .page 撐滿可印區；中段區塊均分垂直空間；簽名靠底。
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
/* 標題／基本資料／材料列／施工／備註：依內容高度，不硬撐空白 */
.cp-title,.cp-grid,.cp-block,.cp-notes-block,.cp-mat-list,.cp-mat-row,.cp-mat-header,.cp-text,.cp-field,.cp-val,.cp-lbl,.cp-mat-name,.cp-mat-no,.cp-mat-qty,.cp-mat-pad,.cp-write-space{
  box-sizing:border-box;
  position:static;
  flex-shrink:0;
  height:auto;
  min-height:auto;
  max-height:none;
  transform:none;
  zoom:normal;
}
/* 材料區：依列數佔高，行距在 compact CSS 加大 */
.cp-mat-block{
  box-sizing:border-box;
  position:static;
  flex:0 0 auto;
  height:auto;
  min-height:auto;
  max-height:none;
  transform:none;
  zoom:normal;
}
/* 工程收費＋客戶備註：內容高度；材料少時不搶簽名區 */
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
/* 簽名欄靠底；剩餘高度給簽名留白 */
.cp-sigs{
  box-sizing:border-box;
  position:static;
  flex:1 0 auto;
  margin-top:auto;
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
 * continuous-print 點陣機極簡樣式（置於 PDF_LAYOUT_CSS 之後以覆寫）。
 * 施工／備註不硬撐空白；材料行距加大；工程收費用 CSS 勾選框；
 * 簽名留白加大、日期僅文字無底線。禁止 scale／zoom／裁切。
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
  font-family:"Noto Sans TC","Microsoft JhengHei",Arial,sans-serif;
  font-size:10.5pt;
  line-height:1.2;
  font-weight:500;
}
.cp-title{
  display:block;
  text-align:center;
  font-size:15pt;
  font-weight:900;
  color:#000!important;
  letter-spacing:1.2px;
  margin:0 0 0.4mm;
  padding:0;
  border:none;
  background:transparent!important;
  line-height:1.1;
  flex:0 0 auto;
}
.cp-grid{
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  column-gap:4mm;
  row-gap:0;
  width:100%;
  margin:0 0 0.4mm;
  padding:0 0 0.4mm;
  border:none;
  border-bottom:0.3mm solid #000;
  flex:0 0 auto;
}
.cp-col{display:block;min-width:0}
.cp-field{display:flex;gap:1.2mm;align-items:baseline;min-width:0;line-height:1.15;margin:0}
.cp-lbl{
  flex:0 0 20mm;
  font-size:10.5pt;font-weight:700;color:#000!important;
}
.cp-val{
  flex:1 1 auto;
  font-size:11pt;font-weight:700;color:#000!important;
  min-width:0;
}
/* 施工內容：內容＋約 1～2 行手寫，不硬撐大片空白 */
.cp-block{
  display:flex;
  flex-direction:column;
  width:100%;
  margin:0;
  padding:0.3mm 0 0.35mm;
  border:none;
  border-bottom:0.3mm solid #000;
  overflow:visible;
  flex:0 0 auto;
}
.cp-sec{
  display:block;
  width:100%;
  font-size:10.5pt;font-weight:700;color:#000!important;
  margin:0 0 0.25mm;padding:0;
  border:none;background:transparent!important;
  line-height:1.15;
  flex:0 0 auto;
}
.cp-text{
  display:block;
  width:100%;
  font-size:10.5pt;font-weight:500;color:#000!important;
  margin:0;padding:0;line-height:1.2;
  border:none;background:transparent!important;
  flex:0 0 auto;
}
.cp-write-space{
  flex:0 0 auto;
  height:3mm;
  width:100%;
  margin-top:0.35mm;
  border:none;
  border-bottom:0.25mm solid #000;
}
/* 材料區：項次 8%／品項 62%／數量 12%／右側手寫空白 18%；行距加大（仍須容納 8 筆單頁） */
.cp-mat-block{
  display:flex;
  flex-direction:column;
  width:100%;
  margin:0;
  padding:0.3mm 0 0.35mm;
  border:none;
  border-bottom:0.3mm solid #000;
  overflow:visible;
  flex:0 0 auto;
}
.cp-mat-block > .cp-sec{
  margin:0 0 0.25mm;
}
.cp-mat-header,
.cp-mat-row{
  display:grid;
  grid-template-columns:8% 62% 12% 18%;
  column-gap:0;
  width:100%;
  max-width:100%;
  align-items:center;
  overflow:visible;
}
.cp-mat-header{
  font-size:10pt;font-weight:700;color:#000!important;
  padding:0.22mm 0 0.28mm;
  margin:0 0 0.22mm;
  border:none;
  border-bottom:0.3mm solid #000;
  line-height:1.22;
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
  font-size:10pt;font-weight:500;color:#000!important;
  padding:0.14mm 0;
  margin:0;
  border:none;
  line-height:1.2;
}
.cp-mat-no{text-align:center;font-weight:700}
.cp-mat-name{text-align:left;min-width:0;padding-right:1mm}
.cp-mat-qty{text-align:center;font-weight:700}
.cp-mat-pad{min-width:0}
.cp-mat-empty-row .cp-mat-name{font-weight:500}
/* 備註：內容完整顯示即可，不硬撐空白 */
.cp-notes-block{
  display:flex;
  flex-direction:column;
  width:100%;
  margin:0;
  padding:0.2mm 0 0.25mm;
  border:none;
  border-bottom:0.3mm solid #000;
  overflow:visible;
  flex:0 0 auto;
}
/* 工程收費（左）＋客戶備註（右） */
.cp-fee-block{
  display:grid;
  grid-template-columns:minmax(0,42%) minmax(0,58%);
  column-gap:4mm;
  align-items:stretch;
  width:100%;
  margin:0;
  padding:0.2mm 0 0.3mm;
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
  gap:1.5mm;
  font-size:10.5pt;font-weight:500;color:#000!important;
  line-height:1.15;
  margin:0.55mm 0 0;
}
.cp-check{
  box-sizing:border-box;
  flex:0 0 4.2mm;
  width:4.2mm;
  height:4.2mm;
  min-width:4.2mm;
  min-height:4.2mm;
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
  margin:0 1mm 0 0.6mm;
}
.cp-cust-lines{
  flex:1 1 auto;
  display:flex;
  flex-direction:column;
  justify-content:space-evenly;
  gap:0;
  min-height:8mm;
  margin-top:0.4mm;
  padding-bottom:0.2mm;
}
.cp-cust-line{
  width:100%;
  border:none;
  border-bottom:0.25mm solid #000;
  height:0;
  flex:0 0 auto;
}
/* 簽名：大留白；日期僅文字、無短底線 */
.cp-sigs{
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  column-gap:8mm;
  width:100%;
  max-width:100%;
  margin-top:auto;
  margin-bottom:0;
  padding-top:0.4mm;
  border:none;
  overflow:visible;
  align-items:stretch;
  flex:1 0 auto;
}
.cp-sig{
  box-sizing:border-box;
  min-width:0;
  min-height:16.5mm;
  height:100%;
  display:flex;
  flex-direction:column;
  color:#000!important;
  background:transparent!important;
  border:none;
  overflow:visible;
}
.cp-sig-title{
  font-size:10.5pt;font-weight:700;
  margin:0;padding:0;
  flex:0 0 auto;
  line-height:1.15;
}
.cp-sig-space{
  flex:1 1 auto;
  min-height:9mm;
}
.cp-sig-date{
  font-size:10.5pt;font-weight:700;
  display:block;
  margin-top:1.5mm;
  flex:0 0 auto;
  line-height:1.2;
}
.hdr,.co-logo,.pf,.head-row{display:none!important}
`;
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

  if (isContinuousPrint) {
    const matRows = buildContinuousMaterialRows(equipment);
    const descText = (order.description && String(order.description).trim()) || "—";
    const notesText = (woNotes && woNotes.trim()) || "—";
    const matList = matRows
      || `<div class="cp-mat-row cp-mat-empty-row" data-mat-index="0">
      <div class="cp-mat-no"></div>
      <div class="cp-mat-name">—</div>
      <div class="cp-mat-qty"></div>
      <div class="cp-mat-pad" aria-hidden="true"></div>
    </div>`;
    const matBody = `<div class="cp-mat-header"><div class="cp-mat-no">項次</div><div class="cp-mat-name">品項名稱</div><div class="cp-mat-qty">數量</div><div class="cp-mat-pad" aria-hidden="true"></div></div>
    <div class="cp-mat-list">${matList}</div>`;
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${esc(woNum)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
${buildPageBoxCss(mode, calibration)}
${buildCompactOverridesCss(mode)}
</style>
</head>
<body>
<div class="sheet">
<div class="page">
  <div class="cp-title">晟風空調工程｜派工單</div>

  <div class="cp-grid">
    <div class="cp-col">
      <div class="cp-field"><span class="cp-lbl">案件編號</span><span class="cp-val">${esc(woNum)}</span></div>
      <div class="cp-field"><span class="cp-lbl">客戶</span><span class="cp-val">${dash(order.customerName)}</span></div>
      <div class="cp-field"><span class="cp-lbl">技師</span><span class="cp-val">${esc(techDisplay)}</span></div>
      <div class="cp-field"><span class="cp-lbl">現場聯絡人</span><span class="cp-val">${dash(order.contactPerson)}</span></div>
      <div class="cp-field"><span class="cp-lbl">地址</span><span class="cp-val">${dash(order.installAddress)}</span></div>
    </div>
    <div class="cp-col">
      <div class="cp-field"><span class="cp-lbl">日期</span><span class="cp-val">${dash(order.scheduledDate || printDate)}</span></div>
      <div class="cp-field"><span class="cp-lbl">電話</span><span class="cp-val">${esc(phoneDisplay)}</span></div>
      <div class="cp-field"><span class="cp-lbl">工程名稱</span><span class="cp-val">${dash(order.title)}</span></div>
    </div>
  </div>

  <section class="cp-block">
    <h2 class="cp-sec">施工內容</h2>
    <div class="cp-text">${esc(descText)}</div>
    <div class="cp-write-space" aria-hidden="true"></div>
  </section>

  <section class="cp-mat-block" data-mat-count="${equipment.length}">
    <h2 class="cp-sec">材料／設備</h2>
    ${matBody}
  </section>

  <section class="cp-notes-block">
    <h2 class="cp-sec">備註</h2>
    <div class="cp-text">${esc(notesText)}</div>
  </section>

  <section class="cp-fee-block">
    <div class="cp-fee-left">
      <h2 class="cp-sec">工程收費</h2>
      <div class="cp-fee-opt"><span class="cp-check" aria-hidden="true"></span>收費 <span class="cp-fee-blank"></span> 元</div>
      <div class="cp-fee-opt"><span class="cp-check" aria-hidden="true"></span>無收費</div>
    </div>
    <div class="cp-fee-right">
      <h2 class="cp-sec">客戶備註：</h2>
      <div class="cp-cust-lines" aria-hidden="true">
        <div class="cp-cust-line"></div>
        <div class="cp-cust-line"></div>
      </div>
    </div>
  </section>

  <div class="cp-sigs">
    <div class="cp-sig">
      <div class="cp-sig-title">客戶簽名</div>
      <div class="cp-sig-space"></div>
      <div class="cp-sig-date">日期：</div>
    </div>
    <div class="cp-sig">
      <div class="cp-sig-title">技師簽名</div>
      <div class="cp-sig-space"></div>
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
</style>
</head>
<body>
<div class="sheet">
<div class="page">
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
    <div class="field f-tech"><span class="lbl">技師</span><span class="val">${esc(techDisplay)}</span></div>
  </div>

  <div class="section section-flex">
    <div class="sec-title">施工內容</div>
    <div class="box">${esc(order.description || "（無）")}</div>
  </div>

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
