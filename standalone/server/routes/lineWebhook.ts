import type { Request, Response } from "express";
import { verifyLineSignature } from "../lib/line/lineSignature.ts";
import { bindLineUserOnFollow } from "../lib/line/lineUserBinding.ts";
import { isLineMessagingConfigured } from "../lib/line/lineConfig.ts";
import { logger } from "../lib/logger.ts";

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
}

interface LineWebhookBody {
  events?: LineWebhookEvent[];
}

/** POST /api/line/webhook — must receive raw JSON body for signature verification. */
export async function handleLineWebhook(req: Request, res: Response): Promise<void> {
  if (!isLineMessagingConfigured()) {
    res.status(503).json({ error: "LINE Messaging API not configured" });
    return;
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const signature = req.headers["x-line-signature"] as string | undefined;
  if (!verifyLineSignature(rawBody, signature)) {
    logger.warn("LINE webhook signature verification failed");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: LineWebhookBody;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as LineWebhookBody;
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const events = payload.events ?? [];
  for (const event of events) {
    if (event.type === "follow" && event.source?.userId) {
      await bindLineUserOnFollow({
        lineUserId: event.source.userId,
        replyToken: event.replyToken,
      });
    }
  }

  res.status(200).json({ ok: true });
}
