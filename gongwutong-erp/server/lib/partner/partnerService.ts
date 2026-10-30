import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  partnerBoardTable,
  partnerSuggestionsTable,
  type PartnerBoardKey,
  PARTNER_BOARD_KEYS,
} from "@workspace/db";

export interface PartnerHomeDto {
  dailyQuote: string;
  announcement: string;
  applause: string;
  updatedAt: {
    dailyQuote: string | null;
    announcement: string | null;
    applause: string | null;
  };
}

export interface PartnerSuggestionDto {
  id: number;
  content: string;
  isAnonymous: boolean;
  authorDisplayName: string | null;
  createdAt: string;
}

function mapBoardRows(rows: Array<{ key: string; content: string; updatedAt: Date | null }>): PartnerHomeDto {
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  return {
    dailyQuote: byKey.daily_quote?.content ?? "",
    announcement: byKey.announcement?.content ?? "",
    applause: byKey.applause?.content ?? "",
    updatedAt: {
      dailyQuote: byKey.daily_quote?.updatedAt?.toISOString?.() ?? null,
      announcement: byKey.announcement?.updatedAt?.toISOString?.() ?? null,
      applause: byKey.applause?.updatedAt?.toISOString?.() ?? null,
    },
  };
}

export async function getPartnerHome(): Promise<PartnerHomeDto> {
  const rows = await db
    .select()
    .from(partnerBoardTable)
    .where(inArray(partnerBoardTable.key, [...PARTNER_BOARD_KEYS]));
  return mapBoardRows(rows);
}

export async function updatePartnerContent(
  key: PartnerBoardKey,
  content: string,
  userId: number,
): Promise<PartnerHomeDto> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("內容不可為空");
  }

  await db
    .insert(partnerBoardTable)
    .values({ key, content: trimmed, updatedByUserId: userId })
    .onConflictDoUpdate({
      target: partnerBoardTable.key,
      set: { content: trimmed, updatedByUserId: userId },
    });

  return getPartnerHome();
}

export async function submitPartnerSuggestion(opts: {
  content: string;
  isAnonymous: boolean;
  userId: number;
  displayName: string;
}): Promise<{ ok: boolean }> {
  const trimmed = opts.content.trim();
  if (!trimmed) {
    throw new Error("請輸入建議內容");
  }
  if (trimmed.length > 2000) {
    throw new Error("建議內容過長（最多 2000 字）");
  }

  await db.insert(partnerSuggestionsTable).values({
    content: trimmed,
    isAnonymous: opts.isAnonymous,
    authorUserId: opts.isAnonymous ? null : opts.userId,
    authorDisplayName: opts.isAnonymous ? null : opts.displayName,
  });

  return { ok: true };
}

export async function listPartnerSuggestions(limit = 50): Promise<PartnerSuggestionDto[]> {
  const rows = await db
    .select()
    .from(partnerSuggestionsTable)
    .orderBy(desc(partnerSuggestionsTable.createdAt))
    .limit(limit);

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    isAnonymous: row.isAnonymous,
    authorDisplayName: row.isAnonymous ? null : (row.authorDisplayName ?? "—"),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));
}
