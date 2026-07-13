import { eq, and, desc } from "drizzle-orm";
import {
  db,
  dealCalculationsTable,
  governmentBenefitRulesTable,
  customerTimelineEventsTable,
  dealCalcTasksTable,
  customersTable,
} from "@workspace/db";
import { DEFAULT_TENANT_ID } from "../../../shared/dealCalc/types.ts";
import type {
  BuyerCalcInput,
  SellerCalcInput,
  DealCalcAgentContact,
  AiExplanationResult,
  GovernmentBenefitMatch,
} from "../../../shared/dealCalc/types.ts";
import { calculateBuyerDeal } from "./buyerCalculator.ts";
import { calculateSellerDeal } from "./sellerCalculator.ts";
import {
  DEFAULT_BENEFIT_RULES,
  matchGovernmentBenefits,
  type BenefitRuleSeed,
} from "./governmentBenefits.ts";
import {
  generateBuyerAiExplanation,
  generateSellerAiExplanation,
} from "./aiExplanation.ts";

function parseRulesFromDb(rows: Array<{ conditionsJson: string; code: string; name: string; category: string; description: string; sourceUrl: string; lastUpdated: string; sortOrder: number }>): BenefitRuleSeed[] {
  return rows.map(r => ({
    code: r.code,
    name: r.name,
    category: r.category,
    description: r.description,
    conditions: JSON.parse(r.conditionsJson),
    sourceUrl: r.sourceUrl,
    lastUpdated: r.lastUpdated,
    sortOrder: r.sortOrder,
  }));
}

export async function loadBenefitRules(tenantId = DEFAULT_TENANT_ID): Promise<BenefitRuleSeed[]> {
  const rows = await db
    .select()
    .from(governmentBenefitRulesTable)
    .where(and(eq(governmentBenefitRulesTable.tenantId, tenantId), eq(governmentBenefitRulesTable.enabled, 1)))
    .orderBy(governmentBenefitRulesTable.sortOrder);
  if (rows.length === 0) return DEFAULT_BENEFIT_RULES;
  return parseRulesFromDb(rows);
}

export async function runBuyerCalculation(input: BuyerCalcInput) {
  const result = calculateBuyerDeal(input);
  const rules = await loadBenefitRules();
  const benefits = matchGovernmentBenefits(rules, input);
  const aiExplanation = generateBuyerAiExplanation(input, result, benefits);
  return { result, benefits, aiExplanation };
}

export async function runSellerCalculation(input: SellerCalcInput) {
  const result = calculateSellerDeal(input);
  const aiExplanation = generateSellerAiExplanation(input, result);
  return { result, benefits: [] as GovernmentBenefitMatch[], aiExplanation };
}

export async function saveDealCalculation(opts: {
  tenantId?: number;
  customerId?: number | null;
  calcType: "buyer" | "seller";
  customerName?: string | null;
  input: BuyerCalcInput | SellerCalcInput;
  result: unknown;
  benefits?: GovernmentBenefitMatch[];
  aiExplanation?: AiExplanationResult | null;
  agentContact?: DealCalcAgentContact | null;
  createdByUserId: number;
  createFollowUpTask?: boolean;
}) {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT_ID;

  const [saved] = await db
    .insert(dealCalculationsTable)
    .values({
      tenantId,
      customerId: opts.customerId ?? null,
      calcType: opts.calcType,
      customerName: opts.customerName ?? null,
      inputJson: JSON.stringify(opts.input),
      resultJson: JSON.stringify(opts.result),
      benefitsJson: opts.benefits ? JSON.stringify(opts.benefits) : null,
      aiExplanationJson: opts.aiExplanation ? JSON.stringify(opts.aiExplanation) : null,
      agentContactJson: opts.agentContact ? JSON.stringify(opts.agentContact) : null,
      createdByUserId: opts.createdByUserId,
    })
    .returning();

  if (opts.customerId) {
    const summary =
      opts.calcType === "buyer"
        ? `購屋試算：總價 NT$ ${(opts.result as { propertyPrice: number }).propertyPrice?.toLocaleString()}`
        : `售屋試算：實拿約 NT$ ${(opts.result as { estimatedNetProceeds: number }).estimatedNetProceeds?.toLocaleString()}`;

    await db.insert(customerTimelineEventsTable).values({
      tenantId,
      customerId: opts.customerId,
      eventType: "deal_calculation",
      title: opts.calcType === "buyer" ? "AI 購屋試算" : "AI 售屋試算",
      description: summary,
      refType: "deal_calculation",
      refId: saved.id,
      createdByUserId: opts.createdByUserId,
    });

    if (opts.createFollowUpTask !== false) {
      const due = new Date();
      due.setDate(due.getDate() + 3);
      await db.insert(dealCalcTasksTable).values({
        tenantId,
        customerId: opts.customerId,
        dealCalculationId: saved.id,
        title: opts.calcType === "buyer" ? "追蹤購屋試算 — 確認銀行預審" : "追蹤售屋試算 — 確認稅費與過戶時程",
        dueDate: due.toISOString().slice(0, 10),
        status: "pending",
        createdByUserId: opts.createdByUserId,
      });
    }
  }

  return saved;
}

export async function listDealCalculations(tenantId: number, customerId?: number) {
  const conditions = [eq(dealCalculationsTable.tenantId, tenantId)];
  if (customerId) conditions.push(eq(dealCalculationsTable.customerId, customerId));

  return db
    .select()
    .from(dealCalculationsTable)
    .where(and(...conditions))
    .orderBy(desc(dealCalculationsTable.createdAt))
    .limit(50);
}

export async function getDealCalculationById(id: number, tenantId: number) {
  const [row] = await db
    .select()
    .from(dealCalculationsTable)
    .where(and(eq(dealCalculationsTable.id, id), eq(dealCalculationsTable.tenantId, tenantId)));
  return row ?? null;
}

export async function listCustomerTimeline(customerId: number, tenantId = DEFAULT_TENANT_ID) {
  return db
    .select()
    .from(customerTimelineEventsTable)
    .where(and(eq(customerTimelineEventsTable.customerId, customerId), eq(customerTimelineEventsTable.tenantId, tenantId)))
    .orderBy(desc(customerTimelineEventsTable.createdAt))
    .limit(30);
}

export async function resolveCustomerName(customerId: number): Promise<string | null> {
  const [c] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, customerId));
  return c?.name ?? null;
}
