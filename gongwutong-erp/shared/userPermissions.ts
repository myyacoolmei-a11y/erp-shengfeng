/**
 * Feature permissions + role templates.
 * Nav catalog lives in navigationPermissions.ts (single source with Sidebar).
 */

export {
  FEATURE_KEYS,
  FEATURE_LABELS,
  type FeatureKey,
  NAV_GROUP_LABELS,
  type NavGroupId,
  NAV_ITEMS,
  permissionEditorItems,
  featureForPath,
  normalizeFeaturePermissions,
  LEGACY_FEATURE_MAP,
  sidebarItemsForGroup,
  wholesaleSubItems,
} from "./navigationPermissions.ts";

import {
  FEATURE_KEYS,
  type FeatureKey,
  normalizeFeaturePermissions,
  featureForPath,
} from "./navigationPermissions.ts";

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

/** Role → default features (used when DB feature_permissions empty) */
const ROLE_FEATURES: Record<string, FeatureKey[]> = {
  super_admin: ALL_FEATURES,
  owner: ALL_FEATURES,
  admin: [
    "dashboard",
    "customers",
    "quotations",
    "dispatch_orders",
    "repair_cases",
    "warranty_maintenance",
    "receivables",
    "inventory",
    "notifications",
  ],
  sales: ["dashboard", "customers", "quotations", "products", "wholesale", "ai_assistant"],
  engineer: [
    "dashboard",
    "dispatch_orders",
    "repair_cases",
    "warranty_maintenance",
    "company_culture",
    "notifications",
  ],
  technician: [
    "dashboard",
    "dispatch_orders",
    "repair_cases",
    "warranty_maintenance",
    "company_culture",
    "notifications",
  ],
  accountant: ["dashboard", "customers", "receivables", "warranty_maintenance", "work_hours", "ai_assistant"],
  distributor: ["dashboard", "quotations", "ai_assistant"],
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
      "dashboard",
      "customers",
      "quotations",
      "dispatch_orders",
      "repair_cases",
      "warranty_maintenance",
      "receivables",
      "inventory",
      "notifications",
    ],
    dataPermission: "all",
    identityType: "employee",
    title: "行政",
  },
  engineer: {
    label: "工程師",
    roles: ["engineer"],
    features: [
      "dashboard",
      "dispatch_orders",
      "repair_cases",
      "warranty_maintenance",
      "company_culture",
      "notifications",
    ],
    dataPermission: "own",
    identityType: "employee",
    title: "工程師",
  },
  sales: {
    label: "業務",
    roles: ["sales"],
    features: ["dashboard", "customers", "quotations", "products", "wholesale", "ai_assistant"],
    dataPermission: "all",
    identityType: "employee",
    title: "業務",
  },
  accountant: {
    label: "會計",
    roles: ["accountant"],
    features: ["dashboard", "customers", "receivables", "warranty_maintenance", "work_hours", "ai_assistant"],
    dataPermission: "all",
    identityType: "employee",
    title: "會計",
  },
  contractor: {
    label: "外包",
    roles: ["technician"],
    features: ["dashboard", "dispatch_orders", "repair_cases", "company_culture", "notifications"],
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

/** Resolve feature permissions — explicit list (normalized) wins; else derive from roles */
export function resolveFeaturePermissions(user: PermissionUserLike): FeatureKey[] {
  const roles = effectiveRolesFromUser(user);
  if (roles.includes("super_admin") || roles.includes("owner")) {
    return ALL_FEATURES;
  }

  if (user.featurePermissions?.length) {
    return normalizeFeaturePermissions(user.featurePermissions);
  }

  const set = new Set<FeatureKey>();
  for (const role of roles) {
    for (const f of ROLE_FEATURES[role] ?? []) set.add(f);
  }
  return FEATURE_KEYS.filter((k) => set.has(k));
}

export function resolveDataPermission(user: PermissionUserLike): DataPermission {
  if (user.dataPermission === "own" || user.dataPermission === "all") {
    return user.dataPermission;
  }
  const roles = effectiveRolesFromUser(user);
  if (roles.some((r) => ["engineer", "technician", "distributor"].includes(r))) return "own";
  return "all";
}

export function hasFeaturePermission(user: PermissionUserLike, feature: FeatureKey): boolean {
  return resolveFeaturePermissions(user).includes(feature);
}

export function isDataPermissionBypassRole(roles: string[]): boolean {
  return roles.includes("super_admin") || roles.includes("owner") || roles.includes("admin");
}

export function shouldApplyOwnDataFilter(user: PermissionUserLike): boolean {
  // 以 data_permission 為準；all = 不依建立者／指派者過濾
  if (resolveDataPermission(user) === "all") return false;
  const roles = effectiveRolesFromUser(user);
  if (isDataPermissionBypassRole(roles)) return false;
  return true;
}

/** @deprecated use featureForPath */
export const NAV_HREF_FEATURES: Record<string, FeatureKey | FeatureKey[]> = {};

export function inferRolesFromFeatures(features: FeatureKey[]): string[] {
  for (const key of PERMISSION_TEMPLATE_KEYS) {
    const tpl = PERMISSION_TEMPLATES[key];
    const match =
      tpl.features.length === features.length && tpl.features.every((f) => features.includes(f));
    if (match) return [...tpl.roles];
  }
  if (features.includes("users")) return ["owner"];
  // 行政特徵：派工 + 客戶 + 應收（不可誤判為 sales）
  if (
    features.includes("dispatch_orders") &&
    features.includes("customers") &&
    (features.includes("receivables") || features.includes("inventory") || features.includes("quotations"))
  ) {
    return ["admin"];
  }
  if (features.includes("employees") && features.includes("dispatch_orders")) return ["admin"];
  if (features.includes("receivables") && !features.includes("dispatch_orders")) return ["accountant"];
  // 業務：客戶+報價，但沒有派工／庫存行政組合
  if (
    features.includes("customers") &&
    features.includes("quotations") &&
    !features.includes("dispatch_orders")
  ) {
    return ["sales"];
  }
  if (features.includes("dispatch_orders")) return ["engineer"];
  return ["technician"];
}

/** 行政功能組合但角色被誤推成 sales／engineer 時，應修回 admin */
export function looksLikeAdminFeatureSet(features: string[]): boolean {
  const set = new Set(features);
  return (
    set.has("dispatch_orders") &&
    set.has("customers") &&
    (set.has("receivables") || set.has("inventory")) &&
    !set.has("users")
  );
}

export function navHrefAllowed(user: PermissionUserLike, href: string): boolean {
  const roles = effectiveRolesFromUser(user);
  if (roles.includes("super_admin") || roles.includes("owner")) return true;
  const required = featureForPath(href);
  if (!required) return true;
  return hasFeaturePermission(user, required);
}

export function rolesFromTemplate(templateKey: PermissionTemplateKey): string[] {
  return [...PERMISSION_TEMPLATES[templateKey].roles];
}

export function featuresFromTemplate(templateKey: PermissionTemplateKey): FeatureKey[] {
  return [...PERMISSION_TEMPLATES[templateKey].features];
}
