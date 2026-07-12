import { logger } from "../logger.ts";
import { getLineChannelAccessToken, isLineMessagingConfigured } from "../line/lineConfig.ts";
import { formatLineApiError } from "../line/lineMessaging.ts";
import { absoluteWorkOrderViewUrl } from "../appUrl.ts";

export async function sendLineWorkOrderNotification(opts: {
  lineUserId: string;
  text: string;
  workOrderId?: number;
}): Promise<void> {
  if (!isLineMessagingConfigured()) {
    throw new Error("LINE Messaging API 未設定（LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET）");
  }

  const token = getLineChannelAccessToken();
  const messages: unknown[] = [{ type: "text", text: opts.text }];

  if (opts.workOrderId) {
    const viewUrl = absoluteWorkOrderViewUrl(opts.workOrderId);
    console.log("[LINE Flex Message] 查看派工單 viewUrl:", viewUrl);
    logger.info({ viewUrl, workOrderId: opts.workOrderId }, "LINE Flex Message 查看派工單 viewUrl");

    messages.push({
      type: "template",
      altText: "查看派工單",
      template: {
        type: "buttons",
        text: "請點擊下方按鈕查看派工單",
        actions: [
          {
            type: "uri",
            label: "查看派工單",
            uri: viewUrl,
          },
        ],
      },
    });
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: opts.lineUserId,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const errorMessage = formatLineApiError(res.status, body);
    logger.error(
      { lineUserId: opts.lineUserId.slice(0, 8), httpStatus: res.status, lineApiResponse: body },
      "LINE work order push failed",
    );
    throw new Error(`${errorMessage} | LINE API Response: ${body}`);
  }

  logger.info({ lineUserId: opts.lineUserId.slice(0, 8), workOrderId: opts.workOrderId }, "LINE work order push sent");
}
