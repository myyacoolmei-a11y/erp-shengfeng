import { eq } from "drizzle-orm";
import { db, notificationSettingsTable, usersTable } from "@workspace/db";
import { RECEIVABLE_COLLECTION_KIND } from "../../../shared/reminders/types.ts";
import { logger } from "../logger.ts";
import { getLineUserProfile, replyLineMessage } from "./lineMessaging.ts";

export async function prepareLineLinkForUser(erpUserId: number): Promise<void> {
  await db
    .update(notificationSettingsTable)
    .set({ pendingLinkUserId: erpUserId })
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));
}

export async function clearPendingLineLink(): Promise<void> {
  await db
    .update(notificationSettingsTable)
    .set({ pendingLinkUserId: null })
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));
}

export async function bindLineUserOnFollow(opts: {
  lineUserId: string;
  replyToken?: string;
}): Promise<{ bound: boolean; erpUserId?: number; displayName?: string }> {
  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));

  if (!settings) {
    logger.warn({ lineUserId: opts.lineUserId }, "LINE follow: notification settings missing");
    return { bound: false };
  }

  const pendingUserId = settings.pendingLinkUserId;
  if (!pendingUserId) {
    logger.info({ lineUserId: opts.lineUserId }, "LINE follow: no pending ERP user to bind");
    if (opts.replyToken) {
      await replyLineMessage({
        replyToken: opts.replyToken,
        text: "您好！請先在 ERP「AI 收款秘書」頁面按「連結我的 LINE」，再重新加入好友以完成綁定。",
      }).catch(err => logger.warn({ err }, "LINE follow reply failed"));
    }
    return { bound: false };
  }

  const [erpUser] = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, pendingUserId));

  if (!erpUser) {
    await clearPendingLineLink();
    return { bound: false };
  }

  await db
    .update(usersTable)
    .set({ lineUserId: opts.lineUserId })
    .where(eq(usersTable.id, erpUser.id));

  await db
    .update(notificationSettingsTable)
    .set({
      lineUserId: opts.lineUserId,
      pendingLinkUserId: null,
    })
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));

  const profile = await getLineUserProfile(opts.lineUserId);
  logger.info(
    { erpUserId: erpUser.id, lineUserId: opts.lineUserId, lineName: profile?.displayName },
    "LINE user bound to ERP user",
  );

  if (opts.replyToken) {
    await replyLineMessage({
      replyToken: opts.replyToken,
      text: `✅ 已成功連結晟風 ERP（${erpUser.displayName}）\n您將收到 AI 收款秘書的每日提醒。`,
    }).catch(err => logger.warn({ err }, "LINE follow reply failed"));
  }

  return { bound: true, erpUserId: erpUser.id, displayName: erpUser.displayName };
}

export async function getLineBindingInfo(): Promise<{
  lineUserId: string | null;
  linkedUserId: number | null;
  linkedDisplayName: string | null;
  pendingLinkUserId: number | null;
}> {
  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));

  if (!settings?.lineUserId) {
    return {
      lineUserId: null,
      linkedUserId: settings?.pendingLinkUserId ?? null,
      linkedDisplayName: null,
      pendingLinkUserId: settings?.pendingLinkUserId ?? null,
    };
  }

  const [user] = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.lineUserId, settings.lineUserId));

  return {
    lineUserId: settings.lineUserId,
    linkedUserId: user?.id ?? null,
    linkedDisplayName: user?.displayName ?? null,
    pendingLinkUserId: settings.pendingLinkUserId ?? null,
  };
}

export function maskLineUserId(id: string): string {
  if (id.length <= 8) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
