import { inArray, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { userHasNotificationTypeEnabled } from "../line/lineSubscriptionService.ts";
import type { NotificationPrefContext } from "../../../shared/notificationUserPrefs.ts";
import { effectiveRoleList, isManagerRole } from "../../../shared/notificationRolePermissions.ts";

export async function filterRecipientUserIdsByNotificationType(
  recipientUserIds: number[],
  notificationType: string,
  context?: NotificationPrefContext,
): Promise<number[]> {
  if (recipientUserIds.length === 0) return [];

  const rows = await db
    .select({
      id: usersTable.id,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, recipientUserIds));

  const activeIds = rows.filter(row => row.isActive).map(row => row.id);
  const enabled: number[] = [];

  for (const userId of activeIds) {
    if (await userHasNotificationTypeEnabled(userId, notificationType, context)) {
      enabled.push(userId);
    }
  }

  return enabled;
}

export async function listActiveManagerUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: usersTable.id, role: usersTable.role, roles: usersTable.roles, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  return rows
    .filter(row => {
      const roleList = effectiveRoleList(row.roles, row.role);
      return isManagerRole(roleList);
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
  return isManagerRole(roleList);
}
