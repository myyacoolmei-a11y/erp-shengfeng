/**
 * Tenant-level module toggles (company_features).
 * Independent from per-user featurePermissions: both must pass.
 */

export const MODULE_KEYS = [
  "dashboard",
  "customers",
  "quotes",
  "invoices",
  "payments",
  "dispatch",
  "maintenance",
  "subsidy",
  "wholesale",
  "accounts_receivable",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "儀表板",
  customers: "客戶管理",
  quotes: "報價單",
  invoices: "發票",
  payments: "收款",
  dispatch: "派工",
  maintenance: "保固保養",
  subsidy: "補助申請",
  wholesale: "批發管理",
  accounts_receivable: "應收帳款",
};

export const PLAN_SALES_TRIAL = "sales_trial";

export type PlanPreset = {
  key: string;
  name: string;
  enabled: ModuleKey[];
  disabled: ModuleKey[];
};

export const PLAN_PRESETS: Record<string, PlanPreset> = {
  [PLAN_SALES_TRIAL]: {
    key: PLAN_SALES_TRIAL,
    name: "業務試用版",
    enabled: [
      "dashboard",
      "customers",
      "quotes",
      "invoices",
      "payments",
      "accounts_receivable",
    ],
    disabled: ["dispatch", "maintenance", "subsidy", "wholesale"],
  },
};

/** User-level FeatureKey → company modules (any enabled module passes). */
export const FEATURE_TO_MODULES: Record<string, ModuleKey[]> = {
  dashboard: ["dashboard"],
  customers: ["customers"],
  quotations: ["quotes"],
  dispatch_orders: ["dispatch"],
  receivables: ["accounts_receivable", "payments", "invoices"],
  warranty_maintenance: ["maintenance"],
  wholesale: ["wholesale"],
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

export function enabledModulesFromPlan(planKey: string): Set<ModuleKey> {
  const plan = PLAN_PRESETS[planKey] ?? PLAN_PRESETS[PLAN_SALES_TRIAL];
  return new Set(plan.enabled);
}

export function modulesForFeature(feature: string): ModuleKey[] {
  return FEATURE_TO_MODULES[feature] ?? [];
}

export function isModuleEnabled(
  enabledModules: Iterable<string> | null | undefined,
  module: ModuleKey,
): boolean {
  const set = new Set(enabledModules ?? []);
  return set.has(module);
}

export function companyAllowsFeature(
  enabledModules: Iterable<string> | null | undefined,
  feature: string,
): boolean {
  const needed = modulesForFeature(feature);
  if (needed.length === 0) return true;
  const set = new Set(enabledModules ?? []);
  return needed.some((m) => set.has(m));
}

export function companyAllowsAnyModule(
  enabledModules: Iterable<string> | null | undefined,
  modules: ModuleKey[],
): boolean {
  if (modules.length === 0) return true;
  const set = new Set(enabledModules ?? []);
  return modules.some((m) => set.has(m));
}

/** Path-aware nav visibility on top of user feature permissions. */
export function companyAllowsPath(
  enabledModules: Iterable<string> | null | undefined,
  href: string,
  featureKey: string | null,
): boolean {
  if (href.startsWith("/payments")) return isModuleEnabled(enabledModules, "payments");
  if (href.startsWith("/operation-center") || href.startsWith("/subsidy")) {
    return isModuleEnabled(enabledModules, "subsidy");
  }
  if (href.startsWith("/company/modules")) return true;
  if (href.startsWith("/work-orders") || href.startsWith("/engineer-dashboard")) {
    return isModuleEnabled(enabledModules, "dispatch");
  }
  if (href.startsWith("/warranties") || href.startsWith("/maintenance")) {
    return isModuleEnabled(enabledModules, "maintenance");
  }
  if (href.startsWith("/wholesale")) return isModuleEnabled(enabledModules, "wholesale");
  if (href.startsWith("/receivables")) {
    return (
      isModuleEnabled(enabledModules, "accounts_receivable") ||
      isModuleEnabled(enabledModules, "invoices")
    );
  }
  if (!featureKey) return true;
  return companyAllowsFeature(enabledModules, featureKey);
}
