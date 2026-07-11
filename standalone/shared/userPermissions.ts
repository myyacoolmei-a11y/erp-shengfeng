/** Feature permission keys — shared between client and server */
export const FEATURE_KEYS = [
  "home",
  "customers",
  "quotes",
  "work_orders",
  "repair_cases",
  "maintenance",
  "receivables",
  "inventory",
  "company_announce",
  "ai_assistant",
  "system_settings",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  home: "首頁",
  customers: "客戶",
  quotes: "報價單",
  work_orders: "派工單",
  repair_cases: "維修案件",
  maintenance: "保養案件",
  receivables: "收款",
  inventory: "庫存",
  company_announce: "公司公告",
  ai_assistant: "AI 助手",
  system_settings: "系統設定",
};

export const IDENTITY_TYPES = ["employee", "owner", "contractor", "temporary", "other"] as const;
export type IdentityType = (typeof IDENTITY_TYPES)[number];

export const IDENTITY_TYPE_LABELS: Record<IdentityType, string> = {
  employee: "員工",
  owner: "老闆",
  contractor: "外包",
  temporary: "臨時人員",
  other: "其他",
};

export const DATA_PERMISSIONS = ["own", "all"] as const;
export type DataPermission = (typeof DATA_PERMISSIONS)[number];

export const DATA_PERMISSION_LABELS: Record<DataPermission, string> = {
  own: "只能查看自己的資料",
  all: "可查看全部資料",
};

export const PERMISSION_TEMPLATE_KEYS = [
  "boss",
  "admin",
  "engineer",
  "sales",
  "accountant",
  "contractor",
] as const;

export type PermissionTemplateKey = (typeof PERMISSION_TEMPLATE_KEYS)[number];

export const PERMISSION_TEMPLATE_LABELS: Record<PermissionTemplateKey, string> = {
  boss: "老闆",
  admin: "行政",
  engineer: "工程師",
  sales: "業務",
  accountant: "會計",
  contractor: "外包",
};

const ALL_FEATURES: FeatureKey[] = [...FEATURE_KEYS];

const ROLE_FEATURES: Record<string, FeatureKey[]> = {
  super_admin: ALL_FEATURES,
  owner: ALL_FEATURES,
  admin: [
    "home",
    "customers",
    "quotes",
    "work_orders",
    "repair_cases",
    "maintenance",
    "receivables",
    "inventory",
    "company_announce",
    "ai_assistant",
    "system_settings",
  ],
  sales: ["home", "customers", "quotes", "ai_assistant"],
  engineer: ["home", "work_orders", "repair_cases", "maintenance", "company_announce"],
  technician: ["home", "work_orders", "repair_cases", "maintenance", "company_announce"],
  accountant: ["home", "customers", "receivables", "ai_assistant"],
  distributor: ["home", "quotes", "ai_assistant"],
};

export interface PermissionTemplate {
  label: string;
  roles: string[];
  features: FeatureKey[];
  dataPermission: DataPermission;
  identityType: IdentityType;
  title: string;
}

export const PERMISSION_TEMPLATES: Record<PermissionTemplateKey, PermissionTemplate> = {
  boss: {
    label: "老闆",
    roles: ["owner"],
    features: ALL_FEATURES,
    dataPermission: "all",
    identityType: "owner",
    title: "老闆",
  },
  admin: {
    label: "行政",
    roles: ["admin"],
    features: [
      "home",
      "customers",
      "quotes",
      "work_orders",
      "repair_cases",
      "maintenance",
      "receivables",
      "inventory",
      "company_announce",
      "ai_assistant",
      "system_settings",
    ],
    dataPermission: "all",
    identityType: "employee",
    title: "行政",
  },
  engineer: {
    label: "工程師",
    roles: ["engineer"],
    features: ["home", "work_orders", "repair_cases", "maintenance", "company_announce"],
    dataPermission: "own",
    identityType: "employee",
    title: "工程師",
  },
  sales: {
    label: "業務",
    roles: ["sales"],
    features: ["home", "customers", "quotes", "ai_assistant"],
    dataPermission: "all",
    identityType: "employee",
    title: "業務",
  },
  accountant: {
    label: "會計",
    roles: ["accountant"],
    features: ["home", "customers", "receivables", "ai_assistant"],
    dataPermission: "all",
    identityType: "employee",
    title: "會計",
  },
  contractor: {
    label: "外包",
    roles: ["technician"],
    features: ["home", "work_orders", "repair_cases", "company_announce"],
    dataPermission: "own",
    identityType: "contractor",
    title: "外包",
  },
};

export interface PermissionUserLike {
  role?: string;
  roles?: string[];
  featurePermissions?: string[] | null;
  dataPermission?: string | null;
}

export function effectiveRolesFromUser(user: PermissionUserLike): string[] {
  return user.roles?.length ? user.roles : user.role ? [user.role] : [];
}

/** Resolve feature permissions — explicit list wins; otherwise derive from legacy roles */
export function resolveFeaturePermissions(user: PermissionUserLike): FeatureKey[] {
  if (user.featurePermissions?.length) {
    return user.featurePermissions.filter((f): f is FeatureKey =>
      (FEATURE_KEYS as readonly string[]).includes(f),
    );
  }
  const roles = effectiveRolesFromUser(user);
  const set = new Set<FeatureKey>();
  for (const role of roles) {
    for (const f of ROLE_FEATURES[role] ?? []) set.add(f);
  }
  return [...set];
}

export function resolveDataPermission(user: PermissionUserLike): DataPermission {
  if (user.dataPermission === "own" || user.dataPermission === "all") {
    return user.dataPermission;
  }
  const roles = effectiveRolesFromUser(user);
  if (roles.some(r => ["engineer", "technician", "distributor"].includes(r))) return "own";
  return "all";
}

export function hasFeaturePermission(user: PermissionUserLike, feature: FeatureKey): boolean {
  return resolveFeaturePermissions(user).includes(feature);
}

export function isDataPermissionBypassRole(roles: string[]): boolean {
  return roles.includes("super_admin") || roles.includes("owner") || roles.includes("admin");
}

/** dataPermission=own 且非 admin 角色時，僅能看自己的資料 */
export function shouldApplyOwnDataFilter(user: PermissionUserLike): boolean {
  const roles = effectiveRolesFromUser(user);
  if (isDataPermissionBypassRole(roles)) return false;
  return resolveDataPermission(user) === "own";
}

/** Map nav href to required feature (for sidebar filtering) */
export const NAV_HREF_FEATURES: Record<string, FeatureKey | FeatureKey[]> = {
  "/": "home",
  "/engineer-dashboard": "home",
  "/partner-home": "company_announce",
  "/customers": "customers",
  "/quotes": "quotes",
  "/work-orders": "work_orders",
  "/repair-cases": "repair_cases",
  "/receivables": "receivables",
  "/products": "inventory",
  "/inventory": "inventory",
  "/warranties": "maintenance",
  "/employees": "system_settings",
  "/work-hours-stats": "system_settings",
  "/reminder-settings": "ai_assistant",
  "/users": "system_settings",
  "/wholesale/customers": "customers",
  "/wholesale/products": "inventory",
  "/wholesale/orders": "quotes",
  "/wholesale/settlements": "receivables",
};

export function inferRolesFromFeatures(features: FeatureKey[]): string[] {
  for (const key of PERMISSION_TEMPLATE_KEYS) {
    const tpl = PERMISSION_TEMPLATES[key];
    const match =
      tpl.features.length === features.length &&
      tpl.features.every(f => features.includes(f));
    if (match) return [...tpl.roles];
  }
  if (features.includes("system_settings") && features.length >= 8) return ["owner"];
  if (features.includes("system_settings")) return ["admin"];
  if (features.includes("receivables") && !features.includes("work_orders")) return ["accountant"];
  if (features.includes("customers") && features.includes("quotes")) return ["sales"];
  if (features.includes("work_orders")) return ["engineer"];
  return ["technician"];
}

export function navHrefAllowed(user: PermissionUserLike, href: string): boolean {
  const required = NAV_HREF_FEATURES[href];
  if (!required) return true;
  const perms = resolveFeaturePermissions(user);
  const list = Array.isArray(required) ? required : [required];
  return list.some(f => perms.includes(f));
}

export function rolesFromTemplate(templateKey: PermissionTemplateKey): string[] {
  return [...PERMISSION_TEMPLATES[templateKey].roles];
}

export function featuresFromTemplate(templateKey: PermissionTemplateKey): FeatureKey[] {
  return [...PERMISSION_TEMPLATES[templateKey].features];
}
