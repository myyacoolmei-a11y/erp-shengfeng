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
