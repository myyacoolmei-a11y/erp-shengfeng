/**
 * 派工單升級：類型／師傅／收款／列印版型。
 * Run: npx tsx scripts/test-wo-dispatch-upgrade.ts
 */
import {
  resolveJobTypes,
  deriveProjectTypeFromJobTypes,
  resolveTechnicians,
  deriveWoPaymentStatus,
  remainingBalance,
  jobTypeLabels,
  normalizeInvoiceStatus,
} from "../shared/workOrderDispatch.ts";
import { buildWorkOrderHtml } from "../client/src/components/pdf/templates/WorkOrderTemplate.ts";
import { buildDeliveryHtml } from "../client/src/components/pdf/templates/DeliveryTemplate.ts";
import { isSubsidyApplicableForProjectType } from "../shared/subsidyEligibility.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

(globalThis as any).window = { location: { origin: "" } };

const legacyInstall = resolveJobTypes({ projectType: "新裝" });
assert(legacyInstall.types.includes("安裝") && legacyInstall.fromLegacy, "legacy 新裝 → 安裝");
const legacyMove = resolveJobTypes({ projectType: "遷機" });
assert(legacyMove.types.includes("其他") && legacyMove.otherLabel === "遷機", "legacy 遷機 → 其他：遷機");
assert(jobTypeLabels(legacyMove)[0] === "其他：遷機", "legacy other label");
assert(resolveJobTypes({ projectType: "未知種類XYZ" }).types.length === 0, "unknown type not guessed");
assert(resolveJobTypes({ jobTypes: ["安裝", "保養"] }).fromLegacy === false, "new jobTypes not legacy");
assert(deriveProjectTypeFromJobTypes(["安裝", "保養"]) === "新裝", "mixed 安裝+保養 keeps 新裝");
assert(deriveProjectTypeFromJobTypes(["保養"]) === "保養", "only 保養");
assert(deriveProjectTypeFromJobTypes(["送貨／出貨"]) === "送貨／出貨", "delivery project type");
assert(!isSubsidyApplicableForProjectType("送貨／出貨"), "delivery not subsidy");
assert(isSubsidyApplicableForProjectType("新裝"), "install still subsidy-applicable");

const techs = resolveTechnicians({
  technicians: JSON.stringify(["陳弘健", "洪至佑"]),
  assignedTo: "陳弘健",
  primaryTechnician: "陳弘健",
  extraTechnician: "外包王",
});
assert(techs.names.includes("陳弘健") && techs.names.includes("外包王"), "multi tech + extra");
assert(techs.primary === "陳弘健", "primary tech");

assert(deriveWoPaymentStatus({ totalAmount: 10000, receivedAmount: 0 }) === "未收款", "unpaid");
assert(deriveWoPaymentStatus({ totalAmount: 10000, receivedAmount: 3000 }) === "部分收款", "partial");
assert(deriveWoPaymentStatus({ totalAmount: 10000, receivedAmount: 10000 }) === "已收款", "paid");
assert(deriveWoPaymentStatus({ noCharge: true, totalAmount: 0, receivedAmount: 0 }) === "無須收款", "no charge");
assert(remainingBalance(10000, 3000) === 7000, "balance");
assert(normalizeInvoiceStatus("未開立") === "待開立", "legacy invoice");
assert(normalizeInvoiceStatus("已開立") === "已開立", "issued invoice");

const oldWo = { id: 9, workOrderNumber: "WO-OLD", customerName: "舊客戶", projectType: "維修", description: "檢查", notes: "備註" };
const oldHtml = buildWorkOrderHtml(oldWo, { mode: "a4-landscape" });
assert(oldHtml.includes("晟風空調工程｜派工單"), "title kept");
assert(oldHtml.includes("☑") && oldHtml.includes("維修"), "legacy type checkbox");
assert(!oldHtml.includes("undefined"), "old WO no undefined");

const multi = {
  id: 10,
  workOrderNumber: "WO-NEW",
  customerName: "林小姐",
  contactPerson: "現場阿明",
  mobilePhone: "0912345678",
  installAddress: "彰化縣花壇鄉",
  title: "室內機安裝＋保養",
  scheduledDate: "2026-10-13",
  jobTypes: ["安裝", "保養", "其他"],
  jobTypeOther: "清洗濾網",
  technicians: JSON.stringify(["陳弘健", "洪至佑"]),
  assignedTo: "陳弘健",
  primaryTechnician: "陳弘健",
  extraTechnician: "外包王",
  description: "安裝室內機並做保養",
  notes: "負責業務：洪宇風\n請小心磁磚",
  paymentMethods: ["現金", "銀行匯款"],
  billingNotes: "請於完工後收款",
  billing: { totalAmount: 20000, receivedAmount: 5000, paymentStatus: "部分收款", notes: "請於完工後收款", payments: [{ paymentMethod: "銀行匯款", amount: 5000 }] },
  equipmentItems: [
    { itemName: "壁掛分離式", brand: "大金", model: "RX-A", quantity: 1, unit: "台" },
    { itemName: "銅管", quantity: 2, unit: "式" },
    { itemName: "排水管", quantity: 1, unit: "式" },
    { itemName: "架台", quantity: 1, unit: "式" },
    { itemName: "冷媒", quantity: 1, unit: "罐" },
  ],
};

const a4 = buildWorkOrderHtml(multi, { mode: "a4-landscape" });
assert(a4.includes("@page{size:A4 landscape"), "Safari A4 landscape");
assert(a4.includes("font-weight:400"), "body not all-bold");
assert(a4.includes("font-weight:600"), "title 600");
assert(a4.includes("安裝") && a4.includes("保養"), "multi types");
assert(a4.includes("陳弘健") && a4.includes("洪至佑"), "multi techs");
assert(a4.includes("主要負責人"), "primary printed");
assert(a4.includes("現金") && a4.includes("銀行匯款"), "payment methods");
assert(a4.includes("收款狀態") && a4.includes("應收金額"), "payment status + amounts");
assert(a4.includes("施工師傅"), "tech checkbox label");
assert(a4.includes("其他：______") || a4.includes("其他：清洗濾網"), "other type blank or label");
assert(a4.includes("☑陳弘健") || a4.includes("☑") && a4.includes("陳弘健"), "tech names as whole, not split");
assert(!a4.includes("☑陳</span>弘"), "tech checkbox not per-character");
assert(!/font-weight:7\d0/.test(a4.replace(/@font-face\{[\s\S]*?\}/g,"")), "A4 body not 700");
assert(a4.includes("壁掛分離式") && a4.includes("冷媒"), "materials kept");
assert(a4.includes("thead{display:table-header-group}"), "table header repeats");
assert(a4.includes("客戶簽名") && a4.includes("技師簽名"), "signatures kept");

const acceptance = {
  id: 192,
  workOrderNumber: "WO-20261013-0192",
  customerName: "驗收客戶",
  projectType: "新裝",
  assignedTo: "陳弘健",
  assistantTo: "洪至佑",
  description: "安裝室內機",
  notes: "舊工單無新欄位",
  installAddress: "彰化縣花壇鄉",
};
const acceptA4 = buildWorkOrderHtml(acceptance, { mode: "a4-landscape" });
assert(acceptA4.includes("WO-20261013-0192"), "acceptance WO number");
assert(acceptA4.includes("☑") && acceptA4.includes("安裝"), "legacy 新裝 → 安裝 checked");
assert(acceptA4.includes("☐保養") || acceptA4.includes("☐") && acceptA4.includes("保養"), "保養 not guessed");
assert(acceptA4.includes("陳弘健") && acceptA4.includes("洪至佑"), "legacy assigned/assistant as checks");
assert(acceptA4.includes("收款方式") && acceptA4.includes("收款狀態"), "old WO still new print fields");

const digital = buildWorkOrderHtml(multi);
assert(digital.includes("施工師傅"), "digital also uses new tech row");
assert(digital.includes("收款方式"), "digital payment methods");
assert(digital.includes("font-weight:400!important"), "digital override 400");
assert(!digital.includes("transform:scale"), "digital must not scale the sheet");
const digitalOverrideTail = digital.slice(digital.lastIndexOf("覆蓋 PRINT_DOC_TYPE_CSS"));
assert(digitalOverrideTail.includes("font-weight:400!important"), "override after brand CSS");
assert(!digitalOverrideTail.includes("font-weight:700"), "override tail has no 700");

const cp = buildWorkOrderHtml(multi, { mode: "continuous-print" });
assert(cp.includes('data-wo-print="continuous-240x130-v7"'), "v7 template marker loaded");
assert(cp.includes("<!-- wo-continuous-print 240x130 v7 -->"), "html comment fingerprint");
assert(cp.includes("@page{size:240mm 130mm;margin:0}"), "continuous 24x13cm page");
assert(cp.includes("wo13-page") && cp.includes("wo13-paytab") && cp.includes("wo13-chip"), "pay table + chips");
assert(cp.includes("<table class=\"wo13-mat\">"), "materials use real table, not pad column");
assert(cp.includes(">項次<") && cp.includes("品項名稱") && cp.includes("數量"), "material columns aligned");
assert(!cp.includes("cp-mat-pad") && !cp.includes("cp-mat-row") && !cp.includes("dm13-"), "old continuous classes gone");
assert(!cp.includes("wo13-pay-line") && !cp.includes("wo13-opts"), "old pay flex rows gone");
assert(!cp.includes("size:A4 landscape"), "continuous not A4");
assert(!cp.includes("transform:scale"), "continuous must not scale");
assert(!cp.includes("PRINT_DOC_TYPE_CSS") && !cp.includes("eq-table"), "no global print CSS / eq-table");
assert(!cp.includes("printFontLinks") && !cp.includes("NotoSansTC-700"), "no global CJK 700 font face");
assert(!cp.includes("grid-template-columns:1.2fr"), "pay not squeezed next to 客戶備註");
assert(!cp.includes("word-break:break-word") && !cp.includes("overflow-wrap:anywhere"), "no CJK split wrapping");
assert(cp.includes("word-break:keep-all"), "CJK keep-all");
assert(cp.includes("wo13-chip") && cp.includes("flex-shrink:0") && cp.includes("white-space:nowrap"), "chips nowrap no-shrink");
assert(!/\.wo13-chip\{[^}]*flex:\s*1/.test(cp), "chips must not use flex:1");
assert(cp.includes("晟風空調工程｜派工單"), "continuous title");
assert(cp.includes("收款方式：") && cp.includes("&nbsp;匯款"), "print label 匯款, not wrapping 銀行匯款");
assert(!cp.includes("&nbsp;銀行匯款"), "continuous pay chip uses short 匯款");
assert(cp.includes("收款狀態：") && cp.includes("未收款") && cp.includes("部分收款") && cp.includes("無須收款"), "status chips");
assert(cp.includes("應收：") && cp.includes("已收：") && cp.includes("未收："), "amount row short labels");
assert(cp.includes('colspan="2"'), "amount row full width");
assert(cp.includes("font-size:18pt") && cp.includes("font-weight:600"), "title slightly bold 18pt");
assert(cp.includes("font-size:13pt") && cp.includes("font-weight:400"), "body 13pt 400");
assert(cp.includes("wo13-page:last-child"), "last page no forced blank");
assert((cp.match(/class="wo13-page"/g) || []).length === 1, "5 materials fit one 13cm page");
assert(!/font-weight:7\d0/.test(cp.replace(/@font-face\{[\s\S]*?\}/g,"")), "continuous body not 700");
assert(cp.includes("客戶簽名") && cp.includes("技師簽名") && cp.includes("日期"), "signatures not dropped");
const bodyHtml = cp.slice(cp.indexOf("<body>"));
assert(bodyHtml.includes("工程收費"), "工程收費 title kept on left");
assert(bodyHtml.includes("客戶備註：") && bodyHtml.includes("請於完工後收款"), "customer notes kept on right");
assert(bodyHtml.includes("wo13-fee-head") && bodyHtml.includes("wo13-cust"), "title row is left 工程收費 / right 客戶備註");
const feeHead = bodyHtml.slice(bodyHtml.indexOf("wo13-fee-head"), bodyHtml.indexOf("wo13-pay"));
assert(feeHead.includes("工程收費") && feeHead.includes("客戶備註"), "titles live in fee-head only");
assert(!feeHead.includes("收款方式") && !feeHead.includes("wo13-paytab"), "pay rows are NOT inside the two-column head");
assert(bodyHtml.indexOf("wo13-fee-head") < bodyHtml.indexOf('class="wo13-paytab"'), "full-width pay table is sibling below titles");

const acceptCp = buildWorkOrderHtml(acceptance, { mode: "continuous-print" });
assert(acceptCp.includes("WO-20261013-0192"), "acceptance on continuous");
assert(acceptCp.includes('data-wo-print="continuous-240x130-v7"'), "0192 uses v7");
assert(acceptCp.includes("wo13-paytab"), "pay table");
assert((acceptCp.match(/class="wo13-page"/g) || []).length === 1, "0192 single page");
assert(acceptCp.includes("材料／設備：（無）"), "empty materials not padded with blank boxes");

const manyMats = {
  ...multi,
  equipmentItems: Array.from({ length: 16 }, (_, i) => ({ itemName: `材料${i + 1}`, quantity: 1, unit: "式" })),
};
const manyCp = buildWorkOrderHtml(manyMats, { mode: "continuous-print" });
assert((manyCp.match(/class="wo13-page"/g) || []).length >= 2, "overflow continues on next 24x13 page");
assert(manyCp.includes("（續頁）") || manyCp.includes("材料16"), "overflow not clipped");
assert(manyCp.includes("材料16"), "last material kept");
assert(manyCp.includes("wo13-paytab"), "payment stays on last page");

const th80 = buildWorkOrderHtml(multi, { mode: "thermal-80" });
assert(th80.includes("size:80mm auto"), "80mm thermal");
assert(th80.includes("晟風空調工程｜派工單"), "thermal title");
const th58 = buildWorkOrderHtml(multi, { mode: "thermal-58" });
assert(th58.includes("size:58mm auto"), "58mm reserved");

const delivery = buildDeliveryHtml({
  id: 3,
  orderNumber: "WO-202610-0003",
  customerName: "林記",
  customerPhone: "04-111",
  customerAddress: "花壇",
  orderDate: "2026-10-13",
  items: [{ productName: "冷氣", model: "A", qty: 1, unitPrice: 1000, amount: 1000 }],
}, { mode: "a4-landscape" });
assert(delivery.includes("@page{size:A4 landscape"), "delivery A4");
assert(delivery.includes("晟風空調工程｜出貨單"), "delivery title");

if (process.exitCode) console.error("wo dispatch upgrade tests failed");
else console.log("wo dispatch upgrade tests passed");
