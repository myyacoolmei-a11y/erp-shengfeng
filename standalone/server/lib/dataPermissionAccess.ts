import { eq, isNotNull } from "drizzle-orm";
import { db, workOrdersTable } from "@workspace/db";
import type { JwtPayload } from "./auth.ts";
import { shouldApplyOwnDataFilter } from "../../shared/userPermissions.ts";
import {
  buildUserAssignmentContext,
  canUserAccessWorkOrder,
  type UserAssignmentContext,
  type WorkOrderAssignmentFields,
} from "./workOrders/workOrderAssignment.ts";

export interface RepairCaseAssignmentFields {
  employeeId: number | null;
  employeeName?: string | null;
}

function normalizeKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export function canAccessRepairCase(
  user: JwtPayload,
  repairCase: RepairCaseAssignmentFields,
  ctx: UserAssignmentContext,
): boolean {
  if (!shouldApplyOwnDataFilter(user)) return true;
  if (repairCase.employeeId == null) return false;

  // 主要：linkedEmployeeId 比對
  if (ctx.linkedEmployeeId != null) {
    if (repairCase.employeeId === ctx.linkedEmployeeId) return true;
    // 舊資料備援：employeeId 不一致但員工姓名符合關聯員工
    const name = normalizeKey(repairCase.employeeName);
    if (name != null && ctx.employeeNames.includes(name)) return true;
    return false;
  }

  // 未關聯員工：不允許存取（避免姓名誤比對）
  return false;
}

export async function assertWorkOrderDataAccess(
  user: JwtPayload,
  order: WorkOrderAssignmentFields,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!shouldApplyOwnDataFilter(user)) return { ok: true };
  const ctx = await buildUserAssignmentContext(user);
  if (canUserAccessWorkOrder(user, order, ctx)) return { ok: true };
  return { ok: false, message: "您沒有權限存取此派工單" };
}

export async function assertRepairCaseDataAccess(
  user: JwtPayload,
  repairCase: RepairCaseAssignmentFields,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!shouldApplyOwnDataFilter(user)) return { ok: true };
  const ctx = await buildUserAssignmentContext(user);
  if (canAccessRepairCase(user, repairCase, ctx)) return { ok: true };
  return { ok: false, message: "您沒有權限存取此維修案件" };
}

/** 保養提醒：own 使用者僅能看見「有指派給自己的派工單」所屬客戶的提醒 */
export async function getAssignedCustomerIds(user: JwtPayload): Promise<Set<number> | null> {
  if (!shouldApplyOwnDataFilter(user)) return null;

  const ctx = await buildUserAssignmentContext(user);
  const orders = await db
    .select({
      id: workOrdersTable.id,
      customerId: workOrdersTable.customerId,
      assignedTo: workOrdersTable.assignedTo,
      assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians,
    })
    .from(workOrdersTable)
    .where(isNotNull(workOrdersTable.customerId));

  const ids = new Set<number>();
  for (const order of orders) {
    if (order.customerId == null) continue;
    if (canUserAccessWorkOrder(user, order, ctx)) {
      ids.add(order.customerId);
    }
  }
  return ids;
}

export async function assertMaintenanceReminderDataAccess(
  user: JwtPayload,
  customerId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const allowed = await getAssignedCustomerIds(user);
  if (allowed === null) return { ok: true };
  if (allowed.has(customerId)) return { ok: true };
  return { ok: false, message: "您沒有權限存取此保養提醒" };
}
