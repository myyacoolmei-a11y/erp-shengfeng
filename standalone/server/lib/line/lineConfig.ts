/** LINE Messaging API credentials from environment. */
export function getLineChannelAccessToken(): string {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "";
}

export function getLineChannelSecret(): string {
  return process.env.LINE_CHANNEL_SECRET?.trim() ?? "";
}

export function isLineMessagingConfigured(): boolean {
  return getLineChannelAccessToken().length > 0 && getLineChannelSecret().length > 0;
}

export function defaultLineWebhookUrl(): string {
  const base = process.env.APP_BASE_URL?.trim()
    ?? "https://bountiful-vitality-production-76ab.up.railway.app";
  return `${base.replace(/\/+$/, "")}/api/line/webhook`;
}

/** LINE Official Account basic ID from Railway env (e.g. @your-bot or your-bot). */
export function getLineOfficialAccountId(): string {
  return process.env.LINE_OFFICIAL_ACCOUNT_ID?.trim() ?? "";
}

/** Build add-friend URL for LINE Official Account. Returns null when env is unset. */
export function buildLineAddFriendUrl(accountId?: string): string | null {
  const raw = (accountId ?? getLineOfficialAccountId()).trim();
  if (!raw) return null;

  const basicId = raw.startsWith("@") ? raw : `@${raw}`;
  return `https://line.me/R/ti/p/${encodeURIComponent(basicId)}`;
}
