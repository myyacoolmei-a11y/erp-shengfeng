import crypto from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import {
  db,
  lineBindingCodesTable,
  notificationSettingsTable,
  usersTable,
} from "@workspace/db";
import { RECEIVABLE_COLLECTION_KIND } from "../../../shared/reminders/types.ts";
import { logger } from "../logger.ts";
import { getLineUserProfile, replyLineMessage } from "./lineMessaging.ts";
import { ensureDefaultPrefsForUser } from "./lineSubscriptionService.ts";

const BINDING_CODE_TTL_MS = 10 * 60 * 1000;
const BINDING_CODE_MIN_LEN = 5;
const BINDING_CODE_MAX_LEN = 8;

function generateBindingCode(): string {
  const length = crypto.randomInt(BINDING_CODE_MIN_LEN, BINDING_CODE_MAX_LEN + 1);
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(crypto.randomInt(min, max));
}

async function findErpUserBoundToLine(lineUserId: string, exceptUserId?: number) {
  const [row] = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(eq(usersTable.lineUserId, lineUserId));

  if (!row) return null;
  if (exceptUserId != null && row.id === exceptUserId) return null;
  return row;
}

async function persistLineBinding(opts: {
  erpUserId: number;
  lineUserId: string;
}): Promise<{ displayName: string }> {
  const [erpUser] = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      lineUserId: usersTable.lineUserId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, opts.erpUserId));

  if (!erpUser) {
    throw new Error("ERP user not found");
  }

  if (erpUser.lineUserId?.trim() && erpUser.lineUserId.trim() !== opts.lineUserId) {
    throw new Error("此 ERP 帳號已綁定其他 LINE");
  }

  const lineTakenBy = await findErpUserBoundToLine(opts.lineUserId, opts.erpUserId);
  if (lineTakenBy) {
    throw new Error("此 LINE 已綁定其他 ERP 帳號");
  }

  await db
    .update(usersTable)
    .set({ lineUserId: opts.lineUserId })
    .where(eq(usersTable.id, erpUser.id));

  await ensureDefaultPrefsForUser(erpUser.id);

  await db
    .update(notificationSettingsTable)
    .set({ pendingLinkUserId: null })
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));

  return { displayName: erpUser.displayName };
}

export async function createLineBindingCode(erpUserId: number): Promise<{
  code: string;
  expiresAt: Date;
}> {
  const [existingUser] = await db
    .select({ lineUserId: usersTable.lineUserId })
    .from(usersTable)
    .where(eq(usersTable.id, erpUserId));

  if (existingUser?.lineUserId?.trim()) {
    throw new Error("此帳號已綁定 LINE，請先解除綁定再重新綁定");
  }

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

  let code = generateBindingCode();
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
      code = generateBindingCode();
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

  try {
    await persistLineBinding({
      erpUserId: row.userId,
      lineUserId: opts.lineUserId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "綁定失敗";
    logger.info({ err: message, lineUserId: opts.lineUserId }, "[LINE Binding] persist failed");
    if (opts.replyToken) {
      await replyLineMessage({
        replyToken: opts.replyToken,
        text: `❌ ${message}`,
      }).catch(replyErr => logger.warn({ err: replyErr }, "LINE binding reply failed"));
    }
    return { bound: false };
  }

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
      text: "✅ LINE 綁定成功！您可在 ERP「AI 收款秘書」設定要接收的推播項目。",
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
  const [user] = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      lineUserId: usersTable.lineUserId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, erpUserId));

  if (user?.lineUserId?.trim()) {
    return {
      status: "bound",
      lineLinked: true,
      code: null,
      expiresAt: null,
      linkedErpUserName: user.displayName,
      lineUserIdMasked: maskLineUserId(user.lineUserId.trim()),
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
    lineLinked: false,
    code: null,
    expiresAt: null,
    linkedErpUserName: null,
    lineUserIdMasked: null,
  };
}

export async function getLineBindingInfoForUser(erpUserId: number): Promise<{
  lineUserId: string | null;
  linkedUserId: number | null;
  linkedDisplayName: string | null;
  boundSubscriberCount: number;
}> {
  const [user] = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      lineUserId: usersTable.lineUserId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, erpUserId));

  const boundRows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(isNotNull(usersTable.lineUserId), ne(usersTable.lineUserId, "")));

  return {
    lineUserId: user?.lineUserId?.trim() || null,
    linkedUserId: user?.lineUserId ? user.id : null,
    linkedDisplayName: user?.lineUserId ? user.displayName : null,
    boundSubscriberCount: boundRows.length,
  };
}

/** @deprecated Use getLineBindingInfoForUser */
export async function getLineBindingInfo(): Promise<{
  lineUserId: string | null;
  linkedUserId: number | null;
  linkedDisplayName: string | null;
  pendingLinkUserId: number | null;
}> {
  const boundRows = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      lineUserId: usersTable.lineUserId,
    })
    .from(usersTable)
    .where(and(isNotNull(usersTable.lineUserId), ne(usersTable.lineUserId, "")))
    .limit(1);

  const first = boundRows[0];
  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.kind, RECEIVABLE_COLLECTION_KIND));

  return {
    lineUserId: first?.lineUserId ?? null,
    linkedUserId: first?.id ?? null,
    linkedDisplayName: first?.displayName ?? null,
    pendingLinkUserId: settings?.pendingLinkUserId ?? null,
  };
}

export function maskLineUserId(id: string): string {
  if (id.length <= 8) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function parseLineBindingMessage(text: string): string | null {
  const match = text.trim().match(/^綁定\s*(\d{5,8})$/);
  return match?.[1] ?? null;
}

export async function replyLineFollowInstructions(replyToken: string): Promise<void> {
  await replyLineMessage({
    replyToken,
    text: "您好！請先在 ERP「AI 收款秘書」按「立即綁定 LINE」取得綁定碼，加入好友後在對話輸入：綁定 XXXXX",
  }).catch(err => logger.warn({ err }, "LINE follow reply failed"));
}
