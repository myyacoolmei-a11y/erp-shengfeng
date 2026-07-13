/** AI 成交試算中心 — 共用型別 */

export const DEFAULT_TENANT_ID = 1;

export type DealCalcType = "buyer" | "seller";

export type LoanTermYears = 20 | 30 | 40;

export interface BuyerCalcInput {
  propertyPrice: number;
  downPaymentAmount?: number;
  loanRatioPercent?: number;
  annualInterestRate: number;
  loanTermYears: LoanTermYears;
  isFirstHome: boolean;
  isSelfOccupied: boolean;
  hasOtherMortgage: boolean;
  customerName?: string;
  customerId?: number;
}

export interface SellerCalcInput {
  purchasePrice: number;
  salePrice: number;
  holdingYears: number;
  isSelfOccupied: boolean;
  loanBalance: number;
  agentFee: number;
  notaryFee: number;
  customerName?: string;
  customerId?: number;
}

export interface BuyerCalcResult {
  propertyPrice: number;
  downPayment: number;
  loanAmount: number;
  monthlyPayment: number;
  annualInterestRate: number;
  loanTermYears: number;
  transactionCosts: {
    deedTax: number;
    stampTax: number;
    registrationFee: number;
    notaryFee: number;
    agentFee: number;
    total: number;
  };
  suggestedCash: number;
  disclaimers: string[];
  isEstimate: boolean;
}

export interface SellerCalcResult {
  purchasePrice: number;
  salePrice: number;
  holdingYears: number;
  estimatedCapitalGainsTax: number;
  estimatedLandValueIncrementTax: number;
  transactionFees: number;
  agentFee: number;
  notaryFee: number;
  loanPayoff: number;
  estimatedNetProceeds: number;
  disclaimers: string[];
  isEstimate: boolean;
}

export type BenefitMatchStatus = "likely" | "needs_confirmation" | "unlikely";

export interface GovernmentBenefitMatch {
  code: string;
  name: string;
  mainConditions: string;
  status: BenefitMatchStatus;
  statusLabel: string;
  missingData: string[];
  sourceUrl: string;
  lastUpdated: string;
  notes: string;
}

export interface AiExplanationResult {
  simple: string;
  professional: string;
  lineReply: string;
  disclaimers: string[];
}

export interface DealCalcAgentContact {
  name: string;
  phone: string;
  email?: string;
  company?: string;
}

export interface SavedDealCalculation {
  id: number;
  tenantId: number;
  customerId: number | null;
  calcType: DealCalcType;
  customerName: string | null;
  input: BuyerCalcInput | SellerCalcInput;
  result: BuyerCalcResult | SellerCalcResult;
  benefits: GovernmentBenefitMatch[];
  aiExplanation: AiExplanationResult | null;
  agentContact: DealCalcAgentContact | null;
  createdByUserId: number;
  createdAt: string;
}
