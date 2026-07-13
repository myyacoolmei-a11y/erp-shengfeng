import type {
  AiExplanationResult,
  BuyerCalcInput,
  BuyerCalcResult,
  GovernmentBenefitMatch,
  SellerCalcInput,
  SellerCalcResult,
} from "../../../shared/dealCalc/types.ts";
import { UNIVERSAL_DISCLAIMER } from "./governmentBenefits.ts";

function fmt(n: number): string {
  return `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;
}

const AI_DISCLAIMERS = [
  "本解說僅供現場說明參考，不保證核貸、稅額或優惠資格。",
  UNIVERSAL_DISCLAIMER,
];

export function generateBuyerAiExplanation(
  input: BuyerCalcInput,
  result: BuyerCalcResult,
  benefits: GovernmentBenefitMatch[],
): AiExplanationResult {
  const likelyBenefits = benefits.filter(b => b.status === "likely").map(b => b.name);
  const pendingBenefits = benefits.filter(b => b.status === "needs_confirmation").map(b => b.name);

  const simple = [
    `【購屋試算摘要】`,
    `房屋總價 ${fmt(result.propertyPrice)}，建議準備現金約 ${fmt(result.suggestedCash)}。`,
    `頭期款 ${fmt(result.downPayment)}，貸款 ${fmt(result.loanAmount)}。`,
    `每月房貸約 ${fmt(result.monthlyPayment)}（${result.loanTermYears} 年、利率 ${result.annualInterestRate}%）。`,
    likelyBenefits.length ? `可能適用：${likelyBenefits.join("、")}。` : "",
    pendingBenefits.length ? `尚需確認：${pendingBenefits.join("、")}。` : "",
    `下一步：準備收入證明、聯絡銀行預審，並向地政士確認過戶費用。`,
  ].filter(Boolean).join("\n");

  const professional = [
    `購屋成本試算（概算）`,
    `─ 物件總價：${fmt(result.propertyPrice)}`,
    `─ 頭期款：${fmt(result.downPayment)}（貸款成數約 ${result.loanAmount > 0 ? Math.round((result.loanAmount / result.propertyPrice) * 100) : 0}%）`,
    `─ 貸款金額：${fmt(result.loanAmount)}`,
    `─ 月付本息：${fmt(result.monthlyPayment)} / ${result.loanTermYears} 年 @ ${result.annualInterestRate}%`,
    `─ 預估交易成本：${fmt(result.transactionCosts.total)}（含契稅、印花稅、代書等）`,
    `─ 建議準備現金：${fmt(result.suggestedCash)}（含 2 個月房貸緩衝）`,
    ``,
    `政府優惠提示：`,
    benefits.length
      ? benefits.map(b => `• ${b.name}：${b.statusLabel}${b.missingData.length ? `（缺：${b.missingData.join("、")}）` : ""}`).join("\n")
      : "• 尚無匹配項目",
    ``,
    `條件備註：首購=${input.isFirstHome ? "是" : "否"}、自住=${input.isSelfOccupied ? "是" : "否"}、其他房貸=${input.hasOtherMortgage ? "有" : "無"}`,
  ].join("\n");

  const lineReply = [
    `您好，這邊幫您整理購屋試算（概算）：`,
    ``,
    `🏠 房屋總價 ${fmt(result.propertyPrice)}`,
    `💰 建議準備現金約 ${fmt(result.suggestedCash)}`,
    `📋 頭期款 ${fmt(result.downPayment)}，貸款 ${fmt(result.loanAmount)}`,
    `📅 每月房貸約 ${fmt(result.monthlyPayment)}（${result.loanTermYears}年）`,
    likelyBenefits.length ? `\n✅ 可能適用：${likelyBenefits.join("、")}` : "",
    pendingBenefits.length ? `\n❓ 尚需確認：${pendingBenefits.join("、")}` : "",
    `\n⚠️ 以上為概算，實際以銀行與主管機關核定為準。`,
    `如需進一步協助，歡迎回覆或來電討論下一步。`,
  ].filter(Boolean).join("\n");

  return { simple, professional, lineReply, disclaimers: AI_DISCLAIMERS };
}

export function generateSellerAiExplanation(
  input: SellerCalcInput,
  result: SellerCalcResult,
): AiExplanationResult {
  const simple = [
    `【售屋試算摘要】`,
    `出售價格 ${fmt(result.salePrice)}，預估實拿約 ${fmt(result.estimatedNetProceeds)}。`,
    `預估房地合一稅 ${fmt(result.estimatedCapitalGainsTax)}，土地增值稅 ${fmt(result.estimatedLandValueIncrementTax)}。`,
    `貸款清償 ${fmt(result.loanPayoff)}，仲介費 ${fmt(result.agentFee)}，代書費 ${fmt(result.notaryFee)}。`,
    `下一步：向地政士確認稅費，並安排買方貸款對保時程。`,
  ].join("\n");

  const professional = [
    `售屋試算（概算）`,
    `─ 購入價格：${fmt(result.purchasePrice)}`,
    `─ 出售價格：${fmt(result.salePrice)}`,
    `─ 持有 ${result.holdingYears} 年，自住：${input.isSelfOccupied ? "是" : "否"}`,
    `─ 預估房地合一稅：${fmt(result.estimatedCapitalGainsTax)}`,
    `─ 預估土地增值稅：${fmt(result.estimatedLandValueIncrementTax)}`,
    `─ 交易費用：${fmt(result.transactionFees)}`,
    `─ 仲介費：${fmt(result.agentFee)}`,
    `─ 代書費：${fmt(result.notaryFee)}`,
    `─ 貸款清償：${fmt(result.loanPayoff)}`,
    `─ 預估實拿金額：${fmt(result.estimatedNetProceeds)}`,
  ].join("\n");

  const lineReply = [
    `您好，售屋試算整理如下（概算）：`,
    ``,
    `🏠 出售價格 ${fmt(result.salePrice)}`,
    `💵 預估實拿約 ${fmt(result.estimatedNetProceeds)}`,
    `📊 房地合一稅約 ${fmt(result.estimatedCapitalGainsTax)}`,
    `📋 貸款清償 ${fmt(result.loanPayoff)}`,
    `\n⚠️ 實際稅額需依正式資料及主管機關核定。`,
    `歡迎進一步討論出售時程與備件準備。`,
  ].join("\n");

  return { simple, professional, lineReply, disclaimers: AI_DISCLAIMERS };
}
