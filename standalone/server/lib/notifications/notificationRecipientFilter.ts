import { inArray, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  effectiveRoleList,
  rolesCanReceiveNotificationType,
  getNotificationCategory,
  rolesCanReceiveCategory,
  MANAGER_ROLES,
} from "../../../shared/notificationRolePermissions.ts";

export async function filterRecipientUserIdsByNotificationType(
  recipientUserIds: number[],
  notificationType: string,
): Promise<number[]> {
  if (recipientUserIds.length === 0) return [];

  const rows = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      roles: usersTable.roles,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, recipientUserIds));

  return rows
    .filter(row => row.isActive)
    .filter(row => {
      const roleList = effectiveRoleList(row.roles, row.role);
      return rolesCanReceiveNotificationType(roleList, notificationType);
    })
    .map(row => row.id);
}

export async function listActiveManagerUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: usersTable.id, role: usersTable.role, roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  return rows
    .filter(row => {
      const roleList = effectiveRoleList(row.roles, row.role);
      return rolesCanReceiveCategory(roleList, "management");
    })
    .map(row => row.id);
}

export async function userHasManagerRole(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ role: usersTable.role, roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!row) return false;
  const roleList = effectiveRoleList(row.roles, row.role);
  return roleList.some(r => (MANAGER_ROLES as readonly string[]).includes(r));
}
