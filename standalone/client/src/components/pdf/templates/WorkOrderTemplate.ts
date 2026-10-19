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
   * "continuous-print"：獨立 240mm × 130mm 點陣連續紙 HTML，
   * 不套用 A4／digital／熱感 CSS，不 scale。
   */
  mode?: WorkOrderHtmlMode;
  /** 僅 mode==="continuous-print" 時套用：正式列印時的上下左右位置校正（mm）。 */
  calibration?: PrintCalibration;
}

/**
 * 產生紙張／頁面容器的 CSS。
 * - digital：維持既有 240×140mm。
 * - continuous-print：獨立 240×130mm，見 buildDotMatrix24x13Css。
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

/** 點陣連續紙：寬 24cm × 高 13cm 橫式。不引用 CONTINUOUS_PAPER 的 241.3×139.7。 */
const DOT_MATRIX_WO = {
  WIDTH_MM: 240,
  HEIGHT_MM: 130,
  /** 左右避開拖紙孔 */
  PAD_X_MM: 10,
  /** 上下避開齒孔撕線 */
  PAD_Y_MM: 4,
} as const;

type DotMatrixPageKind = "single" | "first" | "mid" | "last";

/** 估算施工內容佔高（mm）。用字數估行，不用 flex 硬塞。 */
function estimateWorkMm(desc: string): number {
  const text = (desc || "—").trim() || "—";
  const lines = text.split(/\n/).reduce((n, line) => {
    const chars = Array.from(line).length;
    return n + Math.max(1, Math.ceil(chars / 38));
  }, 0);
  return 5.4 * Math.max(1, lines);
}

/**
 * 依實際區塊高度決定每頁材料列數。
 * 內容盒 122mm（130 − 上下各 4）。超出就續頁，不重疊、不裁切。
 */
function maxMaterialRowsOnPage(opts: {
  fullHeader: boolean;
  footer: boolean;
  desc: string;
  notes: boolean;
  contact: boolean;
}): number {
  const USABLE = DOT_MATRIX_WO.HEIGHT_MM - DOT_MATRIX_WO.PAD_Y_MM * 2;
  let used = 0;
  if (opts.fullHeader) {
    used += 8.2;
    used += 6.2;
    used += opts.contact ? 16 : 11.2;
    used += 6.4;
    used += estimateWorkMm(opts.desc);
  } else {
    used += 9;
  }
  if (opts.footer) {
    if (opts.notes) used += 6.2;
    used += 34;
  }
  used += 7.2;
  return Math.max(0, Math.floor((USABLE - used) / 6.1));
}

function paginateDotMatrixContent(
  count: number,
  desc: string,
  notes: boolean,
  contact: boolean,
): Array<{ start: number; end: number; kind: DotMatrixPageKind }> {
  const singleRows = maxMaterialRowsOnPage({
    fullHeader: true, footer: true, desc, notes, contact,
  });
  if (count <= singleRows) return [{ start: 0, end: count, kind: "single" }];

  const pages: Array<{ start: number; end: number; kind: DotMatrixPageKind }> = [];
  const firstRows = maxMaterialRowsOnPage({
    fullHeader: true, footer: false, desc, notes: false, contact,
  });
  const firstEnd = Math.min(Math.max(firstRows, 0), count);
  pages.push({ start: 0, end: firstEnd, kind: "first" });
  let i = firstEnd;
  if (i >= count) {
    pages.push({ start: count, end: count, kind: "last" });
    return pages;
  }
  const lastRows = maxMaterialRowsOnPage({
    fullHeader: false, footer: true, desc, notes, contact,
  });
  const midRows = maxMaterialRowsOnPage({
    fullHeader: false, footer: false, desc, notes: false, contact: false,
  });
  while (i < count) {
    const left = count - i;
    if (left <= lastRows) {
      pages.push({ start: i, end: count, kind: "last" });
      break;
    }
    const take = Math.min(Math.max(midRows, 1), left - Math.max(lastRows, 0));
    pages.push({ start: i, end: i + take, kind: "mid" });
    i += take;
  }
  return pages;
}

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

/**
 * 24×13cm 點陣連續紙獨立樣式。
 * 不引用 A4 CSS、PRINT_DOC_TYPE_CSS、PRINT_CJK_METRIC_CSS，不 scale。
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
/* 自訂紙張原始方向：寬 240mm × 高 130mm。
   不可寫 landscape／portrait（Safari 不吃 @page size；關鍵字會把寬高對調）。
   Safari 請在對話框維持「直立」，紙張選 240×130mm。 */
@page{size:${W}mm ${H}mm;margin:0}
html,body{
  width:${W}mm;height:auto;margin:0;padding:0;background:#fff;color:#000;
  font-family:"PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif;
  font-size:13pt;font-weight:400;line-height:1.12;
  font-synthesis:none;-webkit-font-smoothing:antialiased;
  transform:none;zoom:normal;
}
*{
  box-sizing:border-box;font-weight:400;text-shadow:none;-webkit-text-stroke:0;
  box-shadow:none;transform:none;zoom:normal;
  word-break:keep-all;overflow-wrap:normal;
}
.wo13-bar{display:none}
.wo13-page{
  width:${W}mm;height:${H}mm;max-height:${H}mm;
  padding:${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
  display:block;
  background:#fff;color:#000;
  page-break-after:auto;break-after:auto;
  page-break-inside:avoid;break-inside:avoid;
  overflow:visible;position:relative;
}
.wo13-page + .wo13-page{page-break-before:always;break-before:page}
.wo13-ver{display:none}
.wo13-head{
  display:flex;flex-direction:row;align-items:baseline;justify-content:space-between;
  gap:4mm;margin:0 0 0.5mm;padding:0 0 0.5mm;
  border-bottom:0.45mm solid #000;flex:none;
}
.wo13-title{font-size:18pt;font-weight:600;letter-spacing:0.2mm;line-height:1.1;white-space:nowrap}
.wo13-meta{font-size:13pt;font-weight:400;white-space:nowrap}
.wo13-types{
  display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;
  gap:2.8mm;margin:0 0 0.6mm;font-size:13pt;white-space:nowrap;flex:none;
}
.wo13-opt{
  display:inline-flex;flex:none;flex-direction:row;align-items:center;gap:0.7mm;
  white-space:nowrap;word-break:keep-all;overflow-wrap:normal;font-weight:400;
}
.wo13-opt .box{flex:none;line-height:1}
.wo13-info{
  width:100%;border-collapse:collapse;table-layout:auto;
  margin:0 0 0.6mm;font-size:13pt;flex:none;
}
.wo13-info th,.wo13-info td{
  font-weight:400;vertical-align:baseline;padding:0.2mm 2.2mm 0.2mm 0;
  border:none;
}
.wo13-info th{white-space:nowrap;width:1%;text-align:left}
.wo13-info td{word-break:keep-all;overflow-wrap:break-word}
.wo13-techline{
  display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;
  gap:1mm 2.5mm;margin:0 0 1mm;font-size:13pt;flex:none;
}
.wo13-k{white-space:nowrap;font-weight:400}
.wo13-work{
  display:flex;flex-direction:row;align-items:flex-start;gap:1.6mm;
  margin:0 0 0.6mm;font-size:13pt;flex:none;
}
.wo13-work .txt{
  flex:1 1 auto;min-width:0;font-weight:400;
  white-space:pre-wrap;word-break:keep-all;overflow-wrap:break-word;
}
.wo13-sec{
  font-size:13pt;font-weight:400;margin:0 0 0.3mm;white-space:nowrap;flex:none;
}
.wo13-mat-wrap{display:block;width:100%;margin:0 0 0.5mm}
.wo13-mat{
  width:100%;border-collapse:collapse;table-layout:fixed;font-size:13pt;
}
.wo13-mat th,.wo13-mat td{
  font-weight:400;vertical-align:middle;
  padding:0.25mm 1.6mm 0.25mm 0;
  border:none;border-bottom:0.18mm solid #777;
  word-break:keep-all;overflow-wrap:break-word;
}
.wo13-mat th{text-align:left;border-bottom:0.35mm solid #000}
.wo13-mat .n,.wo13-mat th.n{width:14mm;text-align:center;white-space:nowrap}
.wo13-mat .q,.wo13-mat th.q{width:22mm;text-align:right;white-space:nowrap}
.wo13-mat .name{text-align:left}
.wo13-note{margin:0 0 0.6mm;font-size:13pt;flex:none;word-break:keep-all;width:100%}
.wo13-foot{display:block;width:100%;margin:0.6mm 0 0;padding:0.4mm 0 0;border-top:0.45mm solid #000}
.wo13-fee-head{
  display:grid;grid-template-columns:1fr 1fr;column-gap:6mm;align-items:start;
  width:100%;margin:0 0 0.7mm;
}
.wo13-fee-title{white-space:nowrap;font-size:13pt;font-weight:400}
.wo13-cust{
  min-width:0;font-size:13pt;font-weight:400;
  word-break:keep-all;overflow-wrap:break-word;white-space:normal;
  max-height:none;overflow:visible;
}
.wo13-cust .lab{white-space:nowrap;margin-right:1.5mm}
.wo13-pay{
  width:100%;max-width:100%;margin:0;padding:0;flex:none;
  display:block;
}
.wo13-paytab{
  width:100%;max-width:100%;border-collapse:collapse;table-layout:auto;
  font-size:13pt;
}
.wo13-paytab th,.wo13-paytab td{
  font-weight:400;vertical-align:middle;border:none;
  padding:0.35mm 0;white-space:nowrap;word-break:keep-all;overflow-wrap:normal;
  writing-mode:horizontal-tb;text-orientation:mixed;
}
.wo13-paytab th{
  width:1%;text-align:left;padding-right:2.4mm;white-space:nowrap;flex-shrink:0;
}
.wo13-paytab td.opts,.wo13-paytab td.amts{width:99%;white-space:nowrap}
.wo13-chip{
  display:inline-block;white-space:nowrap;word-break:keep-all;overflow-wrap:normal;
  flex-shrink:0;flex:none;margin-right:4mm;vertical-align:middle;
  writing-mode:horizontal-tb;
}
.wo13-chip .box{display:inline;flex:none;flex-shrink:0}
.wo13-amt{
  display:inline-block;white-space:nowrap;flex-shrink:0;flex:none;
  margin-right:8mm;vertical-align:middle;
}
.wo13-blank{display:inline-block;min-width:22mm;border-bottom:0.25mm solid #000;height:4.2mm;vertical-align:bottom;flex-shrink:0}
.wo13-sigs{
  display:table;width:100%;table-layout:fixed;
  margin-top:1.2mm;font-size:13pt;white-space:nowrap;
}
.wo13-sig{
  display:table-cell;width:50%;vertical-align:bottom;
}
.wo13-sig .ln{display:inline-block;border-bottom:0.25mm solid #000;width:36mm;height:4.2mm}
.wo13-sig .ln-sm{display:inline-block;border-bottom:0.25mm solid #000;width:20mm;height:4.2mm}
@media print{
  @page{size:${W}mm ${H}mm;margin:0}
  html,body{width:${W}mm;height:auto!important;margin:0!important;padding:0!important;background:#fff}
  .wo13-bar,.wo13-ver{display:none!important}
  .wo13-page{margin:0;outline:none;page-break-after:auto;break-after:auto}
}
@media screen{
  html,body{width:auto;height:auto;background:#cfcfcf}
  body{padding:0 0 12mm}
  .wo13-bar{
    display:flex;align-items:flex-start;justify-content:space-between;gap:8px;
    position:sticky;top:0;z-index:2;
    background:#1f2937;color:#fff;padding:8px 12px;margin:0 0 8mm;
    font:12px/1.45 "PingFang TC","Microsoft JhengHei",sans-serif;
  }
  .wo13-bar-txt{flex:1 1 auto;font-weight:400}
  .wo13-bar-btn{
    flex:none;border:0;background:#f8fafc;color:#111;border-radius:4px;
    padding:6px 12px;font-size:13px;cursor:pointer;white-space:nowrap;
  }
  .wo13-page{
    background:#fff;margin:0 auto 12mm;
    outline:0.4mm solid #333;
  }
  .wo13-ver{
    display:block;position:absolute;top:1mm;right:${padRight}mm;
    font-size:7pt;color:#666;white-space:nowrap;font-weight:400;
  }
}
`;
}

function wo13Opt(on: boolean, label: string): string {
  return `<span class="wo13-opt"><span class="box">${on ? "☑" : "☐"}</span>${label}</span>`;
}

/** 收款勾選：checkbox + 文字同一 inline-block，不可拆行、不可被 flex 壓縮。 */
function wo13Chip(on: boolean, label: string): string {
  return `<span class="wo13-chip"><span class="box">${on ? "☑" : "☐"}</span>&nbsp;${label}</span>`;
}

function wo13JobTypes(order: Record<string, unknown>): string {
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
    return wo13Opt(on, label);
  }).join("");
}

function wo13PayMethods(order: Record<string, unknown>): string {
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
    const raw = m === "其他" && resolved.otherLabel ? `其他：${esc(resolved.otherLabel)}` : m;
    const label = CP_PAY_PRINT_LABEL[raw] || CP_PAY_PRINT_LABEL[m] || raw;
    return wo13Chip(on, label);
  }).join("");
}

function wo13PayStatus(order: Record<string, unknown>): string {
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
    .map((s) => wo13Chip(s === status, s))
    .join("");
}

function wo13Techs(order: Record<string, unknown>): string {
  const t = resolveTechnicians({
    technicians: order.technicians as string | null,
    assignedTo: order.assignedTo as string | null,
    assistantTo: order.assistantTo as string | null,
    primaryTechnician: order.primaryTechnician as string | null,
    extraTechnician: order.extraTechnician as string | null,
  });
  const selected = t.names.filter((n) => n && n !== t.extra);
  const boxes = selected.map((n) => wo13Opt(true, esc(n))).join("");
  const extra = t.extra ? wo13Opt(true, `其他：${esc(t.extra)}`) : wo13Opt(false, "其他：______");
  return `${boxes}${extra}`;
}

function wo13Money(n: number): string {
  if (n > 0) return n.toLocaleString("zh-TW");
  return `<span class="wo13-blank"></span>`;
}

function buildDotMatrixMaterialSlice(
  equipment: EquipmentRow[],
  start: number,
  end: number,
  heading: string,
): string {
  if (end <= start) {
    return `<div class="wo13-sec">${heading}：（無）</div>`;
  }
  const rows = equipment.slice(start, end).map((it, i) => {
    const qtyDisplay = it.quantity != null && String(it.quantity).trim() !== "" ? String(it.quantity) : "";
    const remark = equipmentRemark(it);
    const spec = equipmentSpec(it);
    const cat = displayQuoteItemCategory(it);
    const nameCore = remark ? `${spec}（${remark}）` : spec;
    const name = cat && cat !== "—" ? `${cat}｜${nameCore}` : nameCore;
    return `<tr>
      <td class="n">${start + i + 1}</td>
      <td class="name">${esc(name)}</td>
      <td class="q">${esc(qtyDisplay)}</td>
    </tr>`;
  }).join("");
  return `<div class="wo13-mat-wrap"><div class="wo13-sec">${heading}</div><table class="wo13-mat">
    <colgroup><col class="n"><col><col class="q"></colgroup>
    <thead><tr><th class="n">項次</th><th class="name">品項名稱</th><th class="q">數量</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
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
  const descText = (order.description && String(order.description).trim()) || "";
  const { notesText: notesBody, salesRep } = splitSalesRepFromNotes(woNotes, order);
  const notesText = (notesBody && notesBody.trim()) || "";
  const custNotes = String(order.billingNotes || order.billing?.notes || "").trim();
  const contact = String(order.contactPerson || "").trim();
  const billing = order.billing || {};
  const total = Number(billing.totalAmount ?? order.billingTotalAmount ?? 0) || 0;
  const received = Number(billing.receivedAmount ?? 0) || 0;
  const remain = remainingBalance(total, received);
  const invoice = String(order.invoiceStatus || billing.invoiceStatus || "").trim();
  const pages = paginateDotMatrixContent(equipment.length, descText, Boolean(notesText), Boolean(contact));
  const totalPages = pages.length;
  const dateStr = dash(order.scheduledDate || printDate);

  const headerFull = `
  <div class="wo13-head">
    <div class="wo13-title">晟風空調工程｜派工單</div>
    <div class="wo13-meta">案件編號：${esc(woNum)}　日期：${dateStr}</div>
  </div>
  <div class="wo13-types">${wo13JobTypes(order)}</div>
  <table class="wo13-info">
    <tr>
      <th>客戶</th><td>${dash(order.customerName)}</td>
      <th>電話</th><td>${esc(phoneDisplay)}</td>
      <th>負責業務</th><td>${dash(salesRep)}</td>
    </tr>
    <tr>
      <th>地址</th><td colspan="3">${dash(order.installAddress)}</td>
      <th>工程名稱</th><td>${dash(order.title)}</td>
    </tr>
    ${contact ? `<tr><th>現場聯絡</th><td colspan="5">${esc(contact)}</td></tr>` : ""}
  </table>
  <div class="wo13-techline">
    <span class="wo13-k">施工師傅</span>${wo13Techs(order)}
    <span class="wo13-k">主要負責人</span><span>${esc(techResolved.primary || "________")}</span>
  </div>
  <div class="wo13-work"><span class="wo13-k">施工內容</span><span class="txt">${esc(descText || "—")}</span></div>`;

  const headerContinue = `
  <div class="wo13-head">
    <div class="wo13-title">晟風空調工程｜派工單</div>
    <div class="wo13-meta">案件編號：${esc(woNum)}　（續頁）</div>
  </div>`;

  const notesLine = notesText
    ? `<div class="wo13-note">備註：${esc(notesText)}</div>`
    : "";

  const footer = `
  ${notesLine}
  ${invoice ? `<div class="wo13-note">發票：${esc(invoice)}</div>` : ""}
  <div class="wo13-foot">
    <div class="wo13-fee-head">
      <div class="wo13-fee-title">工程收費</div>
      <div class="wo13-cust"><span class="lab">客戶備註：</span>${custNotes ? esc(custNotes) : ""}</div>
    </div>
    <div class="wo13-pay">
      <table class="wo13-paytab">
        <tr>
          <th>收款方式：</th>
          <td class="opts">${wo13PayMethods(order)}</td>
        </tr>
        <tr>
          <th>收款狀態：</th>
          <td class="opts">${wo13PayStatus(order)}</td>
        </tr>
        <tr>
          <td class="amts" colspan="2">
            <span class="wo13-amt">應收：${wo13Money(total)}</span>
            <span class="wo13-amt">已收：${wo13Money(received)}</span>
            <span class="wo13-amt">未收：${wo13Money(remain)}</span>
          </td>
        </tr>
      </table>
    </div>
    <div class="wo13-sigs">
      <div class="wo13-sig"><span>客戶簽名</span><span class="ln"></span><span>日期</span><span class="ln-sm"></span></div>
      <div class="wo13-sig"><span>技師簽名</span><span class="ln"></span><span>日期</span><span class="ln-sm"></span></div>
    </div>
  </div>`;

  const pageHtml = pages.map((pg, idx) => {
    const showFullHeader = pg.kind === "single" || pg.kind === "first";
    const showFooter = pg.kind === "single" || pg.kind === "last";
    const heading = totalPages > 1 ? `材料／設備（${idx + 1}/${totalPages}）` : "材料／設備";
    const materialsHtml = (pg.end > pg.start || pg.kind === "single")
      ? buildDotMatrixMaterialSlice(equipment, pg.start, pg.end, heading)
      : "";
    return `<div class="wo13-page" data-page="${idx + 1}" data-total="${totalPages}">
  <div class="wo13-ver">continuous-240x130-v10</div>
  ${showFullHeader ? headerFull : headerContinue}
  ${materialsHtml}
  ${showFooter ? footer : ""}
</div>`;
  }).join("\n");

  const toolbar = `
<div class="wo13-bar" data-wo-print-bar>
  <div class="wo13-bar-txt">
    點陣連續紙 <b>寬 240mm × 高 130mm</b>　共 <b>${totalPages}</b> 頁　
    Safari：方向維持<strong>直立</strong>。紙張選自訂「寬 240mm、高 130mm」（不要選 A4，不要改橫向）。縮放 100%。關閉頁首／頁尾。邊界無。若標題左右偏移，請把 ERP「列印校正」歸零。
  </div>
  <button type="button" class="wo13-bar-btn" onclick="window.print()">列印</button>
</div>`;

  return `<!DOCTYPE html>
<html lang="zh-TW" data-wo-print="continuous-240x130-v10">
<head>
<meta charset="UTF-8">
<title>派工單 ${esc(woNum)}</title>
<style>
${buildDotMatrix24x13Css(calibration)}
</style>
</head>
<body>
<!-- wo-continuous-print 240x130 v10 -->
${toolbar}
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
