import { logger } from "../logger.ts";
import { getLineChannelAccessToken } from "./lineConfig.ts";

function maskLineUserId(id: string): string {
  if (id.length <= 8) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function formatLineApiError(status: number, body: string): string {
  const snippet = body.slice(0, 300).trim();
  if (status === 401) {
    return "Token 無效：LINE API 拒絕請求（401）";
  }
  if (status === 400) {
    if (/invalid user|user id|not found/i.test(snippet)) {
      return "LINE User ID 無效：請重新綁定 LINE";
    }
    return snippet ? `LINE API 拒絕請求（400）：${snippet}` : "LINE API 拒絕請求（400）";
  }
  if (status === 403) {
    return "LINE API 拒絕請求：權限不足（403）";
  }
  return snippet ? `LINE API 拒絕請求（${status}）：${snippet}` : `LINE API 拒絕請求（${status}）`;
}

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
    const errorMessage = formatLineApiError(res.status, body);
    logger.error(
      {
        lineUserIdMasked: maskLineUserId(opts.userId),
        httpStatus: res.status,
        lineApiResponse: body,
      },
      "LINE push API error",
    );
    throw new Error(`${errorMessage} | LINE API Response: ${body}`);
  }

  logger.info(
    {
      lineUserIdMasked: maskLineUserId(opts.userId),
      httpStatus: res.status,
      chars: opts.text.length,
    },
    "LINE push sent",
  );
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
