import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";
import {
  applyPlanToCompany,
  getDefaultCompany,
  listCompanyFeatures,
  loadCompanyContext,
  setCompanyFeature,
} from "../lib/companyModuleService";
import { isModuleKey, MODULE_KEYS, MODULE_LABELS, PLAN_PRESETS, PLAN_SALES_TRIAL } from "../../shared/companyModules.ts";

const router: IRouter = Router();
const requireOwner = requireRole("super_admin", "owner");

router.get("/company", async (req, res): Promise<void> => {
  const ctx = await loadCompanyContext(req.user?.companyId ?? null);
  const features = await listCompanyFeatures(ctx.companyId);
  res.json({
    id: ctx.companyId,
    name: ctx.companyName,
    planKey: ctx.planKey,
    planName: PLAN_PRESETS[ctx.planKey]?.name ?? ctx.planKey,
    modules: ctx.companyModules,
    features: features.map((f) => ({
      featureKey: f.featureKey,
      label: MODULE_LABELS[f.featureKey],
      enabled: f.enabled,
    })),
  });
});

router.get("/company/features", async (req, res): Promise<void> => {
  const ctx = await loadCompanyContext(req.user?.companyId ?? null);
  const features = await listCompanyFeatures(ctx.companyId);
  res.json({
    companyId: ctx.companyId,
    planKey: ctx.planKey,
    features: features.map((f) => ({
      featureKey: f.featureKey,
      label: MODULE_LABELS[f.featureKey],
      enabled: f.enabled,
    })),
    catalog: MODULE_KEYS.map((key) => ({ featureKey: key, label: MODULE_LABELS[key] })),
    plans: Object.values(PLAN_PRESETS),
  });
});

const PatchFeatureBody = z.object({
  featureKey: z.string().min(1),
  enabled: z.boolean(),
});

router.patch("/company/features", requireOwner, async (req, res): Promise<void> => {
  const parsed = PatchFeatureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "請提供 featureKey 與 enabled" });
    return;
  }
  if (!isModuleKey(parsed.data.featureKey)) {
    res.status(400).json({ error: "未知的功能模組" });
    return;
  }
  const ctx = await loadCompanyContext(req.user?.companyId ?? null);
  await setCompanyFeature(ctx.companyId, parsed.data.featureKey, parsed.data.enabled);
  const features = await listCompanyFeatures(ctx.companyId);
  res.json({
    ok: true,
    companyId: ctx.companyId,
    features: features.map((f) => ({
      featureKey: f.featureKey,
      label: MODULE_LABELS[f.featureKey],
      enabled: f.enabled,
    })),
  });
});

const ApplyPlanBody = z.object({
  planKey: z.string().min(1).default(PLAN_SALES_TRIAL),
});

router.post("/company/plans/apply", requireOwner, async (req, res): Promise<void> => {
  const parsed = ApplyPlanBody.safeParse(req.body ?? {});
  const planKey = parsed.success ? parsed.data.planKey : PLAN_SALES_TRIAL;
  if (!PLAN_PRESETS[planKey]) {
    res.status(400).json({ error: "未知的方案" });
    return;
  }
  const company = req.user?.companyId
    ? { id: req.user.companyId }
    : await getDefaultCompany();
  await applyPlanToCompany(company.id, planKey);
  const ctx = await loadCompanyContext(company.id);
  const features = await listCompanyFeatures(ctx.companyId);
  res.json({
    ok: true,
    planKey: ctx.planKey,
    planName: PLAN_PRESETS[ctx.planKey]?.name ?? ctx.planKey,
    modules: ctx.companyModules,
    features,
  });
});

export default router;
