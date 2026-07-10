import { eq, or } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { effectiveRoles } from "../auth.ts";

export interface WorkOrderAssignmentFields {
  assignedTo: string | null;
  assistantTo: string | null;
  technicians: string | null;
}

export interface UserAssignmentContext {
  userId: number;
  displayName: string;
  username: string;
  roles: string[];
  /** All strings used to match assignedTo / assistantTo / technicians entries */
  matchKeys: string[];
  employeeNames: string[];
}

function normalizeKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parseTechnicianNames(technicians: string | null): string[] {
  if (!technicians) return [];
  try {
    const parsed = JSON.parse(technicians);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => normalizeKey(v)).filter((v): v is string => v != null);
  } catch {
    return [];
  }
}

/** Build all name/id keys that may appear on a work order assignment for this user. */
export async function buildUserAssignmentContext(user: JwtPayload): Promise<UserAssignmentContext> {
  const roles = effectiveRoles(user);
  const keys = new Set<string>();

  const displayName = normalizeKey(user.displayName);
  const username = normalizeKey(user.username);
  if (displayName) keys.add(displayName);
  if (username) keys.add(username);
  keys.add(String(user.id));

  const nameConditions = [
    displayName ? eq(employeesTable.name, displayName) : null,
    username ? eq(employeesTable.name, username) : null,
  ].filter((c): c is ReturnType<typeof eq> => c != null);

  let employeeRows: { name: string }[] = [];
  if (nameConditions.length > 0) {
    employeeRows = await db
      .select({ name: employeesTable.name })
      .from(employeesTable)
      .where(nameConditions.length === 1 ? nameConditions[0] : or(...nameConditions));
  }

  const employeeNames: string[] = [];
  for (const row of employeeRows) {
    const name = normalizeKey(row.name);
    if (name) {
      employeeNames.push(name);
      keys.add(name);
    }
  }

  return {
    userId: user.id,
    displayName: displayName ?? "",
    username: username ?? "",
    roles,
    matchKeys: [...keys],
    employeeNames,
  };
}

export function isWorkOrderAssignedToContext(
  order: WorkOrderAssignmentFields,
  ctx: UserAssignmentContext,
): boolean {
  const keys = new Set(ctx.matchKeys);

  const assignedTo = normalizeKey(order.assignedTo);
  const assistantTo = normalizeKey(order.assistantTo);
  if (assignedTo && keys.has(assignedTo)) return true;
  if (assistantTo && keys.has(assistantTo)) return true;

  for (const name of parseTechnicianNames(order.technicians)) {
    if (keys.has(name)) return true;
  }

  return false;
}

/** @deprecated Prefer isWorkOrderAssignedToContext with buildUserAssignmentContext */
export function isWorkOrderAssignedToUser(
  order: WorkOrderAssignmentFields,
  displayName: string,
): boolean {
  return isWorkOrderAssignedToContext(order, {
    userId: 0,
    displayName,
    username: displayName,
    roles: [],
    matchKeys: [displayName].filter(Boolean),
    employeeNames: [],
  });
}

export function isFieldProgressOperator(user: JwtPayload): boolean {
  const roles = effectiveRoles(user);
  return roles.includes("engineer") || roles.includes("technician");
}

/** Admin roles that bypass assignment filter and see all work orders (including unassigned). */
export function isWorkOrderListAdmin(user: JwtPayload): boolean {
  const roles = effectiveRoles(user);
  return (
    roles.includes("super_admin") ||
    roles.includes("owner") ||
    roles.includes("admin")
  );
}

export function isFieldProgressAdmin(user: JwtPayload): boolean {
  const roles = effectiveRoles(user);
  return (
    isWorkOrderListAdmin(user) ||
    roles.includes("accountant")
  );
}

export function describeWorkOrderListQuery(params: {
  customerId?: string;
  status?: string;
  applyAssignmentFilter: boolean;
}): string {
  const parts: string[] = ["SELECT work_orders.* FROM work_orders"];
  const where: string[] = [];
  if (params.customerId) where.push(`customer_id = ${params.customerId}`);
  if (params.status) where.push(`status = '${params.status}'`);
  if (where.length > 0) parts.push(`WHERE ${where.join(" AND ")}`);
  parts.push("ORDER BY created_at");
  if (params.applyAssignmentFilter) {
    parts.push(
      "→ post-filter: assignedTo | assistantTo | technicians(JSON) matches user matchKeys",
    );
  }
  return parts.join(" ");
}

export function explainEmptyWorkOrderList(params: {
  totalBeforeFilter: number;
  totalAfterFilter: number;
  applyAssignmentFilter: boolean;
  assignmentContext?: UserAssignmentContext;
  sampleAssignments?: Array<{
    id: number;
    assignedTo: string | null;
    assistantTo: string | null;
    technicians: string | null;
  }>;
}): string {
  if (params.totalAfterFilter > 0) return "有資料";

  if (params.totalBeforeFilter === 0) {
    return "資料庫無符合查詢條件的派工單（可能尚未建立或 status/customerId 篩選排除）";
  }

  if (!params.applyAssignmentFilter) {
    return "查詢條件錯誤或資料異常（管理員應可看到全部）";
  }

  const ctx = params.assignmentContext;
  const sample = params.sampleAssignments?.slice(0, 5).map((o) => ({
    id: o.id,
    assignedTo: o.assignedTo,
    assistantTo: o.assistantTo,
    technicians: parseTechnicianNames(o.technicians),
  }));

  return [
    "工程師/技師指派比對後無符合派工單",
    `登入者 matchKeys: ${ctx?.matchKeys.join(", ") || "—"}`,
    `員工姓名: ${ctx?.employeeNames.join(", ") || "（未找到同名員工）"}`,
    "派工單使用 assignedTo(text) / assistantTo(text) / technicians(JSON 員工姓名) 指派，非 assignedUserId",
    sample?.length
      ? `範例派工指派: ${JSON.stringify(sample)}`
      : "無可顯示的指派範例",
  ].join("；");
}

/** When technicians JSON is set but assignedTo is empty, derive assignedTo for legacy compatibility. */
export function deriveAssignedFromTechnicians(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  const names = parseTechnicianNames(
    typeof result.technicians === "string" ? result.technicians : null,
  );
  if (names.length === 0) return result;
  if (!normalizeKey(result.assignedTo as string | null)) {
    result.assignedTo = names[0];
  }
  if (!normalizeKey(result.assistantTo as string | null) && names.length > 1) {
    result.assistantTo = names[1];
  }
  return result;
}
