/**
 * Single source of truth: Sidebar nav items + permission keys.
 * layout.tsx (desktop/mobile) and user permission editor both import from here.
 */

export const FEATURE_KEYS = [
  "dashboard",
  "customers",
  "quotations",
  "dispatch_orders",
  "repair_cases",
  "receivables",
  "products",
  "wholesale",
  "inventory",
  "warranty_maintenance",
  "employees",
  "users",
  "work_hours",
  "notifications",
  "ai_assistant",
  "company_culture",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type NavGroupId = "work_center" | "company_internal" | "ai_center";

export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  work_center: "工作中心",
  company_internal: "公司內部",
  ai_center: "AI 中心",
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  dashboard: "儀表板／首頁",
  customers: "客戶管理",
  quotations: "報價單",
  dispatch_orders: "派工單",
  repair_cases: "維修案件",
  receivables: "收款／應收帳款",
  products: "商品管理",
  wholesale: "批發管理",
  inventory: "庫存管理",
  warranty_maintenance: "保固保養",
  employees: "員工管理",
  users: "使用者管理",
  work_hours: "工時統計",
  notifications: "通知中心",
  ai_assistant: "AI 小秘書",
  company_culture: "晟風夥伴文化",
};

/** Icon name resolved in layout.tsx (lucide) */
export type NavIconName =
  | "LayoutDashboard"
  | "Users"
  | "FileText"
  | "Wrench"
  | "HardHat"
  | "CreditCard"
  | "Archive"
  | "Package"
  | "ShieldCheck"
  | "ShoppingCart"
  | "Building2"
  | "ReceiptText"
  | "Briefcase"
  | "UserCog"
  | "Clock"
  | "Bell"
  | "Sparkles"
  | "Heart";

export interface NavItemDef {
  key: FeatureKey;
  label: string;
  path: string;
  group: NavGroupId;
  icon: NavIconName;
  /** Shown in sidebar (leaf or parent) */
  visibleInSidebar: boolean;
  /** Shown in user permission checkboxes */
  visibleInPermissionEditor: boolean;
  /** Wholesale submenu — only rendered under wholesale parent */
  parentKey?: "wholesale";
  /** Prefer this dashboard for these roles (others use the other dashboard entry) */
  preferRoles?: string[];
}

/**
 * Canonical sidebar + permission catalog (current production menu).
 * Order within each group = display order.
 */
export const NAV_ITEMS: NavItemDef[] = [
  // 工作中心
  {
    key: "dashboard",
    label: "儀表板",
    path: "/",
    group: "work_center",
    icon: "LayoutDashboard",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
    preferRoles: ["super_admin", "owner", "admin", "accountant", "sales", "distributor"],
  },
  {
    key: "dashboard",
    label: "儀表板",
    path: "/engineer-dashboard",
    group: "work_center",
    icon: "LayoutDashboard",
    visibleInSidebar: true,
    visibleInPermissionEditor: false,
    preferRoles: ["engineer", "technician"],
  },
  {
    key: "customers",
    label: "客戶管理",
    path: "/customers",
    group: "work_center",
    icon: "Users",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "quotations",
    label: "報價單",
    path: "/quotes",
    group: "work_center",
    icon: "FileText",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "dispatch_orders",
    label: "派工單",
    path: "/work-orders",
    group: "work_center",
    icon: "Wrench",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "repair_cases",
    label: "維修案件",
    path: "/repair-cases",
    group: "work_center",
    icon: "HardHat",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "receivables",
    label: "收款／應收帳款",
    path: "/receivables",
    group: "work_center",
    icon: "CreditCard",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "products",
    label: "商品管理",
    path: "/products",
    group: "work_center",
    icon: "Archive",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "wholesale",
    label: "批發管理",
    path: "/wholesale/customers",
    group: "work_center",
    icon: "ShoppingCart",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "wholesale",
    label: "批發客戶",
    path: "/wholesale/customers",
    group: "work_center",
    icon: "Building2",
    visibleInSidebar: true,
    visibleInPermissionEditor: false,
    parentKey: "wholesale",
  },
  {
    key: "wholesale",
    label: "批發商品",
    path: "/wholesale/products",
    group: "work_center",
    icon: "Archive",
    visibleInSidebar: true,
    visibleInPermissionEditor: false,
    parentKey: "wholesale",
  },
  {
    key: "wholesale",
    label: "批發出貨單",
    path: "/wholesale/orders",
    group: "work_center",
    icon: "ReceiptText",
    visibleInSidebar: true,
    visibleInPermissionEditor: false,
    parentKey: "wholesale",
  },
  {
    key: "wholesale",
    label: "月結 / 應收",
    path: "/wholesale/settlements",
    group: "work_center",
    icon: "CreditCard",
    visibleInSidebar: true,
    visibleInPermissionEditor: false,
    parentKey: "wholesale",
  },
  {
    key: "inventory",
    label: "庫存管理",
    path: "/inventory",
    group: "work_center",
    icon: "Package",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "warranty_maintenance",
    label: "保固保養",
    path: "/warranties",
    group: "work_center",
    icon: "ShieldCheck",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },

  // 公司內部
  {
    key: "employees",
    label: "員工管理",
    path: "/employees",
    group: "company_internal",
    icon: "Briefcase",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "users",
    label: "使用者管理",
    path: "/users",
    group: "company_internal",
    icon: "UserCog",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "work_hours",
    label: "工時統計",
    path: "/work-hours-stats",
    group: "company_internal",
    icon: "Clock",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "notifications",
    label: "通知中心",
    path: "/notification-settings",
    group: "company_internal",
    icon: "Bell",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },

  // AI 中心
  {
    key: "ai_assistant",
    label: "AI 小秘書",
    path: "/ai-assistant",
    group: "ai_center",
    icon: "Sparkles",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
  {
    key: "company_culture",
    label: "晟風夥伴文化",
    path: "/partner-culture",
    group: "ai_center",
    icon: "Heart",
    visibleInSidebar: true,
    visibleInPermissionEditor: true,
  },
];

/** Permission editor keys in group order (unique) */
export function permissionEditorItems(): Array<{
  key: FeatureKey;
  label: string;
  group: NavGroupId;
}> {
  const seen = new Set<FeatureKey>();
  const out: Array<{ key: FeatureKey; label: string; group: NavGroupId }> = [];
  for (const item of NAV_ITEMS) {
    if (!item.visibleInPermissionEditor) continue;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({ key: item.key, label: FEATURE_LABELS[item.key], group: item.group });
  }
  return out;
}

/** Map path → required feature */
export function featureForPath(pathname: string): FeatureKey | null {
  const exact = NAV_ITEMS.find((i) => i.path === pathname);
  if (exact) return exact.key;
  // prefix match (longest first)
  const sorted = [...NAV_ITEMS].sort((a, b) => b.path.length - a.path.length);
  for (const item of sorted) {
    if (item.path !== "/" && pathname.startsWith(item.path)) return item.key;
  }
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/wholesale")) return "wholesale";
  if (pathname.startsWith("/maintenance")) return "warranty_maintenance";
  if (pathname.startsWith("/partner-")) return "company_culture";
  if (pathname.startsWith("/ai-") || pathname.startsWith("/reminder-settings")) return "ai_assistant";
  return null;
}

/**
 * Legacy permission keys → new keys.
 * Old `inventory` gated both 商品 and 庫存 → expand to both.
 * Old `system_settings` gated 員工/用戶/工時/通知 → expand.
 */
export const LEGACY_FEATURE_MAP: Record<string, FeatureKey[]> = {
  home: ["dashboard"],
  dashboard: ["dashboard"],
  customers: ["customers"],
  quotes: ["quotations"],
  quotations: ["quotations"],
  work_orders: ["dispatch_orders"],
  dispatch_orders: ["dispatch_orders"],
  dispatch: ["dispatch_orders"],
  repair_cases: ["repair_cases"],
  repair: ["repair_cases"],
  receivables: ["receivables"],
  payment: ["receivables"],
  products: ["products"],
  wholesale: ["wholesale"],
  /** Old inventory gated 商品+庫存; keep as 庫存 only so 行政不自動拿到商品 */
  inventory: ["inventory"],
  maintenance: ["warranty_maintenance"],
  warranty_maintenance: ["warranty_maintenance"],
  employees: ["employees"],
  users: ["users"],
  work_hours: ["work_hours"],
  notifications: ["notifications"],
  company_announce: ["company_culture"],
  company_announcements: ["company_culture"],
  company_culture: ["company_culture"],
  ai_assistant: ["ai_assistant"],
  ai: ["ai_assistant"],
  /** Old catch-all for 公司內部 */
  system_settings: ["employees", "users", "work_hours", "notifications"],
};

export function normalizeFeaturePermissions(raw: string[] | null | undefined): FeatureKey[] {
  if (!raw?.length) return [];
  const set = new Set<FeatureKey>();
  for (const key of raw) {
    const mapped = LEGACY_FEATURE_MAP[key];
    if (mapped) {
      for (const f of mapped) set.add(f);
      continue;
    }
    if ((FEATURE_KEYS as readonly string[]).includes(key)) {
      set.add(key as FeatureKey);
    }
  }
  return FEATURE_KEYS.filter((k) => set.has(k));
}

/** Sidebar leaf items for a group (excludes wholesale parent/children — handled separately) */
export function sidebarItemsForGroup(group: NavGroupId): NavItemDef[] {
  return NAV_ITEMS.filter(
    (i) => i.group === group && i.visibleInSidebar && !i.parentKey && i.key !== "wholesale",
  );
}

export function wholesaleSubItems(): NavItemDef[] {
  return NAV_ITEMS.filter((i) => i.parentKey === "wholesale");
}
