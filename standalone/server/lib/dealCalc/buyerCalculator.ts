import type { BuyerCalcInput, BuyerCalcResult } from "../../../shared/dealCalc/types.ts";

const ESTIMATE_DISCLAIMER =
  "目前為概算，實際稅額、費用與核貸條件仍需依正式資料及主管機關、承貸銀行核定。";

/** 月付本息（等額本息） */
export function calcMonthlyPayment(loanAmount: number, annualRatePercent: number, years: number): number {
  if (loanAmount <= 0) return 0;
  const monthlyRate = annualRatePercent / 100 / 12;
  const months = years * 12;
  if (monthlyRate === 0) return loanAmount / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (loanAmount * monthlyRate * factor) / (factor - 1);
}

export function calculateBuyerDeal(input: BuyerCalcInput): BuyerCalcResult {
  const price = Math.max(0, input.propertyPrice);
  let downPayment = input.downPaymentAmount ?? 0;
  let loanAmount = 0;

  if (input.loanRatioPercent != null && input.loanRatioPercent > 0) {
    loanAmount = Math.round(price * (input.loanRatioPercent / 100));
    downPayment = price - loanAmount;
  } else if (input.downPaymentAmount != null) {
    downPayment = Math.min(price, Math.max(0, input.downPaymentAmount));
    loanAmount = price - downPayment;
  } else {
    downPayment = Math.round(price * 0.2);
    loanAmount = price - downPayment;
  }

  const monthlyPayment = Math.round(calcMonthlyPayment(loanAmount, input.annualInterestRate, input.loanTermYears));

  // 買方概算交易成本（台灣住宅常見費用，簡化）
  const deedTax = Math.round(price * 0.04);
  const stampTax = Math.round(loanAmount * 0.001);
  const registrationFee = 5000;
  const notaryFee = 15000;
  const agentFee = Math.round(price * 0.02);
  const transactionTotal = deedTax + stampTax + registrationFee + notaryFee + agentFee;

  const suggestedCash = downPayment + transactionTotal + Math.round(monthlyPayment * 2);

  return {
    propertyPrice: price,
    downPayment,
    loanAmount,
    monthlyPayment,
    annualInterestRate: input.annualInterestRate,
    loanTermYears: input.loanTermYears,
    transactionCosts: {
      deedTax,
      stampTax,
      registrationFee,
      notaryFee,
      agentFee,
      total: transactionTotal,
    },
    suggestedCash,
    disclaimers: [ESTIMATE_DISCLAIMER],
    isEstimate: true,
  };
}
