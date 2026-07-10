import crypto from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  lineBindingCodesTable,
  notificationSettingsTable,
  usersTable,
} from "@workspace/db";
import { RECEIVABLE_COLLECTION_KIND } from "../../../shared/reminders/types.ts";
import { logger } from "../logger.ts";
import { getLineUserProfile, replyLineMessage } from "./lineMessaging.ts";

const BINDING_CODE_TTL_MS = 10 * 60 * 1000;

function generateSixDigitCode(): string {
  return String(crypto.randomInt(100000, 1_000_000));
}

async function persistLineBinding(opts: {
  erpUserId: number;
  lineUserId: string;
}): Promise<{ displayName: string }> {
  const [erpUser] = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, opts.erpUserId));

  if (!erpUser) {
    throw new Error("ERP user not found");
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

  return { displayName: erpUser.displayName };
}

export async function createLineBindingCode(erpUserId: number): Promise<{
  code: string;
  expiresAt: Date;
}> {
  const now = new Date();

  await db
    .update(lineBindingCodesTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(lineBindingCodesTable.userId, erpUserId),
        isNull(lineBindingCodesTable.usedAt),
      ),
    );

  let code = generateSixDigitCode();
  let expiresAt = new Date(now.getTime() + BINDING_CODE_TTL_MS);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await db.insert(lineBindingCodesTable).values({
        userId: erpUserId,
        code,
        expiresAt,
      });
      return { code, expiresAt };
    } catch (err) {
      if (attempt === 4) throw err;
      code = generateSixDigitCode();
      expiresAt = new Date(now.getTime() + BINDING_CODE_TTL_MS);
    }
  }

  throw new Error("Unable to generate binding code");
}

export async function bindLineUserByCode(opts: {
  lineUserId: string;
  code: string;
  replyToken?: string;
}): Promise<{ bound: boolean; erpUserId?: number }> {
  const normalizedCode = opts.code.trim();
  logger.info({ code: normalizedCode }, "[LINE Binding] code received");

  const [row] = await db
    .select()
    .from(lineBindingCodesTable)
    .where(
      and(
        eq(lineBindingCodesTable.code, normalizedCode),
        isNull(lineBindingCodesTable.usedAt),
        gt(lineBindingCodesTable.expiresAt, new Date()),
      ),
    );

  if (!row) {
    logger.info({ code: normalizedCode }, "[LINE Binding] code invalid or expired");
    if (opts.replyToken) {
      await replyLineMessage({
        replyToken: opts.replyToken,
        text: "綁定碼無效或已逾期，請回 ERP 重新產生。",
      }).catch(err => logger.warn({ err }, "LINE binding reply failed"));
    }
    return { bound: false };
  }

  logger.info(
    { erpUserId: row.userId, lineUserId: opts.lineUserId },
    "[LINE Binding] matched ERP user",
  );

  await persistLineBinding({
    erpUserId: row.userId,
    lineUserId: opts.lineUserId,
  });

  await db
    .update(lineBindingCodesTable)
    .set({ usedAt: new Date() })
    .where(eq(lineBindingCodesTable.id, row.id));

  const profile = await getLineUserProfile(opts.lineUserId);
  logger.info(
    {
      erpUserId: row.userId,
      lineUserId: opts.lineUserId,
      lineName: profile?.displayName,
    },
    "LINE user bound to ERP user via binding code",
  );

  if (opts.replyToken) {
    await replyLineMessage({
      replyToken: opts.replyToken,
      text: "✅ LINE 綁定成功，之後收款提醒會傳送到這裡。",
    }).catch(err => logger.warn({ err }, "LINE binding reply failed"));
  }

  return { bound: true, erpUserId: row.userId };
}

export async function getActiveBindingCodeForUser(erpUserId: number): Promise<{
  code: string;
  expiresAt: Date;
} | null> {
  const [row] = await db
    .select({
      code: lineBindingCodesTable.code,
      expiresAt: lineBindingCodesTable.expiresAt,
    })
    .from(lineBindingCodesTable)
    .where(
      and(
        eq(lineBindingCodesTable.userId, erpUserId),
        isNull(lineBindingCodesTable.usedAt),
        gt(lineBindingCodesTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(lineBindingCodesTable.createdAt))
    .limit(1);

  if (!row) return null;
  return row;
}

export async function getLineBindingStatusForUser(erpUserId: number): Promise<{
  status: "none" | "pending" | "bound";
  lineLinked: boolean;
  code: string | null;
  expiresAt: string | null;
  linkedErpUserName: string | null;
  lineUserIdMasked: string | null;
}> {
  const binding = await getLineBindingInfo();
  const isBoundToCurrentUser = binding.lineUserId != null && binding.linkedUserId === erpUserId;

  if (isBoundToCurrentUser) {
    return {
      status: "bound",
      lineLinked: true,
      code: null,
      expiresAt: null,
      linkedErpUserName: binding.linkedDisplayName,
      lineUserIdMasked: binding.lineUserId ? maskLineUserId(binding.lineUserId) : null,
    };
  }

  const activeCode = await getActiveBindingCodeForUser(erpUserId);
  if (activeCode) {
    return {
      status: "pending",
      lineLinked: false,
      code: activeCode.code,
      expiresAt: activeCode.expiresAt.toISOString(),
      linkedErpUserName: null,
      lineUserIdMasked: null,
    };
  }

  return {
    status: "none",
    lineLinked: Boolean(binding.lineUserId),
    code: null,
    expiresAt: null,
    linkedErpUserName: binding.linkedDisplayName,
    lineUserIdMasked: binding.lineUserId ? maskLineUserId(binding.lineUserId) : null,
  };
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

export function parseLineBindingMessage(text: string): string | null {
  const match = text.trim().match(/^綁定\s*(\d{6})$/);
  return match?.[1] ?? null;
}

export async function replyLineFollowInstructions(replyToken: string): Promise<void> {
  await replyLineMessage({
    replyToken,
    text: "您好！請先在 ERP「AI 收款秘書」按「連結我的 LINE」取得綁定碼，加入好友後在對話輸入：綁定 XXXXXX",
  }).catch(err => logger.warn({ err }, "LINE follow reply failed"));
}
