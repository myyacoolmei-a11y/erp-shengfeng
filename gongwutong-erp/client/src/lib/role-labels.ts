import type { UserRole } from "@/contexts/auth-context";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "系統管理員",
  owner: "老闆/老闆娘",
  admin: "行政",
  sales: "業務",
  engineer: "工程師/師傅",
  technician: "技師",
  accountant: "會計",
  distributor: "配合廠商",
};
