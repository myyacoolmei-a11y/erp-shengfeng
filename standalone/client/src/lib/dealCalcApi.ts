import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  BuyerCalcInput,
  BuyerCalcResult,
  SellerCalcInput,
  SellerCalcResult,
  GovernmentBenefitMatch,
  AiExplanationResult,
  DealCalcAgentContact,
} from "../../../shared/dealCalc/types.ts";

export async function calculateBuyerDeal(input: BuyerCalcInput): Promise<{
  result: BuyerCalcResult;
  benefits: GovernmentBenefitMatch[];
  aiExplanation: AiExplanationResult;
}> {
  return customFetch("/api/deal-calculations/buyer/calculate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function calculateSellerDeal(input: SellerCalcInput): Promise<{
  result: SellerCalcResult;
  benefits: GovernmentBenefitMatch[];
  aiExplanation: AiExplanationResult;
}> {
  return customFetch("/api/deal-calculations/seller/calculate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveDealCalculation(data: {
  calcType: "buyer" | "seller";
  customerId?: number | null;
  customerName?: string | null;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  benefits?: GovernmentBenefitMatch[];
  aiExplanation?: AiExplanationResult | null;
  agentContact?: DealCalcAgentContact | null;
  createFollowUpTask?: boolean;
}) {
  return customFetch("/api/deal-calculations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listDealCalculations(customerId?: number) {
  const q = customerId ? `?customerId=${customerId}` : "";
  return customFetch(`/api/deal-calculations${q}`);
}

export async function listCustomerTimeline(customerId: number) {
  return customFetch<Array<{
    id: number;
    title: string;
    description?: string | null;
    createdAt: string;
    eventType: string;
  }>>(`/api/customers/${customerId}/timeline`);
}

export type {
  BuyerCalcInput,
  BuyerCalcResult,
  SellerCalcInput,
  SellerCalcResult,
  GovernmentBenefitMatch,
  AiExplanationResult,
  DealCalcAgentContact,
};
