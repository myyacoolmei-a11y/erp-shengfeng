import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db, userLineNotificationPrefsTable, usersTable } from "@workspace/db";
import {
  createLineBindingCode,
  getActiveBindingCodeForUser,
  maskLineUserId,
} from "./lineUserBinding.ts";
import {
  defaultUserNotificationPrefs,
  sanitizeNotificationPrefPatch,
  type UserNotificationPrefs,
  type NotificationPrefKey,
  isNotificationTypeEnabled,
  type NotificationPrefContext,
} from "../../../shared/notificationUserPrefs.ts";

export type LineSubscriberPrefs = UserNotificationPrefs;

export interface LineSubscriber {
  userId: number;
  displayName: string;
  username: string;
  lineUserId: string;
  prefs: LineSubscriberPrefs;
}

type DbPrefRow = Partial<UserNotificationPrefs> & {
  receivePendingDispatch?: boolean | null;
  receiveWorkReminder60?: boolean | null;
  receiveWorkReminder30?: boolean | null;
  receiveWorkReminder15?: boolean | null;
  receiveWorkReminder5?: boolean | null;
  receivePastAppointment?: boolean | null;
  receivePreviousJobIncomplete?: boolean | null;
  receiveReadyForNextJob?: boolean | null;
  receiveOneTapNavigation?: boolean | null;
};

function mapDbRowToUserPrefs(row: DbPrefRow | null): UserNotificationPrefs {
  const defaults = defaultUserNotificationPrefs();
  if (!row) return defaults;
  return {
    receiveMorningBriefing: row.receiveMorningBriefing ?? defaults.receiveMorningBriefing,
    receiveEveningReminder: row.receiveEveningReminder ?? defaults.receiveEveningReminder,
    receiveAiWorkReminder: row.receiveAiWorkReminder != null
      ? row.receiveAiWorkReminder
      : Boolean(row.receivePastAppointment || row.receivePreviousJobIncomplete || row.receiveReadyForNextJob),
    receiveNextJobReminder: row.receiveNextJobReminder != null
      ? row.receiveNextJobReminder
      : Boolean(row.receiveWorkReminder60 || row.receiveWorkReminder30 || row.receiveWorkReminder15 || row.receiveWorkReminder5),
    receiveFieldDepart: row.receiveFieldDepart ?? defaults.receiveFieldDepart,
    receiveFieldArrive: row.receiveFieldArrive ?? defaults.receiveFieldArrive,
    receiveFieldComplete: row.receiveFieldComplete ?? defaults.receiveFieldComplete,
    receiveFieldDelay: row.receiveFieldDelay ?? defaults.receiveFieldDelay,
    receiveReceivableCollection: row.receiveReceivableCollection ?? defaults.receiveReceivableCollection,
    receiveAccountsReceivable: row.receiveAccountsReceivable ?? defaults.receiveAccountsReceivable,
    receiveQuoteFollowUp: row.receiveQuoteFollowUp ?? defaults.receiveQuoteFollowUp,
    receiveLeaveRequest: row.receiveLeaveRequest ?? defaults.receiveLeaveRequest,
    receiveCompanyAnnouncement: row.receiveCompanyAnnouncement ?? defaults.receiveCompanyAnnouncement,
  };
}

function expandPrefPatchForDb(patch: Partial<UserNotificationPrefs>): Record<string, boolean> {
  const sanitized = sanitizeNotificationPrefPatch(patch);
  const out: Record<string, boolean> = { ...sanitized };

  if (typeof sanitized.receiveNextJobReminder === "boolean") {
    const v = sanitized.receiveNextJobReminder;
    out.receiveWorkReminder60 = v;
    out.receiveWorkReminder30 = v;
    out.receiveWorkReminder15 = v;
    out.receiveWorkReminder5 = v;
  }
  if (typeof sanitized.receiveAiWorkReminder === "boolean") {
    const v = sanitized.receiveAiWorkReminder;
    out.receivePastAppointment = v;
    out.receivePreviousJobIncomplete = v;
    out.receiveReadyForNextJob = v;
    out.receiveOneTapNavigation = v;
  }
  if (typeof sanitized.receiveMorningBriefing === "boolean") {
    out.receivePendingDispatch = sanitized.receiveMorningBriefing;
  }

  return out;
}

export async function ensureDefaultPrefsForUser(userId: number): Promise<void> {
  const defaults = defaultUserNotificationPrefs();
  await db
    .insert(userLineNotificationPrefsTable)
    .values({
      userId,
      ...defaults,
      receivePendingDispatch: false,
      receiveWorkReminder60: false,
      receiveWorkReminder30: false,
      receiveWorkReminder15: false,
      receiveWorkReminder5: false,
      receivePastAppointment: false,
      receivePreviousJobIncomplete: false,
      receiveReadyForNextJob: false,
      receiveOneTapNavigation: false,
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

export async function getUserNotificationPrefsDto(userId: number): Promise<UserNotificationPrefs> {
  const row = await getPrefsForUser(userId);
  return mapDbRowToUserPrefs(row);
}

export async function updatePrefsForUser(
  userId: number,
  input: Partial<UserNotificationPrefs>,
) {
  const expanded = expandPrefPatchForDb(input);
  if (Object.keys(expanded).length === 0) {
    throw new Error("無有效的通知偏好欄位");
  }
  await ensureDefaultPrefsForUser(userId);
  const [updated] = await db
    .update(userLineNotificationPrefsTable)
    .set(expanded)
    .where(eq(userLineNotificationPrefsTable.userId, userId))
    .returning();
  return mapDbRowToUserPrefs(updated);
}

async function loadSubscribers(): Promise<LineSubscriber[]> {
  const rows = await db
    .select({
      userId: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      lineUserId: usersTable.lineUserId,
      receiveMorningBriefing: userLineNotificationPrefsTable.receiveMorningBriefing,
      receiveEveningReminder: userLineNotificationPrefsTable.receiveEveningReminder,
      receivePendingDispatch: userLineNotificationPrefsTable.receivePendingDispatch,
      receiveQuoteFollowUp: userLineNotificationPrefsTable.receiveQuoteFollowUp,
      receiveReceivableCollection: userLineNotificationPrefsTable.receiveReceivableCollection,
      receiveAccountsReceivable: userLineNotificationPrefsTable.receiveAccountsReceivable,
      receiveAiWorkReminder: userLineNotificationPrefsTable.receiveAiWorkReminder,
      receiveNextJobReminder: userLineNotificationPrefsTable.receiveNextJobReminder,
      receiveFieldDepart: userLineNotificationPrefsTable.receiveFieldDepart,
      receiveFieldArrive: userLineNotificationPrefsTable.receiveFieldArrive,
      receiveFieldComplete: userLineNotificationPrefsTable.receiveFieldComplete,
      receiveFieldDelay: userLineNotificationPrefsTable.receiveFieldDelay,
      receiveLeaveRequest: userLineNotificationPrefsTable.receiveLeaveRequest,
      receiveCompanyAnnouncement: userLineNotificationPrefsTable.receiveCompanyAnnouncement,
      receiveWorkReminder60: userLineNotificationPrefsTable.receiveWorkReminder60,
      receiveWorkReminder30: userLineNotificationPrefsTable.receiveWorkReminder30,
      receiveWorkReminder15: userLineNotificationPrefsTable.receiveWorkReminder15,
      receiveWorkReminder5: userLineNotificationPrefsTable.receiveWorkReminder5,
      receivePastAppointment: userLineNotificationPrefsTable.receivePastAppointment,
      receivePreviousJobIncomplete: userLineNotificationPrefsTable.receivePreviousJobIncomplete,
      receiveReadyForNextJob: userLineNotificationPrefsTable.receiveReadyForNextJob,
      receiveOneTapNavigation: userLineNotificationPrefsTable.receiveOneTapNavigation,
    })
    .from(usersTable)
    .leftJoin(
      userLineNotificationPrefsTable,
      eq(userLineNotificationPrefsTable.userId, usersTable.id),
    )
    .where(and(isNotNull(usersTable.lineUserId), ne(usersTable.lineUserId, "")));

  return rows
    .filter(row => row.lineUserId?.trim())
    .map(row => ({
      userId: row.userId,
      displayName: row.displayName,
      username: row.username,
      lineUserId: row.lineUserId!.trim(),
      prefs: mapDbRowToUserPrefs(row),
    }));
}

function prefsToDto(prefs: UserNotificationPrefs, lineLinked: boolean) {
  return {
    lineLinked,
    canEdit: false,
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
      receiveMorningBriefing: userLineNotificationPrefsTable.receiveMorningBriefing,
      receiveEveningReminder: userLineNotificationPrefsTable.receiveEveningReminder,
      receivePendingDispatch: userLineNotificationPrefsTable.receivePendingDispatch,
      receiveQuoteFollowUp: userLineNotificationPrefsTable.receiveQuoteFollowUp,
      receiveReceivableCollection: userLineNotificationPrefsTable.receiveReceivableCollection,
      receiveAccountsReceivable: userLineNotificationPrefsTable.receiveAccountsReceivable,
      receiveAiWorkReminder: userLineNotificationPrefsTable.receiveAiWorkReminder,
      receiveNextJobReminder: userLineNotificationPrefsTable.receiveNextJobReminder,
      receiveFieldDepart: userLineNotificationPrefsTable.receiveFieldDepart,
      receiveFieldArrive: userLineNotificationPrefsTable.receiveFieldArrive,
      receiveFieldComplete: userLineNotificationPrefsTable.receiveFieldComplete,
      receiveFieldDelay: userLineNotificationPrefsTable.receiveFieldDelay,
      receiveLeaveRequest: userLineNotificationPrefsTable.receiveLeaveRequest,
      receiveCompanyAnnouncement: userLineNotificationPrefsTable.receiveCompanyAnnouncement,
      receiveWorkReminder60: userLineNotificationPrefsTable.receiveWorkReminder60,
      receiveWorkReminder30: userLineNotificationPrefsTable.receiveWorkReminder30,
      receiveWorkReminder15: userLineNotificationPrefsTable.receiveWorkReminder15,
      receiveWorkReminder5: userLineNotificationPrefsTable.receiveWorkReminder5,
      receivePastAppointment: userLineNotificationPrefsTable.receivePastAppointment,
      receivePreviousJobIncomplete: userLineNotificationPrefsTable.receivePreviousJobIncomplete,
      receiveReadyForNextJob: userLineNotificationPrefsTable.receiveReadyForNextJob,
      receiveOneTapNavigation: userLineNotificationPrefsTable.receiveOneTapNavigation,
    })
    .from(usersTable)
    .leftJoin(
      userLineNotificationPrefsTable,
      eq(userLineNotificationPrefsTable.userId, usersTable.id),
    )
    .orderBy(asc(usersTable.displayName));

  const rows = await Promise.all(
    users.map(async user => {
      const prefs = mapDbRowToUserPrefs(user);
      const lineUserId = user.lineUserId?.trim() || null;
      if (lineUserId) {
        return {
          userId: user.userId,
          displayName: user.displayName,
          username: user.username,
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
          bindingStatus: "pending" as const,
          lineUserIdMasked: null,
          pendingCode: pending.code,
          pendingExpiresAt: pending.expiresAt.toISOString(),
          prefs,
        };
      }

      return {
        userId: user.userId,
        displayName: user.displayName,
        username: user.username,
        bindingStatus: "none" as const,
        lineUserIdMasked: null,
        pendingCode: null,
        pendingExpiresAt: null,
        prefs,
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
      s.prefs.receiveMorningBriefing
      || s.prefs.receiveQuoteFollowUp
      || s.prefs.receiveAccountsReceivable,
  );
}

export async function listSubscribersForEveningReminder(): Promise<LineSubscriber[]> {
  return (await loadSubscribers()).filter(
    s => s.prefs.receiveEveningReminder || s.prefs.receiveAccountsReceivable,
  );
}

export async function listSubscribersForReceivableCollection(): Promise<LineSubscriber[]> {
  return (await loadSubscribers()).filter(s => s.prefs.receiveReceivableCollection);
}

export async function getSubscriberForUser(userId: number): Promise<LineSubscriber | null> {
  const [row] = await db
    .select({
      userId: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      lineUserId: usersTable.lineUserId,
      receiveMorningBriefing: userLineNotificationPrefsTable.receiveMorningBriefing,
      receiveEveningReminder: userLineNotificationPrefsTable.receiveEveningReminder,
      receivePendingDispatch: userLineNotificationPrefsTable.receivePendingDispatch,
      receiveQuoteFollowUp: userLineNotificationPrefsTable.receiveQuoteFollowUp,
      receiveReceivableCollection: userLineNotificationPrefsTable.receiveReceivableCollection,
      receiveAccountsReceivable: userLineNotificationPrefsTable.receiveAccountsReceivable,
      receiveAiWorkReminder: userLineNotificationPrefsTable.receiveAiWorkReminder,
      receiveNextJobReminder: userLineNotificationPrefsTable.receiveNextJobReminder,
      receiveFieldDepart: userLineNotificationPrefsTable.receiveFieldDepart,
      receiveFieldArrive: userLineNotificationPrefsTable.receiveFieldArrive,
      receiveFieldComplete: userLineNotificationPrefsTable.receiveFieldComplete,
      receiveFieldDelay: userLineNotificationPrefsTable.receiveFieldDelay,
      receiveLeaveRequest: userLineNotificationPrefsTable.receiveLeaveRequest,
      receiveCompanyAnnouncement: userLineNotificationPrefsTable.receiveCompanyAnnouncement,
      receiveWorkReminder60: userLineNotificationPrefsTable.receiveWorkReminder60,
      receiveWorkReminder30: userLineNotificationPrefsTable.receiveWorkReminder30,
      receiveWorkReminder15: userLineNotificationPrefsTable.receiveWorkReminder15,
      receiveWorkReminder5: userLineNotificationPrefsTable.receiveWorkReminder5,
      receivePastAppointment: userLineNotificationPrefsTable.receivePastAppointment,
      receivePreviousJobIncomplete: userLineNotificationPrefsTable.receivePreviousJobIncomplete,
      receiveReadyForNextJob: userLineNotificationPrefsTable.receiveReadyForNextJob,
      receiveOneTapNavigation: userLineNotificationPrefsTable.receiveOneTapNavigation,
    })
    .from(usersTable)
    .leftJoin(
      userLineNotificationPrefsTable,
      eq(userLineNotificationPrefsTable.userId, usersTable.id),
    )
    .where(eq(usersTable.id, userId));

  if (!row?.lineUserId?.trim()) return null;
  return {
    userId: row.userId,
    displayName: row.displayName,
    username: row.username,
    lineUserId: row.lineUserId.trim(),
    prefs: mapDbRowToUserPrefs(row),
  };
}

export async function adminUnbindLineUser(targetUserId: number): Promise<void> {
  await db.update(usersTable).set({ lineUserId: null }).where(eq(usersTable.id, targetUserId));
}

export async function getMyLineNotificationPrefsDto(userId: number) {
  await ensureDefaultPrefsForUser(userId);
  const prefs = await getUserNotificationPrefsDto(userId);
  const subscriber = await getSubscriberForUser(userId);
  return prefsToDto(prefs, Boolean(subscriber));
}

export async function adminUpdateUserNotificationPrefs(
  userId: number,
  input: Partial<UserNotificationPrefs>,
) {
  const updated = await updatePrefsForUser(userId, input);
  const subscriber = await getSubscriberForUser(userId);
  return prefsToDto(updated, Boolean(subscriber));
}

export async function clearLineUserFromOthers(lineUserId: string, keepUserId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ lineUserId: null })
    .where(and(eq(usersTable.lineUserId, lineUserId), ne(usersTable.id, keepUserId)));
}

export async function userHasNotificationTypeEnabled(
  userId: number,
  notificationType: string,
  context?: NotificationPrefContext,
): Promise<boolean> {
  const prefs = await getUserNotificationPrefsDto(userId);
  return isNotificationTypeEnabled(prefs, notificationType, context);
}

/** @deprecated */
export async function getWorkReminderPrefForUser(
  userId: number,
  _prefKey: NotificationPrefKey,
): Promise<boolean> {
  const prefs = await getUserNotificationPrefsDto(userId);
  return Boolean(prefs.receiveNextJobReminder || prefs.receiveAiWorkReminder);
}
