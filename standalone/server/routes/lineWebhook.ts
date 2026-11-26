import { handleCalendarGroup } from "../lib/line/calendarGroup";
import type { Request, Response } from "express";
import { verifyLineSignature } from "../lib/line/lineSignature.ts";
import {
  bindLineUserByCode,
  parseLineBindingMessage,
  replyLineFollowInstructions,
} from "../lib/line/lineUserBinding.ts";
import { isLineMessagingConfigured } from "../lib/line/lineConfig.ts";
import { logger } from "../lib/logger.ts";

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string };
  message?: { type?: string; text?: string; id?: string };
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
    logger.info({ eventType: event.type }, "[LINE Webhook] event type");

    if (event.type === "message" && event.message?.type === "text" && event.source?.userId) {
      if (event.source.type === "group") {
        try { await handleCalendarGroup({groupId:event.source.groupId,userId:event.source.userId,messageId:event.message.id,text:event.message.text??"",replyToken:event.replyToken}); }
        catch(err){logger.error({err},"calendar group webhook failed");}
        continue;
      }
      if(event.source.type !== "user") continue;
      const code = parseLineBindingMessage(event.message.text ?? "");
      if (code) {
        await bindLineUserByCode({
          lineUserId: event.source.userId,
          code,
          replyToken: event.replyToken,
        });
      }
      continue;
    }

    if (event.type === "follow" && event.replyToken) {
      await replyLineFollowInstructions(event.replyToken);
    }
  }

  res.status(200).json({ ok: true });
}
