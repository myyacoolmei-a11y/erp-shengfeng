import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db, userLineNotificationPrefsTable, usersTable } from "@workspace/db";
import {
  createLineBindingCode,
  getActiveBindingCodeForUser,
  maskLineUserId,
} from "./lineUserBinding.ts";
import {
  defaultLinePrefsForRoles,
  effectiveRoleList,
  isEngineerRole,
  isManagerRole,
  sanitizeLinePrefPatch,
  type LineNotificationPrefKey,
} from "../../../shared/notificationRolePermissions.ts";

export type LineNotificationPreferenceKey = LineNotificationPrefKey;

export interface LineSubscriberPrefs {
  receiveMorningBriefing: boolean;
  receiveEveningReminder: boolean;
  receivePendingDispatch: boolean;
  receiveQuoteFollowUp: boolean;
  receiveReceivableCollection: boolean;
  receiveWorkReminder60: boolean;
  receiveWorkReminder30: boolean;
  receiveWorkReminder15: boolean;
  receiveWorkReminder5: boolean;
  receivePastAppointment: boolean;
  receivePreviousJobIncomplete: boolean;
  receiveReadyForNextJob: boolean;
  receiveOneTapNavigation: boolean;
  receiveCompanyAnnouncement: boolean;
}

export interface LineSubscriber {
  userId: number;
  displayName: string;
  username: string;
  lineUserId: string;
  roles: string[];
  prefs: LineSubscriberPrefs;
}

function mapPrefsRow(row: Partial<LineSubscriberPrefs> | null, roleDefaults: LineSubscriberPrefs): LineSubscriberPrefs {
  return {
    receiveMorningBriefing: row?.receiveMorningBriefing ?? roleDefaults.receiveMorningBriefing,
    receiveEveningReminder: row?.receiveEveningReminder ?? roleDefaults.receiveEveningReminder,
    receivePendingDispatch: row?.receivePendingDispatch ?? roleDefaults.receivePendingDispatch,
    receiveQuoteFollowUp: row?.receiveQuoteFollowUp ?? roleDefaults.receiveQuoteFollowUp,
    receiveReceivableCollection: row?.receiveReceivableCollection ?? roleDefaults.receiveReceivableCollection,
    receiveWorkReminder60: row?.receiveWorkReminder60 ?? roleDefaults.receiveWorkReminder60,
    receiveWorkReminder30: row?.receiveWorkReminder30 ?? roleDefaults.receiveWorkReminder30,
    receiveWorkReminder15: row?.receiveWorkReminder15 ?? roleDefaults.receiveWorkReminder15,
    receiveWorkReminder5: row?.receiveWorkReminder5 ?? roleDefaults.receiveWorkReminder5,
    receivePastAppointment: row?.receivePastAppointment ?? roleDefaults.receivePastAppointment,
    receivePreviousJobIncomplete: row?.receivePreviousJobIncomplete ?? roleDefaults.receivePreviousJobIncomplete,
    receiveReadyForNextJob: row?.receiveReadyForNextJob ?? roleDefaults.receiveReadyForNextJob,
    receiveOneTapNavigation: row?.receiveOneTapNavigation ?? roleDefaults.receiveOneTapNavigation,
    receiveCompanyAnnouncement: row?.receiveCompanyAnnouncement ?? roleDefaults.receiveCompanyAnnouncement,
  };
}

async function getUserRoles(userId: number): Promise<string[]> {
  const [user] = await db
    .select({ role: usersTable.role, roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return effectiveRoleList(user?.roles, user?.role);
}

function roleCategory(roles: string[]): "manager" | "engineer" | "other" {
  if (isManagerRole(roles)) return "manager";
  if (isEngineerRole(roles)) return "engineer";
  return "other";
}

export async function ensureDefaultPrefsForUser(userId: number): Promise<void> {
  const roles = await getUserRoles(userId);
  const defaults = defaultLinePrefsForRoles(roles);
  await db
    .insert(userLineNotificationPrefsTable)
    .values({
      userId,
      ...defaults,
    })
    .onConflictDoNothing();
}

export async function getPrefsForUser(userId: number) {
  await ensureDefaultPrefsForUser(userId);
  const [row] = await db
    .select()
    .from(userLineNotificationPrefsTable)
    .where(eq(userLineNotificationPrefsTable.userId, userId));
  return row ?? null;
}

export async function updatePrefsForUser(
  userId: number,
  input: Partial<LineSubscriberPrefs>,
) {
  const roles = await getUserRoles(userId);
  const sanitized = sanitizeLinePrefPatch(roles, input as Partial<Record<LineNotificationPrefKey, boolean>>);
  if (Object.keys(sanitized).length === 0) {
    throw new Error("無權限修改此通知偏好");
  }
  await ensureDefaultPrefsForUser(userId);
  const [updated] = await db
    .update(userLineNotificationPrefsTable)
    .set(sanitized)
    .where(eq(userLineNotificationPrefsTable.userId, userId))
    .returning();
  return updated;
}

async function loadSubscribers(): Promise<LineSubscriber[]> {
  const rows = await db
    .select({
      userId: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      lineUserId: usersTable.lineUserId,
      role: usersTable.role,
      roles: usersTable.roles,
      receiveMorningBriefing: userLineNotificationPrefsTable.receiveMorningBriefing,
      receiveEveningReminder: userLineNotificationPrefsTable.receiveEveningReminder,
      receivePendingDispatch: userLineNotificationPrefsTable.receivePendingDispatch,
      receiveQuoteFollowUp: userLineNotificationPrefsTable.receiveQuoteFollowUp,
      receiveReceivableCollection: userLineNotificationPrefsTable.receiveReceivableCollection,
      receiveWorkReminder60: userLineNotificationPrefsTable.receiveWorkReminder60,
      receiveWorkReminder30: userLineNotificationPrefsTable.receiveWorkReminder30,
      receiveWorkReminder15: userLineNotificationPrefsTable.receiveWorkReminder15,
      receiveWorkReminder5: userLineNotificationPrefsTable.receiveWorkReminder5,
      receivePastAppointment: userLineNotificationPrefsTable.receivePastAppointment,
      receivePreviousJobIncomplete: userLineNotificationPrefsTable.receivePreviousJobIncomplete,
      receiveReadyForNextJob: userLineNotificationPrefsTable.receiveReadyForNextJob,
      receiveOneTapNavigation: userLineNotificationPrefsTable.receiveOneTapNavigation,
      receiveCompanyAnnouncement: userLineNotificationPrefsTable.receiveCompanyAnnouncement,
    })
    .from(usersTable)
    .leftJoin(
      userLineNotificationPrefsTable,
      eq(userLineNotificationPrefsTable.userId, usersTable.id),
    )
    .where(and(isNotNull(usersTable.lineUserId), ne(usersTable.lineUserId, "")));

  return rows
    .filter(row => row.lineUserId?.trim())
    .map(row => {
      const roles = effectiveRoleList(row.roles, row.role);
      const roleDefaults = defaultLinePrefsForRoles(roles);
      return {
        userId: row.userId,
        displayName: row.displayName,
        username: row.username,
        lineUserId: row.lineUserId!.trim(),
        roles,
        prefs: mapPrefsRow(row, roleDefaults),
      };
    });
}

function prefsToDto(prefs: LineSubscriberPrefs, lineLinked: boolean, roles: string[]) {
  return {
    lineLinked,
    roleCategory: roleCategory(roles),
    ...prefs,
  };
}

export async function listLineBindingOverviewForAdmin() {
  const users = await db
    .select({
      userId: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      lineUserId: usersTable.lineUserId,
      role: usersTable.role,
      roles: usersTable.roles,
      receiveMorningBriefing: userLineNotificationPrefsTable.receiveMorningBriefing,
      receiveEveningReminder: userLineNotificationPrefsTable.receiveEveningReminder,
      receivePendingDispatch: userLineNotificationPrefsTable.receivePendingDispatch,
      receiveQuoteFollowUp: userLineNotificationPrefsTable.receiveQuoteFollowUp,
      receiveReceivableCollection: userLineNotificationPrefsTable.receiveReceivableCollection,
      receiveWorkReminder60: userLineNotificationPrefsTable.receiveWorkReminder60,
      receiveWorkReminder30: userLineNotificationPrefsTable.receiveWorkReminder30,
      receiveWorkReminder15: userLineNotificationPrefsTable.receiveWorkReminder15,
      receiveWorkReminder5: userLineNotificationPrefsTable.receiveWorkReminder5,
      receivePastAppointment: userLineNotificationPrefsTable.receivePastAppointment,
      receivePreviousJobIncomplete: userLineNotificationPrefsTable.receivePreviousJobIncomplete,
      receiveReadyForNextJob: userLineNotificationPrefsTable.receiveReadyForNextJob,
      receiveOneTapNavigation: userLineNotificationPrefsTable.receiveOneTapNavigation,
      receiveCompanyAnnouncement: userLineNotificationPrefsTable.receiveCompanyAnnouncement,
    })
    .from(usersTable)
    .leftJoin(
      userLineNotificationPrefsTable,
      eq(userLineNotificationPrefsTable.userId, usersTable.id),
    )
    .orderBy(asc(usersTable.displayName));

  const rows = await Promise.all(
    users.map(async user => {
      const roles = effectiveRoleList(user.roles, user.role);
      const roleDefaults = defaultLinePrefsForRoles(roles);
      const prefs = mapPrefsRow(user, roleDefaults);
      const category = roleCategory(roles);
      const lineUserId = user.lineUserId?.trim() || null;
      if (lineUserId) {
        return {
          userId: user.userId,
          displayName: user.displayName,
          username: user.username,
          roleCategory: category,
          bindingStatus: "bound" as const,
          lineUserIdMasked: maskLineUserId(lineUserId),
          pendingCode: null,
          pendingExpiresAt: null,
          prefs,
        };
      }

      const pending = await getActiveBindingCodeForUser(user.userId);
      if (pending) {
        return {
          userId: user.userId,
          displayName: user.displayName,
          username: user.username,
          roleCategory: category,
          bindingStatus: "pending" as const,
          lineUserIdMasked: null,
          pendingCode: pending.code,
          pendingExpiresAt: pending.expiresAt.toISOString(),
          prefs: null,
        };
      }

      return {
        userId: user.userId,
        displayName: user.displayName,
        username: user.username,
        roleCategory: category,
        bindingStatus: "none" as const,
        lineUserIdMasked: null,
        pendingCode: null,
        pendingExpiresAt: null,
        prefs: null,
      };
    }),
  );

  return rows;
}

export async function adminRegenerateBindingCode(targetUserId: number) {
  const [user] = await db
    .select({ lineUserId: usersTable.lineUserId })
    .from(usersTable)
    .where(eq(usersTable.id, targetUserId));

  if (!user) throw new Error("找不到使用者");
  if (user.lineUserId?.trim()) throw new Error("使用者已綁定 LINE，請先解除綁定");

  const { code, expiresAt } = await createLineBindingCode(targetUserId);
  return {
    userId: targetUserId,
    code,
    expiresAt: expiresAt.toISOString(),
    instruction: `請在 LINE 對話輸入：綁定 ${code}`,
  };
}

export async function listSubscribersForMorningBriefing(): Promise<LineSubscriber[]> {
  return (await loadSubscribers()).filter(
    s =>
      isManagerRole(s.roles) &&
      (s.prefs.receiveMorningBriefing || s.prefs.receivePendingDispatch || s.prefs.receiveQuoteFollowUp),
  );
}

export async function listSubscribersForEveningReminder(): Promise<LineSubscriber[]> {
  return (await loadSubscribers()).filter(
    s => isManagerRole(s.roles) && s.prefs.receiveEveningReminder,
  );
}

export async function listSubscribersForReceivableCollection(): Promise<LineSubscriber[]> {
  return (await loadSubscribers()).filter(
    s => isManagerRole(s.roles) && s.prefs.receiveReceivableCollection,
  );
}

export async function getSubscriberForUser(userId: number): Promise<LineSubscriber | null> {
  const [row] = await db
    .select({
      userId: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      lineUserId: usersTable.lineUserId,
      role: usersTable.role,
      roles: usersTable.roles,
      receiveMorningBriefing: userLineNotificationPrefsTable.receiveMorningBriefing,
      receiveEveningReminder: userLineNotificationPrefsTable.receiveEveningReminder,
      receivePendingDispatch: userLineNotificationPrefsTable.receivePendingDispatch,
      receiveQuoteFollowUp: userLineNotificationPrefsTable.receiveQuoteFollowUp,
      receiveReceivableCollection: userLineNotificationPrefsTable.receiveReceivableCollection,
      receiveWorkReminder60: userLineNotificationPrefsTable.receiveWorkReminder60,
      receiveWorkReminder30: userLineNotificationPrefsTable.receiveWorkReminder30,
      receiveWorkReminder15: userLineNotificationPrefsTable.receiveWorkReminder15,
      receiveWorkReminder5: userLineNotificationPrefsTable.receiveWorkReminder5,
      receivePastAppointment: userLineNotificationPrefsTable.receivePastAppointment,
      receivePreviousJobIncomplete: userLineNotificationPrefsTable.receivePreviousJobIncomplete,
      receiveReadyForNextJob: userLineNotificationPrefsTable.receiveReadyForNextJob,
      receiveOneTapNavigation: userLineNotificationPrefsTable.receiveOneTapNavigation,
      receiveCompanyAnnouncement: userLineNotificationPrefsTable.receiveCompanyAnnouncement,
    })
    .from(usersTable)
    .leftJoin(
      userLineNotificationPrefsTable,
      eq(userLineNotificationPrefsTable.userId, usersTable.id),
    )
    .where(eq(usersTable.id, userId));

  if (!row?.lineUserId?.trim()) return null;
  const roles = effectiveRoleList(row.roles, row.role);
  return {
    userId: row.userId,
    displayName: row.displayName,
    username: row.username,
    lineUserId: row.lineUserId.trim(),
    roles,
    prefs: mapPrefsRow(row, defaultLinePrefsForRoles(roles)),
  };
}

export async function adminUnbindLineUser(targetUserId: number): Promise<void> {
  await db.update(usersTable).set({ lineUserId: null }).where(eq(usersTable.id, targetUserId));
}

export async function getMyLineNotificationPrefsDto(userId: number) {
  const roles = await getUserRoles(userId);
  await ensureDefaultPrefsForUser(userId);
  const prefs = await getPrefsForUser(userId);
  const subscriber = await getSubscriberForUser(userId);
  const mapped = mapPrefsRow(prefs, defaultLinePrefsForRoles(roles));
  return prefsToDto(mapped, Boolean(subscriber), roles);
}

export async function updateMyLineNotificationPrefs(
  userId: number,
  input: Partial<LineSubscriberPrefs>,
) {
  const roles = await getUserRoles(userId);
  const updated = await updatePrefsForUser(userId, input);
  const subscriber = await getSubscriberForUser(userId);
  const mapped = mapPrefsRow(updated, defaultLinePrefsForRoles(roles));
  return prefsToDto(mapped, Boolean(subscriber), roles);
}

export async function clearLineUserFromOthers(lineUserId: string, keepUserId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ lineUserId: null })
    .where(and(eq(usersTable.lineUserId, lineUserId), ne(usersTable.id, keepUserId)));
}

export async function getWorkReminderPrefForUser(
  userId: number,
  prefKey: LineNotificationPrefKey,
): Promise<boolean> {
  const roles = await getUserRoles(userId);
  const allowedKeys = sanitizeLinePrefPatch(roles, { [prefKey]: true });
  if (!(prefKey in allowedKeys)) return false;
  const prefs = await getPrefsForUser(userId);
  const mapped = mapPrefsRow(prefs, defaultLinePrefsForRoles(roles));
  return Boolean(mapped[prefKey as keyof LineSubscriberPrefs]);
}
