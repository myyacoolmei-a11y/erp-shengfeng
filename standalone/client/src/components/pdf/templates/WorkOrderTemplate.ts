// 派工單 Template — digital 24×14cm／A4 橫式／點陣連續紙 240×130／熱感
// 獨立版面：修改此檔不影響其他 Template
// continuous-print：內容盒 240×130mm；@page 維持成功的 size:auto（不寫 landscape／portrait）

import { logoUrl, COMPANY, COLORS, esc, PRINT_DOC_TYPE_CSS, PRINT_CJK_FONT_STACK, PRINT_CJK_METRIC_CSS, printFontLinksHtml } from "./brand-config";
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
   * "continuous-print"：240×130mm 內容盒；@page 維持 size:auto，不鎖定方向。
   */
  mode?: WorkOrderHtmlMode;
  /** 僅 mode==="continuous-print" 時套用：正式列印時的上下左右位置校正（mm）。 */
  calibration?: PrintCalibration;
}

function buildContinuousMaterialName(it: EquipmentRow): string {
  const remark = equipmentRemark(it);
  const spec = equipmentSpec(it);
  const cat = displayQuoteItemCategory(it);
  const nameCore = remark ? `${spec}（${remark}）` : spec;
  return cat && cat !== "—" ? `${cat}｜${nameCore}` : nameCore;
}

function buildContinuousMaterialRows(equipment: EquipmentRow[], start = 0, end = equipment.length): string {
  if (end <= start) {
    return `<tr><td class="n">—</td><td class="name">（無）</td><td class="q"></td></tr>`;
  }
  return equipment.slice(start, end).map((it, i) => {
    const qtyDisplay = it.quantity != null && String(it.quantity).trim() !== ""
      ? String(it.quantity)
      : "";
    return `<tr>
      <td class="n">${start + i + 1}</td>
      <td class="name">${esc(buildContinuousMaterialName(it))}</td>
      <td class="q">${esc(qtyDisplay)}</td>
    </tr>`;
  }).join("");
}

const WO_DOT_W_MM = 240;
const WO_DOT_H_MM = 130;
const WO_DOT_PAD_X_MM = 10;
const WO_DOT_PAD_Y_MM = 4;

/**
 * digital：維持既有 240×140mm。
 * continuous-print：內容盒 240×130mm；@page 維持成功的 size:auto，不鎖定方向。
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

  const offsetXMm = Number.isFinite(calibration?.offsetXMm) ? calibration.offsetXMm : 0;
  const offsetYMm = Number.isFinite(calibration?.offsetYMm) ? calibration.offsetYMm : 0;
  const padTop = WO_DOT_PAD_Y_MM + offsetYMm;
  const padRight = Math.max(0, WO_DOT_PAD_X_MM - offsetXMm);
  const padBottom = Math.max(0, WO_DOT_PAD_Y_MM - offsetYMm);
  const padLeft = WO_DOT_PAD_X_MM + offsetXMm;

  return `
/* 內容盒 240×130mm。@page size:auto — 不覆蓋已成功的列印方向設定。 */
@page{size:auto;margin:0}
html,body{
  box-sizing:border-box;
  width:${WO_DOT_W_MM}mm;
  height:auto;
  margin:0;padding:0;
  background:#fff;
  transform:none;
  zoom:normal;
}
.sheet.dot-matrix-page{
  box-sizing:border-box;
  width:${WO_DOT_W_MM}mm;
  height:${WO_DOT_H_MM}mm;
  padding:${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
  break-inside:avoid;
  page-break-inside:avoid;
  page-break-after:auto;
  break-after:auto;
  position:static;
  overflow:visible;
  transform:none;
  zoom:normal;
  display:block;
}
.sheet.dot-matrix-page + .sheet.dot-matrix-page{
  page-break-before:always;
  break-before:page;
}`;
}

function buildCompactOverridesCss(mode: WorkOrderHtmlMode): string {
  if (mode !== "continuous-print") return "";
  return `
.dot-matrix-page{
  box-sizing:border-box;
  font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;
  font-size:11.5pt;
  font-weight:500;
  line-height:1.12;
  letter-spacing:0;
  color:#000;
  background:#fff;
}
.dot-matrix-page *{
  box-sizing:border-box;
  font-weight:500;
  transform:none;
  zoom:normal;
  box-shadow:none;
  text-shadow:none;
}
.dot-matrix-page .workorder-title{
  font-size:14.5pt;
  font-weight:600;
  line-height:1.1;
  text-align:center;
  margin:0 0 0.4mm;
}
.dot-matrix-page .info-row{
  display:flex;
  align-items:baseline;
  gap:3mm;
  margin:0;
  padding:0;
  min-height:0;
}
.dot-matrix-page .info-field{
  min-width:0;
  flex:1 1 auto;
  font-size:11.5pt;
  font-weight:500;
  line-height:1.12;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.dot-matrix-page .info-field.wide{
  flex:1 1 100%;
  white-space:normal;
  overflow:visible;
  text-overflow:unset;
  word-break:keep-all;
  overflow-wrap:break-word;
}
.dot-matrix-page .print-section{
  margin:0;
  padding:0.3mm 0;
}
.dot-matrix-page .section-title{
  font-size:11.5pt;
  font-weight:500;
  margin:0 0 0.3mm;
}
.dot-matrix-page .work-text{
  font-size:11.5pt;
  font-weight:500;
  line-height:1.12;
  white-space:pre-wrap;
  word-break:keep-all;
  overflow-wrap:break-word;
}
.dot-matrix-page .material-table{
  width:100%;
  border-collapse:collapse;
  table-layout:fixed;
}
.dot-matrix-page .material-table th,
.dot-matrix-page .material-table td{
  padding:0.15mm 1mm;
  font-size:11.5pt;
  font-weight:500;
  line-height:1.12;
  vertical-align:middle;
  overflow-wrap:anywhere;
  border:none;
  border-bottom:0.15mm solid #888;
}
.dot-matrix-page .material-table th{
  text-align:left;
  border-bottom:0.3mm solid #000;
}
.dot-matrix-page .material-table .n,
.dot-matrix-page .material-table th.n{width:12mm;text-align:center;white-space:nowrap}
.dot-matrix-page .material-table .q,
.dot-matrix-page .material-table th.q{width:18mm;text-align:right;white-space:nowrap}
.dot-matrix-page .material-table .name{text-align:left}
.dot-matrix-page .payment-notes{
  display:grid;
  grid-template-columns:1fr 1fr;
  column-gap:4mm;
  width:100%;
  margin-top:0.4mm;
  padding-top:0.4mm;
  border-top:0.3mm solid #000;
}
.dot-matrix-page .payment-row{
  display:flex;
  align-items:center;
  gap:2mm;
  margin:0 0 0.2mm;
  white-space:nowrap;
}
.dot-matrix-page .payment-option{
  display:inline-flex;
  align-items:center;
  gap:1mm;
  flex:0 0 auto;
  white-space:nowrap;
}
.dot-matrix-page .cust-note{
  min-width:0;
  font-size:11.5pt;
  font-weight:500;
  word-break:keep-all;
  overflow-wrap:break-word;
}
.dot-matrix-page .amt-blank{
  display:inline-block;
  min-width:16mm;
  border-bottom:0.25mm solid #000;
  height:3.6mm;
  vertical-align:bottom;
}
.dot-matrix-page .signature-row{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:4mm;
  margin-top:0.8mm;
}
.dot-matrix-page .signature-field{
  min-width:0;
  font-size:11.5pt;
  font-weight:500;
  white-space:nowrap;
}
.dot-matrix-page .sig-line{
  display:inline-block;
  border-bottom:0.25mm solid #000;
  width:28mm;
  height:5.5mm;
  vertical-align:bottom;
  margin:0 1.2mm;
}
.dot-matrix-page .sig-line-sm{
  display:inline-block;
  border-bottom:0.25mm solid #000;
  width:16mm;
  height:5.5mm;
  vertical-align:bottom;
  margin:0 1.2mm;
}
@media print{
  .dot-matrix-page{
    break-inside:avoid;
    page-break-inside:avoid;
  }
  .dot-matrix-page .payment-notes,
  .dot-matrix-page .signature-row{
    break-inside:avoid;
    page-break-inside:avoid;
  }
  .dot-matrix-page .material-table tr{
    break-inside:avoid;
    page-break-inside:avoid;
  }
}
`;
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

function continuousPayFlags(order: Record<string, unknown>): { cash: boolean; remit: boolean } {
  const billing = (order as any).billing || {};
  const resolved = resolvePaymentMethods({
    paymentMethods: order.paymentMethods,
    paymentMethodOther: order.paymentMethodOther as string | null,
    receivablePaymentMethod: billing.paymentMethod,
    paymentRecordMethods: Array.isArray(billing.payments)
      ? billing.payments.map((p: any) => p.paymentMethod)
      : [],
  });
  return {
    cash: resolved.methods.includes("現金"),
    remit: resolved.methods.includes("銀行匯款"),
  };
}

function continuousMoney(n: number): string {
  if (n > 0) return n.toLocaleString("zh-TW");
  return `<span class="amt-blank"></span>`;
}

function estimateWorkMm(desc: string): number {
  const text = (desc || "—").trim() || "—";
  const lines = text.split(/\n/).reduce((n, line) => {
    const chars = Array.from(line).length;
    return n + Math.max(1, Math.ceil(chars / 46));
  }, 0);
  return 4.2 * Math.max(1, lines);
}

function maxMaterialRowsOnContinuousPage(opts: {
  fullHeader: boolean;
  footer: boolean;
  desc: string;
  contact: boolean;
}): number {
  const usable = WO_DOT_H_MM - WO_DOT_PAD_Y_MM * 2;
  let used = 4;
  if (opts.fullHeader) {
    used += 6;
    used += opts.contact ? 22 : 18;
    used += 4 + estimateWorkMm(opts.desc);
  } else {
    used += 8;
  }
  if (opts.footer) used += 16;
  used += 5;
  return Math.max(0, Math.floor((usable - used) / 4.4));
}

type ContinuousPageKind = "single" | "first" | "mid" | "last";

function paginateContinuousContent(
  count: number,
  desc: string,
  contact: boolean,
): Array<{ start: number; end: number; kind: ContinuousPageKind }> {
  const singleRows = maxMaterialRowsOnContinuousPage({
    fullHeader: true, footer: true, desc, contact,
  });
  if (count <= singleRows) return [{ start: 0, end: count, kind: "single" }];

  const pages: Array<{ start: number; end: number; kind: ContinuousPageKind }> = [];
  const firstRows = maxMaterialRowsOnContinuousPage({
    fullHeader: true, footer: false, desc, contact,
  });
  // 全部材料已能放進第一頁時，不要再拆出只有收款／簽名的空白續頁。
  if (count <= firstRows) return [{ start: 0, end: count, kind: "single" }];
  const firstEnd = Math.min(Math.max(firstRows, 0), count);
  pages.push({ start: 0, end: firstEnd, kind: "first" });
  let i = firstEnd;
  const lastRows = maxMaterialRowsOnContinuousPage({
    fullHeader: false, footer: true, desc, contact: false,
  });
  const midRows = maxMaterialRowsOnContinuousPage({
    fullHeader: false, footer: false, desc: "", contact: false,
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

function buildRestoredContinuousWorkOrderHtml(
  order: any,
  woNum: string,
  printDate: string,
  equipment: EquipmentRow[],
  phoneDisplay: string,
  woNotes: string,
  calibration: PrintCalibration,
): string {
  const techResolved = printTech(order);
  const techDisplay = techResolved.names || [order.assignedTo, order.assistantTo].filter(Boolean).join(" / ");
  const descText = (order.description && String(order.description).trim()) || "";
  const { salesRep } = splitSalesRepFromNotes(woNotes, order);
  const contact = String(order.contactPerson || "").trim();
  const custNotes = String(order.billingNotes || order.billing?.notes || "").trim();
  const billing = order.billing || {};
  const total = Number(billing.totalAmount ?? order.billingTotalAmount ?? 0) || 0;
  const received = Number(billing.receivedAmount ?? 0) || 0;
  const pay = continuousPayFlags(order);
  const pages = paginateContinuousContent(equipment.length, descText, Boolean(contact));
  const dateStr = dash(order.scheduledDate || printDate);

  const headerFull = `
  <div class="workorder-title">晟風空調工程｜派工單</div>
  <div class="info-row">
    <div class="info-field">案件編號：${esc(woNum)}</div>
    <div class="info-field">日期：${dateStr}</div>
  </div>
  <div class="info-row">
    <div class="info-field">客戶：${dash(order.customerName)}</div>
    <div class="info-field">電話：${esc(phoneDisplay)}</div>
  </div>
  <div class="info-row">
    <div class="info-field wide">工程名稱：${dash(order.title)}</div>
  </div>
  <div class="info-row">
    <div class="info-field">施工技師：${esc(techDisplay || "—")}</div>
    <div class="info-field">負責業務：${dash(salesRep)}</div>
  </div>
  <div class="info-row">
    <div class="info-field wide">地址：${dash(order.installAddress)}</div>
  </div>
  ${contact ? `<div class="info-row"><div class="info-field wide">現場聯絡人：${esc(contact)}</div></div>` : ""}
  <section class="print-section">
    <div class="section-title">施工內容</div>
    <div class="work-text">${esc(descText || "—")}</div>
  </section>`;

  const headerContinue = `
  <div class="workorder-title">晟風空調工程｜派工單</div>
  <div class="info-row">
    <div class="info-field">案件編號：${esc(woNum)}</div>
    <div class="info-field">（續頁）</div>
  </div>`;

  const footer = `
  <div class="payment-notes">
    <div>
      <div class="payment-row">
        <span>收款方式：</span>
        <span class="payment-option">${pay.cash ? "☑" : "☐"} 現金</span>
        <span class="payment-option">${pay.remit ? "☑" : "☐"} 匯款</span>
      </div>
      <div class="payment-row">
        <span>應收：${continuousMoney(total)}</span>
        <span>已收：${continuousMoney(received)}</span>
      </div>
    </div>
    <div class="cust-note">客戶備註：${custNotes ? esc(custNotes) : ""}</div>
  </div>
  <div class="signature-row">
    <div class="signature-field">客戶簽名<span class="sig-line"></span>日期<span class="sig-line-sm"></span></div>
    <div class="signature-field">技師簽名<span class="sig-line"></span>日期<span class="sig-line-sm"></span></div>
  </div>`;

  const pageHtml = pages.map((pg, idx) => {
    const showFullHeader = pg.kind === "single" || pg.kind === "first";
    const showFooter = pg.kind === "single" || pg.kind === "last";
    const heading = pages.length > 1 ? `材料／設備（${idx + 1}/${pages.length}）` : "材料／設備";
    const showMats = pg.end > pg.start || pg.kind === "single";
    const materials = showMats
      ? `<section class="print-section">
    <div class="section-title">${heading}</div>
    <table class="material-table">
      <colgroup><col class="n"><col><col class="q"></colgroup>
      <thead><tr><th class="n">項次</th><th class="name">品項名稱</th><th class="q">數量</th></tr></thead>
      <tbody>${buildContinuousMaterialRows(equipment, pg.start, pg.end)}</tbody>
    </table>
  </section>`
      : "";
    return `<div class="sheet dot-matrix-page" data-page="${idx + 1}" data-total="${pages.length}">
  ${showFullHeader ? headerFull : headerContinue}
  ${materials}
  ${showFooter ? footer : ""}
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-TW" data-wo-print="continuous-240x130-onesheet">
<head>
<meta charset="UTF-8">
<title>派工單 ${esc(woNum)}</title>
${printFontLinksHtml()}
<style>
*{margin:0;padding:0;box-sizing:border-box}
${buildPageBoxCss("continuous-print", calibration)}
${buildCompactOverridesCss("continuous-print")}
</style>
</head>
<body>
<!-- wo-continuous-print 240x130 onesheet -->
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
    return buildRestoredContinuousWorkOrderHtml(order, woNum, printDate, equipment, phoneDisplay, woNotes, calibration);
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
