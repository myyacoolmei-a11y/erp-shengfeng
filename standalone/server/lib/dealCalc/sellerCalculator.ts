import type { SellerCalcInput, SellerCalcResult } from "../../../shared/dealCalc/types.ts";

const ESTIMATE_DISCLAIMER =
  "目前為概算，實際稅額仍需依正式資料及主管機關核定。";

/** 房地合一稅概算（簡化：依持有年限與自住調整） */
function estimateCapitalGainsTax(
  purchasePrice: number,
  salePrice: number,
  holdingYears: number,
  isSelfOccupied: boolean,
): number {
  const gain = Math.max(0, salePrice - purchasePrice);
  if (gain <= 0) return 0;

  let rate = 0.45;
  if (holdingYears >= 2) rate = 0.35;
  if (holdingYears >= 5) rate = 0.20;
  if (holdingYears >= 10) rate = 0.15;
  if (isSelfOccupied && holdingYears >= 6) rate = 0.10;

  return Math.round(gain * rate);
}

/** 土地增值稅概算（簡化：售價一定比例） */
function estimateLandValueIncrementTax(salePrice: number, holdingYears: number): number {
  const base = salePrice * 0.15;
  const multiplier = holdingYears < 2 ? 1.2 : holdingYears < 5 ? 1.0 : 0.8;
  return Math.round(base * multiplier * 0.2);
}

export function calculateSellerDeal(input: SellerCalcInput): SellerCalcResult {
  const purchase = Math.max(0, input.purchasePrice);
  const sale = Math.max(0, input.salePrice);
  const holdingYears = Math.max(0, input.holdingYears);

  const estimatedCapitalGainsTax = estimateCapitalGainsTax(
    purchase,
    sale,
    holdingYears,
    input.isSelfOccupied,
  );
  const estimatedLandValueIncrementTax = estimateLandValueIncrementTax(sale, holdingYears);
  const transactionFees = 8000;
  const agentFee = Math.max(0, input.agentFee);
  const notaryFee = Math.max(0, input.notaryFee);
  const loanPayoff = Math.max(0, input.loanBalance);

  const totalDeductions =
    estimatedCapitalGainsTax +
    estimatedLandValueIncrementTax +
    transactionFees +
    agentFee +
    notaryFee +
    loanPayoff;

  const estimatedNetProceeds = Math.max(0, sale - totalDeductions);

  return {
    purchasePrice: purchase,
    salePrice: sale,
    holdingYears,
    estimatedCapitalGainsTax,
    estimatedLandValueIncrementTax,
    transactionFees,
    agentFee,
    notaryFee,
    loanPayoff,
    estimatedNetProceeds,
    disclaimers: [ESTIMATE_DISCLAIMER],
    isEstimate: true,
  };
}
