export function userHasSalesRole(user: {
  role?: string | null;
  roles?: string[] | null;
}): boolean {
  if (user.role === "sales") return true;
  return Array.isArray(user.roles) && user.roles.includes("sales");
}

export type RepairCaseSalesOption = {
  id: number;
  name: string;
  isSales: boolean;
};

/** Active users first by sales role, then name. Always include the current assignee. */
export function buildRepairCaseSalesOptions(input: {
  users: Array<{
    id: number;
    displayName: string | null;
    role?: string | null;
    roles?: string[] | null;
    isActive?: boolean | null;
    employeePosition?: string | null;
    employeeName?: string | null;
  }>;
  includeUserId?: number | null;
}): RepairCaseSalesOption[] {
  const map = new Map<number, RepairCaseSalesOption>();
  for (const user of input.users) {
    const keep = user.isActive !== false || user.id === input.includeUserId;
    if (!keep) continue;
    const name = (user.displayName || user.employeeName || "").trim();
    if (!name) continue;
    const isSales = userHasSalesRole(user) || (user.employeePosition || "").includes("業務");
    map.set(user.id, { id: user.id, name, isSales });
  }
  return [...map.values()].sort((a, b) => {
    if (a.isSales !== b.isSales) return a.isSales ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}
