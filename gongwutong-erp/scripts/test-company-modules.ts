/**
 * Company module toggle unit + DB checks.
 * Never uses Shengfeng production database.
 */
import {
  companyAllowsFeature,
  companyAllowsPath,
  enabledModulesFromPlan,
  isModuleEnabled,
  MODULE_KEYS,
  PLAN_SALES_TRIAL,
  PLAN_PRESETS,
} from "../shared/companyModules.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function testPlanPreset() {
  const plan = PLAN_PRESETS[PLAN_SALES_TRIAL];
  assert(plan.name === "業務試用版", "plan name");
  const enabled = enabledModulesFromPlan(PLAN_SALES_TRIAL);
  for (const k of ["dashboard", "customers", "quotes", "invoices", "payments", "accounts_receivable"] as const) {
    assert(enabled.has(k), `enabled ${k}`);
  }
  for (const k of ["dispatch", "maintenance", "subsidy", "wholesale"] as const) {
    assert(!enabled.has(k), `disabled ${k}`);
  }
  assert(MODULE_KEYS.length === 10, "10 modules");
  console.log("ok plan preset");
}

function testGates() {
  const sales = enabledModulesFromPlan(PLAN_SALES_TRIAL);
  assert(companyAllowsFeature(sales, "quotations"), "quotes feature");
  assert(companyAllowsFeature(sales, "customers"), "customers feature");
  assert(companyAllowsFeature(sales, "receivables"), "AR suite maps to receivables");
  assert(!companyAllowsFeature(sales, "dispatch_orders"), "dispatch off");
  assert(!companyAllowsFeature(sales, "wholesale"), "wholesale off");
  assert(!companyAllowsFeature(sales, "warranty_maintenance"), "maintenance off");
  assert(companyAllowsFeature(sales, "employees"), "unmapped features stay available");
  assert(companyAllowsPath(sales, "/quotes", "quotations"), "nav quotes");
  assert(!companyAllowsPath(sales, "/work-orders", "dispatch_orders"), "nav dispatch hidden");
  assert(!companyAllowsPath(sales, "/wholesale/customers", "wholesale"), "nav wholesale hidden");
  assert(companyAllowsPath(sales, "/receivables", "receivables"), "nav AR");
  assert(companyAllowsPath(sales, "/payments", "receivables"), "nav payments");
  assert(!isModuleEnabled(sales, "subsidy"), "subsidy off");
  console.log("ok feature/nav gates");
}

async function testDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log("skip db (no DATABASE_URL)");
    return;
  }
  if (process.env.DATABASE_URL.includes("shengfeng")) {
    throw new Error("Refusing to run against a Shengfeng database URL");
  }

  const { ensureCompanyModulesMigration } = await import("../server/lib/migrations/ensureCompanyModulesMigration.ts");
  const { listEnabledModules, getDefaultCompany, applyPlanToCompany } = await import("../server/lib/companyModuleService.ts");

  const ok = await ensureCompanyModulesMigration();
  assert(ok, "migration");
  const company = await getDefaultCompany();
  await applyPlanToCompany(company.id, PLAN_SALES_TRIAL);
  const mods = await listEnabledModules(company.id);
  assert(mods.includes("quotes"), "db quotes on");
  assert(mods.includes("customers"), "db customers on");
  assert(!mods.includes("dispatch"), "db dispatch off");
  assert(!mods.includes("wholesale"), "db wholesale off");
  assert(!mods.includes("subsidy"), "db subsidy off");
  console.log("ok database company_features sales_trial");
}

testPlanPreset();
testGates();
await testDatabase();
console.log("all company-module checks passed");
