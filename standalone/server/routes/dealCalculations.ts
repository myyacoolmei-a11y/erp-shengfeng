import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import {
  runBuyerCalculation,
  runSellerCalculation,
  saveDealCalculation,
  listDealCalculations,
  getDealCalculationById,
  loadBenefitRules,
  listCustomerTimeline,
  resolveCustomerName,
} from "../lib/dealCalc/dealCalcService.ts";
import { DEFAULT_TENANT_ID } from "../../shared/dealCalc/types.ts";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant"] as const;

const BuyerInputSchema = z.object({
  propertyPrice: z.number().positive(),
  downPaymentAmount: z.number().min(0).optional(),
  loanRatioPercent: z.number().min(0).max(100).optional(),
  annualInterestRate: z.number().min(0).max(30),
  loanTermYears: z.union([z.literal(20), z.literal(30), z.literal(40)]),
  isFirstHome: z.boolean(),
  isSelfOccupied: z.boolean(),
  hasOtherMortgage: z.boolean(),
  customerName: z.string().optional(),
  customerId: z.number().int().positive().optional(),
  customerAge: z.number().int().min(18).max(99).optional(),
});

const SellerInputSchema = z.object({
  purchasePrice: z.number().min(0),
  salePrice: z.number().positive(),
  holdingYears: z.number().min(0).max(50),
  isSelfOccupied: z.boolean(),
  loanBalance: z.number().min(0),
  agentFee: z.number().min(0),
  notaryFee: z.number().min(0),
  customerName: z.string().optional(),
  customerId: z.number().int().positive().optional(),
});

const SaveSchema = z.object({
  calcType: z.enum(["buyer", "seller"]),
  customerId: z.number().int().positive().optional().nullable(),
  customerName: z.string().optional().nullable(),
  input: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()),
  benefits: z.array(z.record(z.string(), z.unknown())).optional(),
  aiExplanation: z.record(z.string(), z.unknown()).optional().nullable(),
  agentContact: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().optional(),
    company: z.string().optional(),
  }).optional().nullable(),
  createFollowUpTask: z.boolean().optional(),
});

router.post("/deal-calculations/buyer/calculate", requireRole(...READ_ROLES), async (req, res) => {
  const parsed = BuyerInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let input = parsed.data;
  if (input.customerId && !input.customerName) {
    const name = await resolveCustomerName(input.customerId);
    if (name) input = { ...input, customerName: name };
  }
  res.json(await runBuyerCalculation(input));
});

router.post("/deal-calculations/seller/calculate", requireRole(...READ_ROLES), async (req, res) => {
  const parsed = SellerInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let input = parsed.data;
  if (input.customerId && !input.customerName) {
    const name = await resolveCustomerName(input.customerId);
    if (name) input = { ...input, customerName: name };
  }
  res.json(await runSellerCalculation(input));
});

router.get("/deal-calculations/benefit-rules", requireRole(...READ_ROLES), async (_req, res) => {
  const rules = await loadBenefitRules(DEFAULT_TENANT_ID);
  res.json(rules);
});

router.post("/deal-calculations/benefits/match", requireRole(...READ_ROLES), async (req, res) => {
  const parsed = BuyerInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rules = await loadBenefitRules(DEFAULT_TENANT_ID);
  const { matchGovernmentBenefits } = await import("../lib/dealCalc/governmentBenefits.ts");
  res.json({ benefits: matchGovernmentBenefits(rules, parsed.data) });
});

router.post("/deal-calculations", requireRole(...READ_ROLES), async (req, res) => {
  const parsed = SaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const saved = await saveDealCalculation({
    customerId: parsed.data.customerId ?? null,
    calcType: parsed.data.calcType,
    customerName: parsed.data.customerName ?? null,
    input: parsed.data.input as never,
    result: parsed.data.result,
    benefits: parsed.data.benefits as never,
    aiExplanation: parsed.data.aiExplanation as never,
    agentContact: parsed.data.agentContact ?? null,
    createdByUserId: req.user!.id,
    createFollowUpTask: parsed.data.createFollowUpTask,
  });
  res.status(201).json(saved);
});

router.get("/deal-calculations", requireRole(...READ_ROLES), async (req, res) => {
  const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
  const rows = await listDealCalculations(DEFAULT_TENANT_ID, Number.isFinite(customerId) ? customerId : undefined);
  res.json(rows);
});

router.get("/deal-calculations/:id", requireRole(...READ_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const row = await getDealCalculationById(id, DEFAULT_TENANT_ID);
  if (!row) {
    res.status(404).json({ error: "找不到試算紀錄" });
    return;
  }
  res.json(row);
});

router.get("/customers/:id/timeline", requireRole(...READ_ROLES), async (req, res) => {
  const customerId = Number(req.params.id);
  if (!Number.isFinite(customerId)) {
    res.status(400).json({ error: "Invalid customer id" });
    return;
  }
  res.json(await listCustomerTimeline(customerId));
});

export default router;
