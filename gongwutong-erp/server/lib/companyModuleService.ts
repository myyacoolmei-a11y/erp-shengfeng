import { eq, and } from "drizzle-orm";
import { db, companiesTable, companyFeaturesTable, usersTable } from "@workspace/db";
import {
  MODULE_KEYS,
  PLAN_PRESETS,
  PLAN_SALES_TRIAL,
  isModuleKey,
  type ModuleKey,
} from "../../shared/companyModules.ts";
import { logger } from "./logger";

const DEFAULT_COMPANY_NAME = "試用公司";
const DEFAULT_COMPANY_SLUG = "trial";

export async function getDefaultCompany() {
  const [bySlug] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.slug, DEFAULT_COMPANY_SLUG))
    .limit(1);
  if (bySlug) return bySlug;
  const [any] = await db.select().from(companiesTable).limit(1);
  if (any) return any;
  const [created] = await db
    .insert(companiesTable)
    .values({
      name: DEFAULT_COMPANY_NAME,
      slug: DEFAULT_COMPANY_SLUG,
      planKey: PLAN_SALES_TRIAL,
    })
    .returning();
  return created;
}

export async function applyPlanToCompany(companyId: number, planKey: string): Promise<ModuleKey[]> {
  const plan = PLAN_PRESETS[planKey] ?? PLAN_PRESETS[PLAN_SALES_TRIAL];
  const enabledSet = new Set(plan.enabled);
  const now = new Date();
  for (const key of MODULE_KEYS) {
    const enabled = enabledSet.has(key);
    const [existing] = await db
      .select({ id: companyFeaturesTable.id })
      .from(companyFeaturesTable)
      .where(and(eq(companyFeaturesTable.companyId, companyId), eq(companyFeaturesTable.featureKey, key)))
      .limit(1);
    if (existing) {
      await db
        .update(companyFeaturesTable)
        .set({ enabled, updatedAt: now })
        .where(eq(companyFeaturesTable.id, existing.id));
    } else {
      await db.insert(companyFeaturesTable).values({
        companyId,
        featureKey: key,
        enabled,
      });
    }
  }
  await db
    .update(companiesTable)
    .set({ planKey: plan.key, updatedAt: now })
    .where(eq(companiesTable.id, companyId));
  return [...enabledSet];
}

export async function ensureCompanyFeatureRows(companyId: number, planKey: string): Promise<void> {
  const existing = await db
    .select({ featureKey: companyFeaturesTable.featureKey })
    .from(companyFeaturesTable)
    .where(eq(companyFeaturesTable.companyId, companyId));
  if (existing.length === 0) {
    await applyPlanToCompany(companyId, planKey);
    return;
  }
  const have = new Set(existing.map((r) => r.featureKey));
  const plan = PLAN_PRESETS[planKey] ?? PLAN_PRESETS[PLAN_SALES_TRIAL];
  const enabledSet = new Set(plan.enabled);
  for (const key of MODULE_KEYS) {
    if (have.has(key)) continue;
    await db.insert(companyFeaturesTable).values({
      companyId,
      featureKey: key,
      enabled: enabledSet.has(key),
    });
  }
}

export async function listCompanyFeatures(companyId: number): Promise<Array<{ featureKey: ModuleKey; enabled: boolean }>> {
  const rows = await db
    .select({
      featureKey: companyFeaturesTable.featureKey,
      enabled: companyFeaturesTable.enabled,
    })
    .from(companyFeaturesTable)
    .where(eq(companyFeaturesTable.companyId, companyId));
  const byKey = new Map(rows.map((r) => [r.featureKey, r.enabled]));
  return MODULE_KEYS.map((key) => ({
    featureKey: key,
    enabled: byKey.get(key) === true,
  }));
}

export async function listEnabledModules(companyId: number): Promise<ModuleKey[]> {
  const rows = await listCompanyFeatures(companyId);
  return rows.filter((r) => r.enabled).map((r) => r.featureKey);
}

export async function setCompanyFeature(
  companyId: number,
  featureKey: string,
  enabled: boolean,
): Promise<void> {
  if (!isModuleKey(featureKey)) {
    throw new Error("未知的功能模組");
  }
  const now = new Date();
  const [existing] = await db
    .select({ id: companyFeaturesTable.id })
    .from(companyFeaturesTable)
    .where(
      and(eq(companyFeaturesTable.companyId, companyId), eq(companyFeaturesTable.featureKey, featureKey)),
    )
    .limit(1);
  if (existing) {
    await db
      .update(companyFeaturesTable)
      .set({ enabled, updatedAt: now })
      .where(eq(companyFeaturesTable.id, existing.id));
    return;
  }
  await db.insert(companyFeaturesTable).values({
    companyId,
    featureKey,
    enabled,
  });
}

export type CompanyContext = {
  companyId: number;
  companyName: string;
  planKey: string;
  companyModules: ModuleKey[];
};

export async function loadCompanyContext(companyId: number | null | undefined): Promise<CompanyContext> {
  let company =
    companyId != null
      ? (await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1))[0]
      : null;
  if (!company) {
    company = await getDefaultCompany();
  }
  await ensureCompanyFeatureRows(company.id, company.planKey);
  const companyModules = await listEnabledModules(company.id);
  return {
    companyId: company.id,
    companyName: company.name,
    planKey: company.planKey,
    companyModules,
  };
}

export async function assignUsersMissingCompany(): Promise<number> {
  const company = await getDefaultCompany();
  const rows = await db.select({ id: usersTable.id, companyId: usersTable.companyId }).from(usersTable);
  let n = 0;
  for (const row of rows) {
    if (row.companyId != null) continue;
    await db.update(usersTable).set({ companyId: company.id }).where(eq(usersTable.id, row.id));
    n += 1;
  }
  if (n > 0) {
    logger.info({ count: n, companyId: company.id }, "assigned users to default company");
  }
  return n;
}
