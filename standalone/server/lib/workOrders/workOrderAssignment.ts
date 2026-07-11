import { eq } from "drizzle-orm";
import { db, employeesTable, workOrderFieldProgressTable } from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { effectiveRoles } from "../auth.ts";
import { logger } from "../logger";
import {
  isDataPermissionBypassRole,
  shouldApplyOwnDataFilter,
} from "../../../shared/userPermissions.ts";

export interface WorkOrderAssignmentFields {
  id?: number;
  assignedTo: string | null;
  assistantTo: string | null;
  technicians: string | null;
}

export interface UserAssignmentContext {
  userId: number;
  displayName: string;
  username: string;
  roles: string[];
  linkedEmployeeId: number | null;
  /** 關聯員工姓名 — own 權限主要比對依據 */
  employeeNames: string[];
  /** 舊資料備援：僅在已關聯員工時，以 displayName 比對指派欄位 */
  legacyNameKeys: string[];
  /** 工程進度表中以 userId 綁定的派工單 */
  progressWorkOrderIds: Set<number>;
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

export function getLinkedEmployeeId(user: JwtPayload): number | null {
  return user.linkedEmployeeId ?? null;
}

export function isEngineerRole(user: JwtPayload): boolean {
  const roles = effectiveRoles(user);
  return roles.includes("engineer") || roles.includes("technician");
}

/** Admin / owner roles — always see all work orders. */
export function isWorkOrderListAdmin(user: JwtPayload): boolean {
  const roles = effectiveRoles(user);
  return (
    roles.includes("super_admin") ||
    roles.includes("owner") ||
    roles.includes("admin")
  );
}

export function isFieldProgressOperator(user: JwtPayload): boolean {
  return isEngineerRole(user);
}

export function isFieldProgressAdmin(user: JwtPayload): boolean {
  const roles = effectiveRoles(user);
  return isWorkOrderListAdmin(user) || roles.includes("accountant");
}

/** Filter work orders when dataPermission = own (admin roles bypass). */
export function shouldFilterWorkOrdersByAssignment(user: JwtPayload): boolean {
  return shouldApplyOwnDataFilter(user);
}

/** Build assignment context — linkedEmployeeId / userId 優先，姓名僅作舊資料備援 */
export async function buildUserAssignmentContext(user: JwtPayload): Promise<UserAssignmentContext> {
  const roles = effectiveRoles(user);
  const linkedEmployeeId = getLinkedEmployeeId(user);
  const employeeNames: string[] = [];
  const legacyNameKeys: string[] = [];

  if (linkedEmployeeId != null) {
    const [emp] = await db
      .select({ name: employeesTable.name })
      .from(employeesTable)
      .where(eq(employeesTable.id, linkedEmployeeId));

    const name = normalizeKey(emp?.name);
    if (name) {
      employeeNames.push(name);
    }
    // 舊資料備援：已關聯員工但派工單仍用 displayName 指派
    if (shouldApplyOwnDataFilter(user)) {
      const displayName = normalizeKey(user.displayName);
      if (displayName && !employeeNames.includes(displayName)) {
        legacyNameKeys.push(displayName);
      }
    }
  }

  const progressRows = await db
    .select({ workOrderId: workOrderFieldProgressTable.workOrderId })
    .from(workOrderFieldProgressTable)
    .where(eq(workOrderFieldProgressTable.engineerUserId, user.id));
  const progressWorkOrderIds = new Set(progressRows.map(r => r.workOrderId));

  return {
    userId: user.id,
    displayName: normalizeKey(user.displayName) ?? "",
    username: normalizeKey(user.username) ?? "",
    roles,
    linkedEmployeeId,
    employeeNames,
    legacyNameKeys,
    progressWorkOrderIds,
  };
}

export function isWorkOrderAssignedToEmployeeName(
  order: WorkOrderAssignmentFields,
  employeeName: string,
): boolean {
  const key = normalizeKey(employeeName);
  if (!key) return false;

  const assignedTo = normalizeKey(order.assignedTo);
  const assistantTo = normalizeKey(order.assistantTo);
  if (assignedTo === key || assistantTo === key) return true;

  return parseTechnicianNames(order.technicians).includes(key);
}

export function isWorkOrderAssignedToContext(
  order: WorkOrderAssignmentFields,
  ctx: UserAssignmentContext,
): boolean {
  for (const name of ctx.employeeNames) {
    if (isWorkOrderAssignedToEmployeeName(order, name)) return true;
  }
  for (const name of ctx.legacyNameKeys) {
    if (isWorkOrderAssignedToEmployeeName(order, name)) return true;
  }
  return false;
}

export function canUserAccessWorkOrder(
  user: JwtPayload,
  order: WorkOrderAssignmentFields,
  ctx: UserAssignmentContext,
): boolean {
  if (isDataPermissionBypassRole(effectiveRoles(user))) return true;
  if (!shouldApplyOwnDataFilter(user)) return true;

  const workOrderId = order.id;
  if (workOrderId != null && ctx.progressWorkOrderIds.has(workOrderId)) {
    return true;
  }

  if (ctx.linkedEmployeeId != null) {
    if (isWorkOrderAssignedToContext(order, ctx)) return true;
  }

  return false;
}

export function describeWorkOrderListQuery(params: {
  customerId?: string;
  status?: string;
  filterMode: "all" | "linked_employee" | "query_only";
  linkedEmployeeId?: number | null;
}): string {
  const parts: string[] = ["SELECT work_orders.* FROM work_orders"];
  const where: string[] = [];
  if (params.customerId) where.push(`customer_id = ${params.customerId}`);
  if (params.status) where.push(`status = '${params.status}'`);
  if (where.length > 0) parts.push(`WHERE ${where.join(" AND ")}`);
  parts.push("ORDER BY created_at");
  if (params.filterMode === "linked_employee") {
    parts.push(
      `→ post-filter: linkedEmployeeId=${params.linkedEmployeeId} employee name in assignedTo/assistantTo/technicians`,
    );
  } else if (params.filterMode === "all") {
    parts.push("→ no assignment filter (admin or shared engineer account)");
  }
  return parts.join(" ");
}

export function explainEmptyWorkOrderList(params: {
  totalBeforeFilter: number;
  totalAfterFilter: number;
  filterMode: "all" | "linked_employee" | "query_only";
  assignmentContext?: UserAssignmentContext;
}): string {
  if (params.totalAfterFilter > 0) return "有資料";

  if (params.totalBeforeFilter === 0) {
    return "資料庫無符合查詢條件的派工單（可能尚未建立或 status/customerId 篩選排除）";
  }

  if (params.filterMode === "all") {
    return "查詢條件錯誤或資料異常（此角色應可看到全部）";
  }

  if (params.filterMode === "linked_employee") {
    const ctx = params.assignmentContext;
    return [
      "linkedEmployeeId 指派比對後無符合派工單",
      `linkedEmployeeId: ${ctx?.linkedEmployeeId ?? "—"}`,
      `員工姓名: ${ctx?.employeeNames.join(", ") || "（找不到員工）"}`,
    ].join("；");
  }

  return "未知篩選模式";
}

export function logWorkOrderAccess(
  apiPath: string,
  user: JwtPayload | undefined,
  details: Record<string, unknown>,
): void {
  logger.info({
    event: "work_orders_access",
    apiPath,
    userId: user?.id ?? null,
    userName: user?.displayName ?? null,
    userRole: user?.role ?? null,
    userRoles: user ? effectiveRoles(user) : [],
    linkedEmployeeId: user?.linkedEmployeeId ?? null,
    ...details,
  }, apiPath);
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
