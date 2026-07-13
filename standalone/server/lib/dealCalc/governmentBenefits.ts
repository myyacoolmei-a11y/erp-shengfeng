import type { GovernmentBenefitMatch, BuyerCalcInput } from "../../../shared/dealCalc/types.ts";

export interface BenefitRuleConditions {
  appliesTo: "buyer" | "seller" | "both";
  requiresFirstHome?: boolean;
  requiresSelfOccupied?: boolean;
  maxAge?: number;
  minLoanTermYears?: number;
  maxPropertyPrice?: number;
  requiresNoOtherMortgage?: boolean;
  holdingYearsMin?: number;
  holdingYearsMax?: number;
  requiredFields?: string[];
}

export interface BenefitRuleSeed {
  code: string;
  name: string;
  category: string;
  description: string;
  conditions: BenefitRuleConditions;
  sourceUrl: string;
  lastUpdated: string;
  sortOrder: number;
}

export const DEFAULT_BENEFIT_RULES: BenefitRuleSeed[] = [
  {
    code: "first_home_buyer",
    name: "首購優惠（自用住宅貸款）",
    category: "首購優惠",
    description: "符合首購資格者，部分銀行提供較寬鬆貸款成數或利率優惠。",
    conditions: {
      appliesTo: "buyer",
      requiresFirstHome: true,
      requiresSelfOccupied: true,
      requiredFields: ["propertyPrice", "loanTermYears"],
    },
    sourceUrl: "https://www.fsc.gov.tw/",
    lastUpdated: "2026-01-15",
    sortOrder: 1,
  },
  {
    code: "youth_housing_loan",
    name: "青年安心成家購屋優惠貸款",
    category: "政策性貸款",
    description: "符合年齡與自用條件之青年，可申請政府協助之優惠貸款方案。",
    conditions: {
      appliesTo: "buyer",
      requiresSelfOccupied: true,
      maxAge: 45,
      requiredFields: ["annualInterestRate", "loanTermYears"],
    },
    sourceUrl: "https://www.cpami.gov.tw/",
    lastUpdated: "2026-01-15",
    sortOrder: 2,
  },
  {
    code: "self_use_tax_relief",
    name: "自住稅務優惠",
    category: "自住稅務優惠",
    description: "自住且符合條件者，房屋稅、地價稅等可能有優惠稅率。",
    conditions: {
      appliesTo: "both",
      requiresSelfOccupied: true,
      requiredFields: [],
    },
    sourceUrl: "https://www.etax.nat.gov.tw/",
    lastUpdated: "2026-01-15",
    sortOrder: 3,
  },
  {
    code: "repurchase_tax_refund",
    name: "重購退稅",
    category: "重購退稅",
    description: "出售自用住宅後二年內重購自用住宅，可能申請退還部分房地合一稅。",
    conditions: {
      appliesTo: "seller",
      requiresSelfOccupied: true,
      holdingYearsMin: 2,
      requiredFields: ["salePrice", "purchasePrice"],
    },
    sourceUrl: "https://www.etax.nat.gov.tw/",
    lastUpdated: "2026-01-15",
    sortOrder: 4,
  },
  {
    code: "local_housing_subsidy",
    name: "地方政府住宅補助",
    category: "地方政府住宅補助",
    description: "各縣市可能有購屋、租屋或修繕補助，需依戶籍與收入條件申請。",
    conditions: {
      appliesTo: "buyer",
      requiredFields: ["customerName"],
    },
    sourceUrl: "https://www.cpami.gov.tw/",
    lastUpdated: "2026-01-15",
    sortOrder: 5,
  },
  {
    code: "policy_mortgage_rate",
    name: "公教／政策性優惠貸款",
    category: "政策性貸款",
    description: "特定身分或職業可能適用較低利率之政策性貸款。",
    conditions: {
      appliesTo: "buyer",
      requiredFields: ["annualInterestRate"],
    },
    sourceUrl: "https://www.hnl.gov.tw/",
    lastUpdated: "2026-01-15",
    sortOrder: 6,
  },
];

const UNIVERSAL_DISCLAIMER =
  "實際資格、利率、額度及期限，以主管機關與承貸銀行最新審核結果為準。";

function statusLabel(status: GovernmentBenefitMatch["status"]): string {
  if (status === "likely") return "可能符合";
  if (status === "needs_confirmation") return "尚需確認";
  return "可能不符";
}

export function matchGovernmentBenefits(
  rules: BenefitRuleSeed[],
  input: BuyerCalcInput & { customerAge?: number },
): GovernmentBenefitMatch[] {
  return rules
    .filter(r => r.conditions.appliesTo === "buyer" || r.conditions.appliesTo === "both")
    .map(rule => {
      const missing: string[] = [];
      const c = rule.conditions;

      if (c.requiresFirstHome && !input.isFirstHome) {
        return makeMatch(rule, "unlikely", ["非首購條件"], missing);
      }
      if (c.requiresSelfOccupied && !input.isSelfOccupied) {
        return makeMatch(rule, "unlikely", ["非自住條件"], missing);
      }
      if (c.requiresNoOtherMortgage && input.hasOtherMortgage) {
        return makeMatch(rule, "unlikely", ["已有其他房貸"], missing);
      }
      if (c.maxAge != null && (input.customerAge == null || input.customerAge > c.maxAge)) {
        if (input.customerAge == null) missing.push("客戶年齡");
        else return makeMatch(rule, "unlikely", [`年齡超過 ${c.maxAge} 歲`], missing);
      }
      if (c.maxPropertyPrice != null && input.propertyPrice > c.maxPropertyPrice) {
        return makeMatch(rule, "unlikely", ["房屋總價超過方案上限"], missing);
      }

      for (const field of c.requiredFields ?? []) {
        if (field === "customerName" && !input.customerName?.trim()) missing.push("客戶姓名");
        if (field === "annualInterestRate" && input.annualInterestRate <= 0) missing.push("利率");
      }

      if (missing.length > 0) {
        return makeMatch(rule, "needs_confirmation", [], missing);
      }

      if (c.requiresFirstHome || c.requiresSelfOccupied) {
        return makeMatch(rule, "likely", [], missing);
      }

      return makeMatch(rule, "needs_confirmation", [], missing);
    });
}

function makeMatch(
  rule: BenefitRuleSeed,
  status: GovernmentBenefitMatch["status"],
  notes: string[],
  missingData: string[],
): GovernmentBenefitMatch {
  return {
    code: rule.code,
    name: rule.name,
    mainConditions: rule.description,
    status,
    statusLabel: statusLabel(status),
    missingData,
    sourceUrl: rule.sourceUrl,
    lastUpdated: rule.lastUpdated,
    notes: [...notes, UNIVERSAL_DISCLAIMER].filter(Boolean).join(" "),
  };
}

export { UNIVERSAL_DISCLAIMER };
