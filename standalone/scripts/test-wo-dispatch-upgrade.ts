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
assert(cp.includes('data-wo-print="continuous-240x130-onesheet"'), "compact 240x130 marker");
assert(cp.includes("<!-- wo-continuous-print 240x130 onesheet -->"), "html comment fingerprint");
assert(cp.includes("@page{size:auto;margin:0}"), "keep successful size:auto");
assert(cp.includes("width:240mm") && cp.includes("height:130mm"), "content box 240×130");
assert(!/@page\{[^}]*landscape/.test(cp), "do not add landscape");
assert(!/@page\{[^}]*portrait/.test(cp), "do not add portrait");
assert(!cp.includes("@page{size:240mm 130mm"), "do not overwrite @page with fixed 240×130");
assert(!cp.includes("wo13-page") && !cp.includes("cp-mat-pad"), "old pad/v10 classes gone");
assert(cp.includes("晟風空調工程｜派工單") && cp.includes("workorder-title"), "centered title");
assert(cp.includes("font-size:11.5pt") && cp.includes("font-weight:500"), "body 11.5pt 500");
assert(cp.includes("font-size:14.5pt") && cp.includes("font-weight:600"), "title 14.5pt 600");
assert(cp.includes("line-height:1.12"), "tight line height");
assert(cp.includes("案件編號：") && cp.includes("日期："), "row 1");
assert(cp.includes("客戶：") && cp.includes("電話："), "row 2");
assert(cp.includes("工程名稱：") && cp.includes("施工技師：") && cp.includes("負責業務："), "name / tech / sales");
assert(cp.includes("地址："), "address row");
assert(cp.includes("施工內容") && cp.includes("<table class=\"material-table\">"), "work + materials table");
assert(cp.includes("收款方式：") && cp.includes("現金") && cp.includes("匯款"), "pay methods");
assert(cp.includes("應收：") && cp.includes("已收："), "amounts");
assert(cp.includes("客戶備註：") && cp.includes("請於完工後收款"), "customer notes on the right");
assert(!cp.includes("工程收費") && !cp.includes("無收費"), "old fee checkboxes removed");
const bodyCp = cp.slice(cp.indexOf("<body>"));
assert(!bodyCp.includes("備註：") || bodyCp.includes("客戶備註："), "left notes block removed");
assert(!bodyCp.includes(">備註<") && !bodyCp.includes("section-title\">備註"), "left 備註 title gone");
assert(cp.includes("客戶簽名") && cp.includes("技師簽名"), "signatures");
assert(cp.includes("☑") && cp.includes("現金") && cp.includes("匯款"), "pay checks from ERP data");
assert(!/transform:\s*scale\(/.test(cp), "continuous must not scale");
assert(!cp.includes("size:A4 landscape"), "continuous not A4");
assert((cp.match(/class="sheet dot-matrix-page"/g) || []).length === 1, "5 materials fit one 240×130 page");

const wo0195 = {
  ...multi,
  id: 195,
  workOrderNumber: "WO-20261015-0195",
  customerName: "驗收客戶",
  installAddress: "彰化縣花壇鄉中山路一段195號",
  scheduledDate: "2026-10-15",
};
const cp0195 = buildWorkOrderHtml(wo0195, { mode: "continuous-print" });
assert(cp0195.includes("WO-20261015-0195"), "0195 number");
assert(cp0195.includes('data-wo-print="continuous-240x130-onesheet"'), "0195 uses compact template");
assert((cp0195.match(/class="sheet dot-matrix-page"/g) || []).length === 1, "0195 single 240×130 page");
assert(cp0195.includes("客戶簽名") && cp0195.includes("技師簽名"), "0195 signatures kept");
assert(cp0195.includes("客戶備註：") && !cp0195.includes("工程收費"), "0195 notes kept, fee title gone");

const acceptCp = buildWorkOrderHtml(acceptance, { mode: "continuous-print" });
assert(acceptCp.includes("WO-20261013-0192"), "acceptance on continuous");
assert(acceptCp.includes('data-wo-print="continuous-240x130-onesheet"'), "0192 uses compact template");
assert((acceptCp.match(/class="sheet dot-matrix-page"/g) || []).length === 1, "0192 single page");
assert(acceptCp.includes("材料／設備"), "empty materials still show section");
assert(!acceptCp.includes("wo13-page"), "acceptance not later v10 layout");

const wo0178 = {
  ...multi,
  id: 178,
  workOrderNumber: "WO-20261006-0178",
  customerName: "連續紙驗收",
  contactPerson: "林先生",
  mobilePhone: "0912-000-178",
  installAddress: "彰化縣花壇鄉中山路一段178號",
  title: "室內機安裝＋銅管配管",
  scheduledDate: "2026-10-06",
  description: "拆除舊機後安裝壁掛室內機，配管沿既有路徑，完工試機。",
  notes: "負責業務：洪宇風\n現場磁磚請鋪布",
  equipmentItems: [
    { itemName: "壁掛分離式", brand: "大金", model: "RX-A", quantity: 1, unit: "台" },
    { itemName: "銅管", quantity: 2, unit: "式" },
    { itemName: "排水管", quantity: 1, unit: "式" },
    { itemName: "架台", quantity: 1, unit: "式" },
    { itemName: "冷媒", quantity: 1, unit: "罐" },
    { itemName: "電源線", quantity: 1, unit: "式" },
    { itemName: "固定螺絲", quantity: 8, unit: "支" },
    { itemName: "隔震墊", quantity: 4, unit: "個" },
  ],
};
const cp0178 = buildWorkOrderHtml(wo0178, { mode: "continuous-print" });
assert(cp0178.includes("WO-20261006-0178"), "0178 number");
assert(cp0178.includes('data-wo-print="continuous-240x130-onesheet"'), "0178 uses compact template");
assert(cp0178.includes("客戶簽名") && cp0178.includes("技師簽名"), "0178 signatures kept");
assert(cp0178.includes("隔震墊"), "0178 last material not dropped");
assert(cp0178.includes("現場聯絡人：林先生"), "0178 contact shown");
assert(!cp0178.includes("現場磁磚請鋪布"), "left 備註 block removed");
assert(cp0178.includes("洪宇風"), "sales rep still printed");
assert((cp0178.match(/class="sheet dot-matrix-page"/g) || []).length === 1, "8 materials still one 240×130 page");

const wo0185 = {
  ...multi,
  id: 185,
  workOrderNumber: "WO-20261012-0185",
  customerName: "花壇林宅",
  contactPerson: "林太太",
  mobilePhone: "0912-000-185",
  installAddress: "彰化縣花壇鄉中山路一段185號",
  title: "室內機安裝＋銅管配管＋室外機移位",
  scheduledDate: "2026-10-12",
  description: "拆除舊機後安裝壁掛室內機兩台，配管沿既有路徑重拉，室外機改掛陽台外側，完工試機並說明濾網清潔。",
  notes: "負責業務：洪宇風",
  billingNotes: "請於完工後收款",
  equipmentItems: [
    { itemName: "壁掛分離式", brand: "大金", model: "RX-A", quantity: 2, unit: "台" },
    { itemName: "銅管", quantity: 2, unit: "式" },
    { itemName: "排水管", quantity: 1, unit: "式" },
    { itemName: "架台", quantity: 1, unit: "式" },
    { itemName: "冷媒", quantity: 1, unit: "罐" },
    { itemName: "電源線", quantity: 1, unit: "式" },
    { itemName: "固定螺絲", quantity: 8, unit: "支" },
    { itemName: "隔震墊", quantity: 4, unit: "個" },
    { itemName: "包布", quantity: 1, unit: "式" },
  ],
};
const cp0185 = buildWorkOrderHtml(wo0185, { mode: "continuous-print" });
assert(cp0185.includes("WO-20261012-0185"), "0185 number");
assert((cp0185.match(/class="sheet dot-matrix-page"/g) || []).length === 1, "0185 nine materials stay on one page");
assert(!cp0185.includes("（續頁）"), "0185 must not create a footer-only continuation");
assert(cp0185.includes("包布") && cp0185.includes("隔震墊") && cp0185.includes("固定螺絲"), "0185 all 9 materials printed");
assert(cp0185.includes("收款方式：") && cp0185.includes("客戶簽名"), "0185 pay and signatures on same page");
assert(cp0185.includes("☑") && cp0185.includes("現金"), "0185 cash checked from ERP");
assert(cp0185.includes("20,000") && cp0185.includes("5,000"), "0185 receivable and received");
assert(cp0185.includes("客戶備註：請於完工後收款"), "0185 customer notes");
assert(!cp0185.includes("工程收費") && !cp0185.includes("無收費"), "0185 old fee gone");

const longWo = {
  ...wo0185,
  workOrderNumber: "WO-LONG",
  description: "拆除舊機後安裝壁掛室內機兩台，配管沿既有路徑重拉並包覆保溫，室外機改掛陽台外側，電源由室內配電箱另拉專用迴路，完工試機、調整冷媒、說明濾網清潔與保固注意事項。".repeat(3),
  equipmentItems: Array.from({ length: 14 }, (_, i) => ({ itemName: `材料${i + 1}`, quantity: 1, unit: "式" })),
};
const longCp = buildWorkOrderHtml(longWo, { mode: "continuous-print" });
assert((longCp.match(/class="sheet dot-matrix-page"/g) || []).length >= 2, "long content continues to next 240×130 page");
assert(longCp.includes("材料14"), "overflow last material kept");
assert(longCp.includes("收款方式：") && longCp.includes("客戶簽名"), "pay and signatures stay on last page");

const manyMats = {
  ...multi,
  equipmentItems: Array.from({ length: 16 }, (_, i) => ({ itemName: `材料${i + 1}`, quantity: 1, unit: "式" })),
};
const manyCp = buildWorkOrderHtml(manyMats, { mode: "continuous-print" });
assert(manyCp.includes("材料16"), "last material kept");
assert(manyCp.includes("收款方式："), "pay block stays");

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
