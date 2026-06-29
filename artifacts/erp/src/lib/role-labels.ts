import type { UserRole } from "@/contexts/auth-context";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "系統管理員",
  owner: "老闆",
  admin: "行政管理",
  sales: "業務",
  engineer: "工程師",
  technician: "技術員",
  accountant: "會計",
  distributor: "批發商",
};
