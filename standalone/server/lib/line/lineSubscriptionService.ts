import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db, userLineNotificationPrefsTable, usersTable } from "@workspace/db";
import {
  createLineBindingCode,
  getActiveBindingCodeForUser,
  maskLineUserId,
} from "./lineUserBinding.ts";

export type LineNotificationPreferenceKey =
  | "receiveMorningBriefing"
  | "receiveEveningReminder"
  | "receivePendingDispatch"
  | "receiveQuoteFollowUp"
  | "receiveReceivableCollection";

export interface LineSubscriber {
  userId: number;
  displayName: string;
  username: string;
  lineUserId: string;
  prefs: {
    receiveMorningBriefing: boolean;
    receiveEveningReminder: boolean;
    receivePendingDispatch: boolean;
    receiveQuoteFollowUp: boolean;
    receiveReceivableCollection: boolean;
  };
}

const DEFAULT_PREFS = {
  receiveMorningBriefing: true,
  receiveEveningReminder: true,
  receivePendingDispatch: true,
  receiveQuoteFollowUp: true,
  receiveReceivableCollection: true,
};

export async function ensureDefaultPrefsForUser(userId: number): Promise<void> {
  await db
    .insert(userLineNotificationPrefsTable)
    .values({ userId })
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
  input: Partial<typeof DEFAULT_PREFS>,
) {
  await ensureDefaultPrefsForUser(userId);
  const [updated] = await db
    .update(userLineNotificationPrefsTable)
    .set(input)
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
      receiveMorningBriefing: userLineNotificationPrefsTable.receiveMorningBriefing,
      receiveEveningReminder: userLineNotificationPrefsTable.receiveEveningReminder,
      receivePendingDispatch: userLineNotificationPrefsTable.receivePendingDispatch,
      receiveQuoteFollowUp: userLineNotificationPrefsTable.receiveQuoteFollowUp,
      receiveReceivableCollection: userLineNotificationPrefsTable.receiveReceivableCollection,
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
      prefs: {
        receiveMorningBriefing: row.receiveMorningBriefing ?? DEFAULT_PREFS.receiveMorningBriefing,
        receiveEveningReminder: row.receiveEveningReminder ?? DEFAULT_PREFS.receiveEveningReminder,
        receivePendingDispatch: row.receivePendingDispatch ?? DEFAULT_PREFS.receivePendingDispatch,
        receiveQuoteFollowUp: row.receiveQuoteFollowUp ?? DEFAULT_PREFS.receiveQuoteFollowUp,
        receiveReceivableCollection: row.receiveReceivableCollection ?? DEFAULT_PREFS.receiveReceivableCollection,
      },
    }));
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
    })
    .from(usersTable)
    .leftJoin(
      userLineNotificationPrefsTable,
      eq(userLineNotificationPrefsTable.userId, usersTable.id),
    )
    .orderBy(asc(usersTable.displayName));

  const rows = await Promise.all(
    users.map(async user => {
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
          prefs: {
            receiveMorningBriefing: user.receiveMorningBriefing ?? DEFAULT_PREFS.receiveMorningBriefing,
            receiveEveningReminder: user.receiveEveningReminder ?? DEFAULT_PREFS.receiveEveningReminder,
            receivePendingDispatch: user.receivePendingDispatch ?? DEFAULT_PREFS.receivePendingDispatch,
            receiveQuoteFollowUp: user.receiveQuoteFollowUp ?? DEFAULT_PREFS.receiveQuoteFollowUp,
            receiveReceivableCollection: user.receiveReceivableCollection ?? DEFAULT_PREFS.receiveReceivableCollection,
          },
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
          prefs: null,
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
        prefs: null,
      };
    }),
  );

  return rows;
}

/** @deprecated Use listLineBindingOverviewForAdmin */
export async function listLineSubscribersForAdmin() {
  const subscribers = await loadSubscribers();
  return subscribers.map(subscriber => ({
    userId: subscriber.userId,
    displayName: subscriber.displayName,
    username: subscriber.username,
    bindingStatus: "bound" as const,
    lineUserIdMasked: maskLineUserId(subscriber.lineUserId),
    pendingCode: null,
    pendingExpiresAt: null,
    prefs: subscriber.prefs,
  }));
}

export async function adminRegenerateBindingCode(targetUserId: number) {
  const [user] = await db
    .select({ lineUserId: usersTable.lineUserId })
    .from(usersTable)
    .where(eq(usersTable.id, targetUserId));

  if (!user) {
    throw new Error("找不到使用者");
  }

  if (user.lineUserId?.trim()) {
    throw new Error("使用者已綁定 LINE，請先解除綁定");
  }

  const { code, expiresAt } = await createLineBindingCode(targetUserId);
  return {
    userId: targetUserId,
    code,
    expiresAt: expiresAt.toISOString(),
    instruction: `請在 LINE 對話輸入：綁定 ${code}`,
  };
}

export async function listSubscribersForMorningBriefing(): Promise<LineSubscriber[]> {
  const subscribers = await loadSubscribers();
  return subscribers.filter(
    s =>
      s.prefs.receiveMorningBriefing ||
      s.prefs.receivePendingDispatch ||
      s.prefs.receiveQuoteFollowUp,
  );
}

export async function listSubscribersForEveningReminder(): Promise<LineSubscriber[]> {
  return (await loadSubscribers()).filter(s => s.prefs.receiveEveningReminder);
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
    prefs: {
      receiveMorningBriefing: row.receiveMorningBriefing ?? true,
      receiveEveningReminder: row.receiveEveningReminder ?? true,
      receivePendingDispatch: row.receivePendingDispatch ?? true,
      receiveQuoteFollowUp: row.receiveQuoteFollowUp ?? true,
      receiveReceivableCollection: row.receiveReceivableCollection ?? true,
    },
  };
}

export async function adminUnbindLineUser(targetUserId: number): Promise<void> {
  await db.update(usersTable).set({ lineUserId: null }).where(eq(usersTable.id, targetUserId));
}

export async function getMyLineNotificationPrefsDto(userId: number) {
  await ensureDefaultPrefsForUser(userId);
  const prefs = await getPrefsForUser(userId);
  const subscriber = await getSubscriberForUser(userId);

  return {
    lineLinked: Boolean(subscriber),
    receiveMorningBriefing: prefs?.receiveMorningBriefing ?? DEFAULT_PREFS.receiveMorningBriefing,
    receiveEveningReminder: prefs?.receiveEveningReminder ?? DEFAULT_PREFS.receiveEveningReminder,
    receivePendingDispatch: prefs?.receivePendingDispatch ?? DEFAULT_PREFS.receivePendingDispatch,
    receiveQuoteFollowUp: prefs?.receiveQuoteFollowUp ?? DEFAULT_PREFS.receiveQuoteFollowUp,
    receiveReceivableCollection: prefs?.receiveReceivableCollection ?? DEFAULT_PREFS.receiveReceivableCollection,
  };
}

export async function updateMyLineNotificationPrefs(
  userId: number,
  input: Partial<typeof DEFAULT_PREFS>,
) {
  const updated = await updatePrefsForUser(userId, input);
  const subscriber = await getSubscriberForUser(userId);
  return {
    lineLinked: Boolean(subscriber),
    receiveMorningBriefing: updated.receiveMorningBriefing,
    receiveEveningReminder: updated.receiveEveningReminder,
    receivePendingDispatch: updated.receivePendingDispatch,
    receiveQuoteFollowUp: updated.receiveQuoteFollowUp,
    receiveReceivableCollection: updated.receiveReceivableCollection,
  };
}

export async function clearLineUserFromOthers(lineUserId: string, keepUserId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ lineUserId: null })
    .where(and(eq(usersTable.lineUserId, lineUserId), ne(usersTable.id, keepUserId)));
}
