import { logger } from "../logger.ts";

export async function sendLinePushMessage(opts: {
  channelAccessToken: string;
  userId: string;
  text: string;
}): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: opts.userId,
      messages: [{ type: "text", text: opts.text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed (${res.status}): ${body.slice(0, 300)}`);
  }

  logger.info({ userId: opts.userId, chars: opts.text.length }, "LINE push sent");
}
