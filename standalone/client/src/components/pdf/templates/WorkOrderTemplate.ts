// 派工單 Template — digital 24×14cm／A4 橫式／點陣連續紙 24×13cm／熱感
// 獨立版面：修改此檔不影響其他 Template
// continuous-print：點陣連續紙 240mm × 130mm，與 A4 CSS 分離

import { logoUrl, COMPANY, COLORS, esc, PRINT_DOC_TYPE_CSS, PRINT_CJK_FONT_STACK, printFontLinksHtml } from "./brand-config";
import { stripQuotePricingFromNotes } from "../../../../../shared/workOrderNotes.ts";
import { PRINT_CALIBRATION_DEFAULT, type PrintCalibration } from "@/lib/printPaperConfig";
import { displayQuoteItemCategory, displayQuoteItemBrand } from "./printCategory";
import {
  WO_JOB_TYPE_OPTIONS,
  WO_PAYMENT_METHOD_OPTIONS,
  resolveJobTypes,
  resolveTechnicians,
  resolvePaymentMethods,
  deriveWoPaymentStatus,
  remainingBalance,
  jobTypeHas,
} from "../../../../../shared/workOrderDispatch.ts";

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
  const brand = displayQuoteItemBrand(it);
  const parts = [brand === "—" ? "" : brand, it.itemName || it.model].filter(Boolean);
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
    const brand = displayQuoteItemBrand(it);
    const spec = [brand === "—" ? "" : brand, it.itemName || it.model].filter(Boolean).join(" ").trim() || "—";
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

export type WorkOrderHtmlMode = "digital" | "continuous-print" | "a4-landscape" | "thermal-80" | "thermal-58";

function chkBox(on: boolean): string {
  return `<span class="chk${on ? " on" : ""}">${on ? "☑" : "☐"}</span>`;
}

/** 勾選＋文字視為單一不可拆開單位，避免「現／金」或 LINE Pay 被折行。 */
function chkItem(on: boolean, label: string): string {
  return `<span class="chk-item">${chkBox(on)}${label}</span>`;
}

/** 點陣連續紙收款方式短標（資料仍是「銀行匯款」）。 */
const CP_PAY_PRINT_LABEL: Record<string, string> = {
  現金: "現金",
  銀行匯款: "匯款",
  支票: "支票",
  "LINE Pay": "LINE Pay",
  其他: "其他",
};

function jobTypeCheckRowDense(order: Record<string, unknown>): string {
  const resolved = resolveJobTypes({
    jobTypes: order.jobTypes ?? (order as any).jobTypesResolved?.types,
    jobTypeOther: (order.jobTypeOther as string) ?? (order as any).jobTypesResolved?.otherLabel,
    projectType: order.projectType as string | null,
  });
  return WO_JOB_TYPE_OPTIONS.map((t) => {
    const on = jobTypeHas(resolved, t);
    const label = t === "其他"
      ? (resolved.otherLabel ? `其他：${esc(resolved.otherLabel)}` : "其他：______")
      : t;
    return chkItem(on, label);
  }).join("");
}

function paymentCheckRowDense(order: Record<string, unknown>): string {
  const billing = (order as any).billing || {};
  const resolved = resolvePaymentMethods({
    paymentMethods: order.paymentMethods,
    paymentMethodOther: order.paymentMethodOther as string | null,
    receivablePaymentMethod: billing.paymentMethod,
    paymentRecordMethods: Array.isArray(billing.payments)
      ? billing.payments.map((p: any) => p.paymentMethod)
      : [],
  });
  return WO_PAYMENT_METHOD_OPTIONS.map((m) => {
    const on = resolved.methods.includes(m);
    const label = m === "其他" && resolved.otherLabel
      ? `其他：${esc(resolved.otherLabel)}`
      : (CP_PAY_PRINT_LABEL[m] || m);
    return chkItem(on, label);
  }).join("");
}

function paymentStatusCheckRowDense(order: Record<string, unknown>): string {
  const billing = (order as any).billing || {};
  const total = Number(billing.totalAmount ?? order.billingTotalAmount ?? 0) || 0;
  const received = Number(billing.receivedAmount ?? 0) || 0;
  const status = deriveWoPaymentStatus({
    noCharge: Boolean(order.noCharge),
    totalAmount: total,
    receivedAmount: received,
    storedStatus: billing.paymentStatus,
  });
  return (["未收款", "部分收款", "已收款", "無須收款"] as const)
    .map((s) => chkItem(s === status, s))
    .join("");
}

function techCheckRowDense(order: Record<string, unknown>): string {
  const t = resolveTechnicians({
    technicians: order.technicians as string | null,
    assignedTo: order.assignedTo as string | null,
    assistantTo: order.assistantTo as string | null,
    primaryTechnician: order.primaryTechnician as string | null,
    extraTechnician: order.extraTechnician as string | null,
  });
  const selected = t.names.filter((n) => n && n !== t.extra);
  const boxes = selected.map((n) => chkItem(true, esc(n))).join("");
  const extra = t.extra ? chkItem(true, `其他：${esc(t.extra)}`) : chkItem(false, "其他：______");
  return `${boxes}${extra}`;
}

function jobTypeCheckRow(order: Record<string, unknown>): string {
  const resolved = resolveJobTypes({
    jobTypes: order.jobTypes ?? (order as any).jobTypesResolved?.types,
    jobTypeOther: (order.jobTypeOther as string) ?? (order as any).jobTypesResolved?.otherLabel,
    projectType: order.projectType as string | null,
  });
  return WO_JOB_TYPE_OPTIONS.map((t) => {
    const on = jobTypeHas(resolved, t);
    const label = t === "其他"
      ? (resolved.otherLabel ? `其他：${esc(resolved.otherLabel)}` : "其他：______")
      : t;
    return `${chkBox(on)}${label}`;
  }).join("　");
}

function paymentCheckRow(order: Record<string, unknown>): string {
  const billing = (order as any).billing || {};
  const resolved = resolvePaymentMethods({
    paymentMethods: order.paymentMethods,
    paymentMethodOther: order.paymentMethodOther as string | null,
    receivablePaymentMethod: billing.paymentMethod,
    paymentRecordMethods: Array.isArray(billing.payments)
      ? billing.payments.map((p: any) => p.paymentMethod)
      : [],
  });
  return WO_PAYMENT_METHOD_OPTIONS.map((m) => {
    const on = resolved.methods.includes(m);
    const label = m === "其他" && resolved.otherLabel ? `其他：${esc(resolved.otherLabel)}` : m;
    return `${chkBox(on)}${label}`;
  }).join("　");
}

function paymentStatusCheckRow(order: Record<string, unknown>): string {
  const billing = (order as any).billing || {};
  const total = Number(billing.totalAmount ?? order.billingTotalAmount ?? 0) || 0;
  const received = Number(billing.receivedAmount ?? 0) || 0;
  const status = deriveWoPaymentStatus({
    noCharge: Boolean(order.noCharge),
    totalAmount: total,
    receivedAmount: received,
    storedStatus: billing.paymentStatus,
  });
  return (["未收款", "部分收款", "已收款", "無須收款"] as const)
    .map((s) => `${chkBox(s === status)}${s}`)
    .join("　");
}

function billingAmountRow(order: Record<string, unknown>): string {
  const billing = (order as any).billing || {};
  const total = Number(billing.totalAmount ?? order.billingTotalAmount ?? 0) || 0;
  const received = Number(billing.receivedAmount ?? 0) || 0;
  const remain = remainingBalance(total, received);
  const invoice = String(order.invoiceStatus || billing.invoiceStatus || "").trim();
  const money = (n: number) => (n > 0 ? n.toLocaleString("zh-TW") : "________");
  return `應收金額：${money(total)}　累計已收：${money(received)}　未收餘額：${money(remain)}${invoice ? `　發票：${esc(invoice)}` : ""}`;
}

function techCheckRow(order: Record<string, unknown>): string {
  const t = resolveTechnicians({
    technicians: order.technicians as string | null,
    assignedTo: order.assignedTo as string | null,
    assistantTo: order.assistantTo as string | null,
    primaryTechnician: order.primaryTechnician as string | null,
    extraTechnician: order.extraTechnician as string | null,
  });
  const selected = t.names.filter((n) => n && n !== t.extra);
  const boxes = selected.map((n) => `${chkBox(true)}${esc(n)}`).join("　");
  const extra = t.extra ? `${chkBox(true)}其他：${esc(t.extra)}` : `${chkBox(false)}其他：______`;
  return `${boxes}${boxes ? "　" : ""}${extra}`;
}

function printTech(order: Record<string, unknown>): { names: string; primary: string; extra: string } {
  const t = resolveTechnicians({
    technicians: order.technicians as string | null,
    assignedTo: order.assignedTo as string | null,
    assistantTo: order.assistantTo as string | null,
    primaryTechnician: order.primaryTechnician as string | null,
    extraTechnician: order.extraTechnician as string | null,
  });
  return {
    names: t.names.join("、"),
    primary: t.primary,
    extra: t.extra,
  };
}

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
 * - continuous-print：獨立 240×130mm 點陣連續紙，見 buildDotMatrix24x13Css。
 */
function buildPageBoxCss(mode: WorkOrderHtmlMode, _calibration: PrintCalibration): string {
  if (mode === "continuous-print") return "";
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

/** 點陣連續紙實際尺寸：寬 24cm × 高 13cm。與 A4／熱感／digital 完全分離。 */
const DOT_MATRIX_WO = {
  WIDTH_MM: 240,
  HEIGHT_MM: 130,
  PAD_X_MM: 7,
  PAD_Y_MM: 5,
} as const;

type DotMatrixPageKind = "single" | "first" | "mid" | "last";

function paginateDotMatrixMaterials(count: number): Array<{ start: number; end: number; kind: DotMatrixPageKind }> {
  const SINGLE = 6;
  const FIRST = 8;
  const LAST_WITH_FOOTER = 4;
  const MID = 14;
  if (count <= SINGLE) return [{ start: 0, end: count, kind: "single" }];
  const pages: Array<{ start: number; end: number; kind: DotMatrixPageKind }> = [];
  const firstEnd = Math.min(FIRST, count);
  pages.push({ start: 0, end: firstEnd, kind: "first" });
  let i = firstEnd;
  if (i >= count) {
    pages.push({ start: count, end: count, kind: "last" });
    return pages;
  }
  while (i < count) {
    const left = count - i;
    if (left <= LAST_WITH_FOOTER) {
      pages.push({ start: i, end: count, kind: "last" });
      break;
    }
    const take = Math.min(MID, left - LAST_WITH_FOOTER);
    pages.push({ start: i, end: i + take, kind: "mid" });
    i += take;
  }
  return pages;
}

/**
 * 獨立 24×13cm 點陣連續紙樣式。不引用 A4 CSS、不 scale、不 fit-to-page。
 * 勾選列 flex-wrap:nowrap + chk-item nowrap，避免收款方式直排拆字。
 */
function buildDotMatrix24x13Css(calibration: PrintCalibration): string {
  const offsetXMm = Number.isFinite(calibration?.offsetXMm) ? calibration.offsetXMm : 0;
  const offsetYMm = Number.isFinite(calibration?.offsetYMm) ? calibration.offsetYMm : 0;
  const padTop = DOT_MATRIX_WO.PAD_Y_MM + offsetYMm;
  const padRight = Math.max(0, DOT_MATRIX_WO.PAD_X_MM - offsetXMm);
  const padBottom = Math.max(0, DOT_MATRIX_WO.PAD_Y_MM - offsetYMm);
  const padLeft = DOT_MATRIX_WO.PAD_X_MM + offsetXMm;
  const W = DOT_MATRIX_WO.WIDTH_MM;
  const H = DOT_MATRIX_WO.HEIGHT_MM;
  return `
@page{size:${W}mm ${H}mm;margin:0}
html,body{
  box-sizing:border-box;
  width:${W}mm;
  margin:0;padding:0;
  background:#fff;color:#000;
  font-family:${PRINT_CJK_FONT_STACK};
  font-size:10.5pt;font-weight:400;line-height:1.35;
  font-synthesis:none;font-stretch:100%;
  transform:none;zoom:normal;
  -webkit-print-color-adjust:economy;print-color-adjust:economy;
}
*{box-sizing:border-box;box-shadow:none!important;text-shadow:none!important;-webkit-text-stroke:0!important;transform:none!important;zoom:normal!important}
.dot-matrix-page{
  width:${W}mm;
  height:${H}mm;
  max-width:${W}mm;
  max-height:${H}mm;
  box-sizing:border-box;
  padding:${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
  overflow:hidden;
  break-after:page;
  page-break-after:always;
  display:flex;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  background:#fff;color:#000;
}
.dot-matrix-page:last-child{
  break-after:auto;
  page-break-after:auto;
}
.cp-title{
  display:block;text-align:center;
  font-size:14.5pt;font-weight:600;line-height:1.15;
  letter-spacing:.3mm;margin:0 0 0.5mm;padding:0;flex:0 0 auto;
}
.cp-cont{font-size:9pt;font-weight:400;text-align:center;margin:0 0 0.6mm}
.chk-row{
  display:flex;flex-wrap:nowrap;align-items:center;gap:2.4mm;
  width:100%;white-space:nowrap;overflow:visible;flex:0 0 auto;
  font-size:10.5pt;font-weight:400;line-height:1.25;
}
.chk-row.center{justify-content:center;margin:0 0 0.8mm}
.chk-row.pay{margin:0.25mm 0 0}
.chk-row.tech{flex-wrap:wrap;overflow:visible;white-space:normal;gap:1.5mm 3mm;margin:0 0 0.6mm}
.chk-lab{flex:0 0 auto;font-weight:500;white-space:nowrap}
.chk-item{
  display:inline-flex;flex:0 0 auto;align-items:center;
  white-space:nowrap;word-break:keep-all;overflow-wrap:normal;
  font-weight:400;
}
.chk{display:inline-block;width:1.15em;flex:0 0 auto;font-weight:400}
.cp-grid{
  display:grid;grid-template-columns:1fr 1fr;column-gap:5mm;row-gap:0;
  width:100%;margin:0 0 0.6mm;padding:0 0 0.6mm;
  border-bottom:0.3mm solid #000;flex:0 0 auto;
}
.cp-field{display:flex;gap:1.2mm;align-items:baseline;min-width:0;line-height:1.25;margin:0}
.cp-lbl{flex:0 0 22mm;width:22mm;font-size:10.5pt;font-weight:500;white-space:nowrap}
.cp-val{flex:1 1 auto;font-size:10.5pt;font-weight:400;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.cp-field-tech .cp-val{overflow:visible}
.cp-sec{font-size:10.5pt;font-weight:500;margin:0 0 0.2mm;flex:0 0 auto}
.cp-block,.cp-notes-block,.cp-mat-block{
  width:100%;margin:0;padding:0.25mm 0 0.4mm;
  border-bottom:0.3mm solid #000;flex:0 0 auto;
}
.cp-text{font-size:10.5pt;font-weight:400;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.35}
.cp-mat-header,.cp-mat-row{
  display:grid;grid-template-columns:9mm minmax(0,1fr) 16mm;
  column-gap:2mm;width:100%;align-items:center;
}
.cp-mat-header{font-size:10.5pt;font-weight:500;border-bottom:0.18mm dotted #888;padding:0.2mm 0 0.4mm}
.cp-mat-row{font-size:10.5pt;font-weight:400;padding:0.2mm 0;border-bottom:0.12mm dotted #999;min-height:4.2mm}
.cp-mat-no{text-align:center}
.cp-mat-name{text-align:left;overflow-wrap:anywhere;word-break:break-word}
.cp-mat-qty{text-align:center;white-space:nowrap}
.cp-fee-block{width:100%;margin:0;padding:0.3mm 0 0.2mm;border-bottom:0.3mm solid #000;flex:0 0 auto}
.cp-fee-split{display:grid;grid-template-columns:1.2fr 0.8fr;column-gap:5mm;margin-top:0.3mm}
.cp-amt{font-size:10.5pt;font-weight:400;white-space:nowrap}
.cp-cust-space{min-height:4mm;font-size:10.5pt;font-weight:400}
.cp-sigs{
  display:grid;grid-template-columns:1fr 1fr;column-gap:10mm;
  width:100%;margin-top:1mm;padding-top:0;flex:0 0 auto;
}
.cp-sig-title{font-size:10.5pt;font-weight:500}
.cp-sig-space{height:9mm;min-height:9mm;width:100%}
.cp-sig-line{width:100%;max-width:80mm;border-bottom:0.3mm solid #000;height:0}
.cp-sig-date{font-size:9.5pt;font-weight:400;margin-top:0.5mm}
@media print{
  html,body{width:${W}mm;background:#fff}
  .no-print{display:none!important}
  nav,header,footer,button{display:none!important}
}
@media screen{
  body{background:#e8e8e8}
  .dot-matrix-page{outline:0.2mm solid #bbb;margin:0 auto 8mm;background:#fff}
}
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

function buildDotMatrixMaterialSlice(equipment: EquipmentRow[], start: number, end: number): string {
  const numbered = equipment.slice(start, end).map((it, i) => {
    const qtyDisplay = it.quantity != null && String(it.quantity).trim() !== "" ? String(it.quantity) : "";
    const remark = equipmentRemark(it);
    const spec = equipmentSpec(it);
    const cat = displayQuoteItemCategory(it);
    const nameCore = remark ? `${spec}（${remark}）` : spec;
    const name = cat && cat !== "—" ? `${cat}｜${nameCore}` : nameCore;
    return `<div class="cp-mat-row" data-mat-index="${start + i + 1}">
      <div class="cp-mat-no">${start + i + 1}</div>
      <div class="cp-mat-name">${esc(name)}</div>
      <div class="cp-mat-qty">${esc(qtyDisplay)}</div>
    </div>`;
  }).join("");
  return `<div class="cp-mat-header"><div class="cp-mat-no">項次</div><div class="cp-mat-name">品項名稱</div><div class="cp-mat-qty">數量</div></div>
    <div class="cp-mat-list">${numbered}</div>`;
}

function buildDotMatrixWorkOrderHtml(
  order: any,
  woNum: string,
  printDate: string,
  equipment: EquipmentRow[],
  techResolved: { names: string; primary: string; extra: string },
  phoneDisplay: string,
  woNotes: string,
  calibration: PrintCalibration,
): string {
  const descText = (order.description && String(order.description).trim()) || "—";
  const { notesText: notesBody, salesRep } = splitSalesRepFromNotes(woNotes, order);
  const notesText = (notesBody && notesBody.trim()) || "—";
  const custNotes = esc(order.billingNotes || order.billing?.notes || "");
  const pages = paginateDotMatrixMaterials(equipment.length);
  const totalPages = pages.length;

  const headerFull = `
  <div class="cp-title">晟風空調工程｜派工單</div>
  <div class="chk-row center">${jobTypeCheckRowDense(order)}</div>
  <div class="cp-grid">
    <div class="cp-col">
      <div class="cp-field"><span class="cp-lbl">案件編號：</span><span class="cp-val">${esc(woNum)}</span></div>
      <div class="cp-field"><span class="cp-lbl">客戶：</span><span class="cp-val">${dash(order.customerName)}</span></div>
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
  <div class="chk-row tech"><span class="chk-lab">施工師傅：</span>${techCheckRowDense(order)}　　<span class="chk-lab">主要負責人：</span><span class="cp-val">${esc(techResolved.primary || "________")}</span></div>
  <section class="cp-block">
    <h2 class="cp-sec">施工內容：</h2>
    <div class="cp-text">${esc(descText)}</div>
  </section>`;

  const headerContinue = `
  <div class="cp-title">晟風空調工程｜派工單</div>
  <div class="cp-cont">案件編號：${esc(woNum)}　（續頁）</div>`;

  const footer = `
  <section class="cp-notes-block">
    <h2 class="cp-sec">備註：</h2>
    <div class="cp-text">${esc(notesText)}</div>
  </section>
  <section class="cp-fee-block">
    <h2 class="cp-sec">工程收費：</h2>
    <div class="chk-row pay"><span class="chk-lab">收款方式：</span>${paymentCheckRowDense(order)}</div>
    <div class="chk-row pay"><span class="chk-lab">收款狀態：</span>${paymentStatusCheckRowDense(order)}</div>
    <div class="cp-fee-split">
      <div class="cp-amt">${billingAmountRow(order)}</div>
      <div>
        <h2 class="cp-sec">客戶備註：</h2>
        <div class="cp-cust-space">${custNotes}</div>
      </div>
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
  </div>`;

  const pageHtml = pages.map((pg, idx) => {
    const showFullHeader = pg.kind === "single" || pg.kind === "first";
    const showFooter = pg.kind === "single" || pg.kind === "last";
    const mat = `<section class="cp-mat-block" data-mat-count="${pg.end - pg.start}" data-page="${idx + 1}/${totalPages}">
    <h2 class="cp-sec">材料／設備${totalPages > 1 ? `（${idx + 1}/${totalPages}）` : ""}</h2>
    ${buildDotMatrixMaterialSlice(equipment, pg.start, pg.end)}
  </section>`;
    return `<div class="dot-matrix-page" data-page="${idx + 1}" data-total="${totalPages}">
  ${showFullHeader ? headerFull : headerContinue}
  ${mat}
  ${showFooter ? footer : ""}
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${esc(woNum)}</title>
${printFontLinksHtml()}
<style>
${buildDotMatrix24x13Css(calibration)}
</style>
</head>
<body>
${pageHtml}
</body>
</html>`;
}

export function buildWorkOrderHtml(order: any, options: WorkOrderHtmlOptions = {}): string {
  const mode: WorkOrderHtmlMode = options.mode ?? "digital";
  const calibration: PrintCalibration = options.calibration ?? PRINT_CALIBRATION_DEFAULT;
  const woNum = order.workOrderNumber || `WO-${String(order.id).padStart(4, "0")}`;
  const printDate = new Date().toLocaleDateString("zh-TW");
  const techResolved = printTech(order);

  const equipment = resolveEquipmentItems(order);
  const itemRows = buildMaterialRows(equipment);
  if (mode === "a4-landscape") return buildA4LandscapeWorkOrder(order, woNum, printDate, equipment, itemRows, techResolved);
  if (mode === "thermal-80" || mode === "thermal-58") return buildThermalWorkOrder(order, woNum, printDate, equipment, techResolved, mode === "thermal-58" ? 58 : 80);

  const sitePhone = order.mobilePhone || "";
  const companyPhone = order.telephone || "";
  const phoneDisplay = [sitePhone, companyPhone ? `公司 ${companyPhone}` : ""].filter(Boolean).join("　") || "—";
  const woNotes = stripQuotePricingFromNotes(order.notes || "");
  const isContinuousPrint = mode === "continuous-print";

  if (isContinuousPrint) {
    return buildDotMatrixWorkOrderHtml(order, woNum, printDate, equipment, techResolved, phoneDisplay, woNotes, calibration);
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
.co-name{font-size:16px;font-weight:600;line-height:1.4;color:#111}
.co-sub{font-size:12px;font-weight:400;color:#666;line-height:1.4}
.wo-right{text-align:right}
.wo-label{font-size:26px;font-weight:600;color:#111;letter-spacing:2px;line-height:1.2}
.wo-num{font-size:13px;font-weight:500;font-family:monospace;line-height:1.4}
.wo-meta{font-size:13px;font-weight:400;color:#111;margin-top:1px;line-height:1.4}

.grid{
  display:grid;grid-template-columns:1fr 1fr;
  gap:1.2mm 6mm;margin-bottom:2.5mm;
  flex-shrink:0;
}
.field{display:flex;flex-direction:column;gap:0.6mm}
.lbl{font-size:13px;font-weight:500;color:#666;line-height:1.3}
.val{font-size:16px;font-weight:400;color:#111;line-height:1.4}
.full{grid-column:1/-1}

.sec-title{
  color:#111;font-size:16px;font-weight:500;
  background:transparent;border:none;
  padding:0 0 1.2mm;margin:0 0 2mm;
  display:block;width:fit-content;
  border-bottom:2.5px solid ${COLORS.primary};
  letter-spacing:0;line-height:1.3;
}
.eq-title{
  color:#111;font-size:17px;font-weight:500;
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
  font-size:14px;font-weight:500;text-align:center;
  vertical-align:middle;line-height:1.4;
  padding:8px 6px;color:#111;
  font-stretch:100%;letter-spacing:0;transform:none;zoom:normal;
  white-space:nowrap;
}
.eq-table tbody td{
  border:1px solid #ccc;
  vertical-align:middle;font-size:16px;font-weight:400;
  line-height:1.4;padding:8px 6px;color:#111;text-align:center;
  font-stretch:100%;letter-spacing:0;transform:none;zoom:normal;
  overflow:visible;
}
.eq-table tbody tr{page-break-inside:avoid;break-inside:avoid}
.tac{text-align:center}
.tar{text-align:right}
.tal{text-align:left}
.eq-table .col-item{font-size:17px;font-weight:400;text-align:left;word-break:break-word}
.eq-table .col-cat,.eq-table .col-model,.eq-table .col-qty,.eq-table .col-unit{text-align:center;font-weight:400;font-size:16px}
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
  font-size:16px;font-weight:400;white-space:pre-wrap;
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
/* 覆蓋 PRINT_DOC_TYPE_CSS／PRINT_CJK_METRIC_CSS 的 700 字重：字大、筆畫細 */
body,.sheet,.page,.box,.val,.wo-meta,.eq-table,.eq-table tbody td,
.eq-table .col-item,.eq-table .col-cat,.eq-table .col-model,.eq-table .col-qty,.eq-table .col-unit{
  font-weight:400!important;
  font-synthesis:none!important;
  -webkit-text-stroke:0!important;
  text-shadow:none!important;
  transform:none!important;
}
.lbl,.sec-title,.eq-title,.eq-table .head-row th,.sig{font-weight:500!important}
.co-name,.wo-label{font-weight:600!important}
.section-flex .box{font-size:16px!important;font-weight:400!important}
.section-flex-notes .box{font-size:15px!important;font-weight:400!important}
.eq-table .head-row th,.eq-table tbody td{padding:8px 6px!important}
.eq-table .head-row th{font-size:14px!important;font-weight:500!important}
.eq-table tbody td,.eq-table .col-cat,.eq-table .col-model,.eq-table .col-qty,.eq-table .col-unit{font-size:16px!important;font-weight:400!important}
.eq-table .col-item{font-size:17px!important;font-weight:400!important}
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
      <div class="wo-meta" style="font-weight:400">${jobTypeCheckRow(order)}</div>
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
    <div class="field full f-tech"><span class="lbl">施工師傅</span><span class="val">${techCheckRow(order)}</span></div>
    <div class="field f-primary"><span class="lbl">主要負責人</span><span class="val">${esc(techResolved.primary || "________")}</span></div>
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

  <div class="section section-flex">
    <div class="sec-title">工程收費</div>
    <div class="box">收款方式：${paymentCheckRow(order)}
收款狀態：${paymentStatusCheckRow(order)}
${billingAmountRow(order)}</div>
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

function formatPrintBillingLine(order: any): string {
  const billing = order.billing || {};
  const total = Number(billing.totalAmount ?? order.billingTotalAmount ?? 0) || 0;
  const received = Number(billing.receivedAmount ?? 0) || 0;
  const remain = remainingBalance(total, received);
  const status = deriveWoPaymentStatus({
    noCharge: Boolean(order.noCharge),
    totalAmount: total,
    receivedAmount: received,
    storedStatus: billing.paymentStatus,
  });
  const invoice = order.invoiceStatus || billing.invoiceStatus || "";
  const parts = [`收款狀態：${status}`];
  if (total > 0) parts.push(`應收 ${total.toLocaleString("zh-TW")}　已收 ${received.toLocaleString("zh-TW")}　餘額 ${remain.toLocaleString("zh-TW")}`);
  if (invoice) parts.push(`發票：${invoice}`);
  return parts.join("　");
}

function a4MaterialRows(equipment: EquipmentRow[]): string {
  if (equipment.length === 0) {
    return `<tr><td class="tac">1</td><td></td><td></td><td class="tac"></td><td class="tac"></td></tr>`;
  }
  return equipment.map((it, i) => {
    const spec = [it.model, it.brand].filter(Boolean).join(" ");
    return `<tr>
      <td class="tac">${i + 1}</td>
      <td>${esc(equipmentName(it))}</td>
      <td>${esc(spec)}</td>
      <td class="tac">${it.quantity ?? ""}</td>
      <td class="tac">${esc(it.unit || "")}</td>
    </tr>`;
  }).join("");
}

function buildA4LandscapeWorkOrder(
  order: any,
  woNum: string,
  printDate: string,
  equipment: EquipmentRow[],
  _itemRows: string,
  techResolved: { names: string; primary: string; extra: string },
): string {
  const sitePhone = order.mobilePhone || "";
  const companyPhone = order.telephone || "";
  const phoneDisplay = [sitePhone, companyPhone ? `公司 ${companyPhone}` : ""].filter(Boolean).join("　") || "—";
  const woNotes = stripQuotePricingFromNotes(order.notes || "");
  const { notesText, salesRep } = splitSalesRepFromNotes(woNotes, order);
  const extraLine = techResolved.extra ? `${chkBox(true)}其他：${esc(techResolved.extra)}` : `${chkBox(false)}其他：______`;
  const techChecks = (techResolved.names ? techResolved.names.split("、").filter(Boolean) : [])
    .filter((n) => n !== techResolved.extra)
    .map((n) => `${chkBox(true)}${esc(n)}`)
    .concat(extraLine)
    .join("　");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${esc(woNum)}</title>
${printFontLinksHtml()}
<style>
@page{size:A4 landscape;margin:10mm 12mm}
html,body{margin:0;padding:0;background:#fff;color:#000}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body,.sheet,.page{
  font-family:${PRINT_CJK_FONT_STACK};
  font-size:13pt;font-weight:400;line-height:1.45;color:#000;background:#fff;
  transform:none;zoom:normal;font-synthesis:none;-webkit-text-stroke:0;text-shadow:none;
}
.sheet{width:100%}
.page{width:100%}
.no-print{display:none!important}
h1{font-size:22pt;font-weight:600;text-align:center;margin:0 0 2mm;letter-spacing:.4mm}
.types{text-align:center;font-size:14pt;font-weight:400;margin:0 0 3mm}
.chk{display:inline-block;width:1.2em;font-weight:400}
.chk.on{font-weight:400}
.meta{display:flex;justify-content:space-between;font-size:14pt;font-weight:400;margin:0 0 2.5mm;border-bottom:.3pt solid #000;padding-bottom:1.5mm}
.grid{display:grid;grid-template-columns:1fr 1fr;column-gap:8mm;row-gap:1.2mm;margin-bottom:3mm}
.field{display:flex;gap:2mm;align-items:baseline;min-width:0;font-size:14pt}
.lbl{flex:0 0 26mm;font-weight:500;white-space:nowrap}
.val{flex:1;font-weight:400;min-width:0;word-break:break-word}
.sec{font-size:14pt;font-weight:500;margin:2.5mm 0 1mm;border-bottom:.35pt solid #222;padding-bottom:.6mm}
.body{font-size:14.5pt;font-weight:400;white-space:pre-wrap;min-height:8mm}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14pt;margin:0 0 2mm}
th,td{border:.35pt solid #333;padding:2mm 1.6mm;vertical-align:middle;font-weight:400}
th{font-weight:500;text-align:center;background:#f7f7f7}
.tac{text-align:center}
tr{page-break-inside:avoid;break-inside:avoid}
thead{display:table-header-group}
.fee{display:grid;grid-template-columns:1.2fr .8fr;gap:4mm;margin:2mm 0}
.sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm;margin-top:6mm}
.sig-title{font-weight:500;font-size:12.5pt}
.sig-line{border-bottom:.35pt solid #000;height:14mm;margin-top:2mm}
.muted{font-size:11.5pt;font-weight:400}
@media print{
  nav,header,footer,button,.no-print{display:none!important}
  body{background:#fff}
}
body,.sheet,.page,.val,.body,td,.types,.meta{
  font-weight:400!important;
  font-synthesis:none!important;
  -webkit-text-stroke:0!important;
  text-shadow:none!important;
  transform:none!important;
}
.lbl,.sec,.sig-title,th{font-weight:500!important}
h1{font-weight:600!important}
</style>
</head>
<body>
<div class="sheet"><div class="page">
  <h1>晟風空調工程｜派工單</h1>
  <div class="types">${jobTypeCheckRow(order)}</div>
  <div class="meta"><span>案件編號：${esc(woNum)}</span><span>日期：${esc(order.scheduledDate || printDate)}</span></div>
  <div class="grid">
    <div class="field"><span class="lbl">客戶</span><span class="val">${dash(order.customerName)}</span></div>
    <div class="field"><span class="lbl">電話</span><span class="val">${esc(phoneDisplay)}</span></div>
    <div class="field"><span class="lbl">工程名稱</span><span class="val">${dash(order.title)}</span></div>
    <div class="field"><span class="lbl">日期</span><span class="val">${dash(order.scheduledDate || printDate)}</span></div>
    <div class="field"><span class="lbl">現場聯絡人</span><span class="val">${dash(order.contactPerson)}</span></div>
    <div class="field"><span class="lbl">負責業務</span><span class="val">${dash(salesRep)}</span></div>
    <div class="field" style="grid-column:1/-1"><span class="lbl">施工地址</span><span class="val">${dash(order.installAddress)}</span></div>
    <div class="field" style="grid-column:1/-1"><span class="lbl">施工師傅</span><span class="val">${techChecks}<div class="muted">主要負責人：${esc(techResolved.primary || "________")}</div></span></div>
  </div>
  <div class="sec">施工內容</div>
  <div class="body">${esc(order.description || "")}</div>
  <div class="sec">材料／設備</div>
  <table>
    <thead><tr><th style="width:10%">項次</th><th>品項名稱</th><th style="width:24%">規格／型號</th><th style="width:12%">數量</th><th style="width:10%">單位</th></tr></thead>
    <tbody>${a4MaterialRows(equipment)}</tbody>
  </table>
  <div class="sec">備註</div>
  <div class="body">${esc(notesText)}</div>
  <div class="fee">
    <div>
      <div class="sec">工程收費</div>
      <div>收款方式：${paymentCheckRow(order)}</div>
      <div style="margin-top:1mm">收款狀態：${paymentStatusCheckRow(order)}</div>
      <div class="body" style="margin-top:1.5mm">${billingAmountRow(order)}</div>
    </div>
    <div>
      <div class="sec">客戶備註</div>
      <div class="body">${esc(order.billingNotes || order.billing?.notes || "")}</div>
    </div>
  </div>
  <div class="sigs">
    <div><div class="sig-title">客戶簽名</div><div class="sig-line"></div><div class="muted">日期：________</div></div>
    <div><div class="sig-title">技師簽名</div><div class="sig-line"></div><div class="muted">日期：________</div></div>
    <div><div class="sig-title">簽名日期</div><div class="sig-line"></div></div>
  </div>
</div></div>
</body></html>`;
}

function buildThermalWorkOrder(
  order: any,
  woNum: string,
  printDate: string,
  equipment: EquipmentRow[],
  techResolved: { names: string; primary: string; extra: string },
  widthMm: 80 | 58,
): string {
  const fontSize = widthMm === 58 ? "11pt" : "12.5pt";
  const rows = equipment.map((it, i) =>
    `<div>${i + 1}. ${esc(equipmentName(it))}　${it.quantity ?? ""}${esc(it.unit || "")}</div>`
  ).join("");
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>派工單 ${esc(woNum)}</title>
${printFontLinksHtml()}
<style>
@page{size:${widthMm}mm auto;margin:3mm}
html,body{margin:0;padding:0;width:${widthMm}mm;background:#fff;color:#000}
body{font-family:${PRINT_CJK_FONT_STACK};font-size:${fontSize};font-weight:400;line-height:1.4;font-synthesis:none}
h1{font-size:${widthMm === 58 ? "13pt" : "15pt"};font-weight:600;text-align:center;margin:0 0 2mm}
.types,.line{margin:0 0 1.5mm;font-weight:400}
.chk{display:inline-block;width:1.1em}
.sec{font-weight:500;margin:2mm 0 1mm;border-bottom:.3pt solid #000}
</style>
</head>
<body>
<h1>晟風空調工程｜派工單</h1>
<div class="types">${jobTypeCheckRow(order)}</div>
<div class="line">案件：${esc(woNum)}</div>
<div class="line">日期：${esc(order.scheduledDate || printDate)}</div>
<div class="line">客戶：${dash(order.customerName)}</div>
<div class="line">電話：${esc(order.mobilePhone || order.telephone || "—")}</div>
<div class="line">地址：${dash(order.installAddress)}</div>
<div class="line">師傅：${esc(techResolved.names || "—")}${techResolved.primary ? `<br>主要：${esc(techResolved.primary)}` : ""}</div>
<div class="sec">施工內容</div>
<div>${esc(order.description || "")}</div>
<div class="sec">材料</div>
${rows || "<div>（無）</div>"}
<div class="sec">收費</div>
<div>${paymentCheckRow(order)}</div>
<div>${esc(formatPrintBillingLine(order))}</div>
<div class="sec">簽名</div>
<div>客戶：____________</div>
<div>技師：____________</div>
</body></html>`;
}
