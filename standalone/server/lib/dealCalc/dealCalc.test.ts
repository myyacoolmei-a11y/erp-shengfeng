import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateBuyerDeal, calcMonthlyPayment } from "./buyerCalculator.ts";
import { calculateSellerDeal } from "./sellerCalculator.ts";

describe("buyerCalculator", () => {
  it("calculates loan from ratio", () => {
    const result = calculateBuyerDeal({
      propertyPrice: 10_000_000,
      loanRatioPercent: 80,
      annualInterestRate: 2,
      loanTermYears: 30,
      isFirstHome: true,
      isSelfOccupied: true,
      hasOtherMortgage: false,
    });
    assert.equal(result.loanAmount, 8_000_000);
    assert.equal(result.downPayment, 2_000_000);
    assert.ok(result.monthlyPayment > 0);
    assert.ok(result.suggestedCash > result.downPayment);
    assert.equal(result.isEstimate, true);
  });

  it("calculates loan from down payment amount", () => {
    const result = calculateBuyerDeal({
      propertyPrice: 10_000_000,
      downPaymentAmount: 3_000_000,
      annualInterestRate: 2,
      loanTermYears: 20,
      isFirstHome: false,
      isSelfOccupied: true,
      hasOtherMortgage: false,
    });
    assert.equal(result.loanAmount, 7_000_000);
    assert.equal(result.downPayment, 3_000_000);
  });

  it("monthly payment is zero for zero loan", () => {
    assert.equal(calcMonthlyPayment(0, 2, 30), 0);
  });
});

describe("sellerCalculator", () => {
  it("estimates net proceeds after deductions", () => {
    const result = calculateSellerDeal({
      purchasePrice: 8_000_000,
      salePrice: 12_000_000,
      holdingYears: 5,
      isSelfOccupied: true,
      loanBalance: 3_000_000,
      agentFee: 240_000,
      notaryFee: 15_000,
    });
    assert.ok(result.estimatedCapitalGainsTax > 0);
    assert.ok(result.estimatedLandValueIncrementTax > 0);
    assert.equal(result.loanPayoff, 3_000_000);
    assert.ok(result.estimatedNetProceeds < result.salePrice);
    assert.equal(result.isEstimate, true);
    assert.ok(result.disclaimers[0].includes("概算"));
  });

  it("returns zero tax when no gain", () => {
    const result = calculateSellerDeal({
      purchasePrice: 12_000_000,
      salePrice: 10_000_000,
      holdingYears: 3,
      isSelfOccupied: false,
      loanBalance: 0,
      agentFee: 0,
      notaryFee: 0,
    });
    assert.equal(result.estimatedCapitalGainsTax, 0);
  });
});
