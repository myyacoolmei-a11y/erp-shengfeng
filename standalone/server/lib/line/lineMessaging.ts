import { logger } from "../logger.ts";
import { getLineChannelAccessToken } from "./lineConfig.ts";

async function lineApiPost(path: string, body: unknown): Promise<Response> {
  const token = getLineChannelAccessToken();
  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN 未設定");
  }

  return fetch(`https://api.line.me${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function sendLinePushMessage(opts: {
  userId: string;
  text: string;
}): Promise<void> {
  const token = getLineChannelAccessToken();
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN 未設定");

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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

export async function replyLineMessage(opts: {
  replyToken: string;
  text: string;
}): Promise<void> {
  const res = await lineApiPost("/v2/bot/message/reply", {
    replyToken: opts.replyToken,
    messages: [{ type: "text", text: opts.text }],
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE reply failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

export async function getLineUserProfile(userId: string): Promise<{ displayName: string } | null> {
  const token = getLineChannelAccessToken();
  if (!token) return null;

  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { displayName?: string };
  return { displayName: data.displayName ?? userId };
}
