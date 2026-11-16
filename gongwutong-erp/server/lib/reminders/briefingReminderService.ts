import {
  DAILY_MORNING_BRIEFING_KIND,
  EVENING_RECEIVABLE_REMINDER_KIND,
} from "../../../shared/reminders/types.ts";
import {
  listSubscribersForEveningReminder,
  listSubscribersForMorningBriefing,
  getSubscriberForUser,
} from "../line/lineSubscriptionService.ts";
import {
  fetchPendingDispatchQuotes,
  fetchQuoteFollowUps,
  fetchUnpaidReceivables,
} from "./briefingDataService.ts";
import {
  buildMorningBriefingMessage,
  buildEveningReminderMessage,
  buildPersonalizedMorningBriefingMessage,
} from "./briefingMessage.ts";
import { runScheduledLineNotification, sendTestLineNotification } from "./scheduledNotificationRunner.ts";

export async function buildMorningBriefingPayload(forUserId?: number) {
  const pendingDispatch = await fetchPendingDispatchQuotes();
  const receivables = await fetchUnpaidReceivables();
  const quoteFollowUps = await fetchQuoteFollowUps();
  const data = { pendingDispatch, receivables, quoteFollowUps };
  const itemCount = pendingDispatch.length + receivables.length + quoteFollowUps.length;

  if (forUserId) {
    const subscriber = await getSubscriberForUser(forUserId);
    const message = subscriber
      ? buildPersonalizedMorningBriefingMessage(subscriber.prefs, data)
      : buildMorningBriefingMessage(data);
    return { ...data, message: message ?? buildMorningBriefingMessage(data), itemCount };
  }

  return {
    ...data,
    message: buildMorningBriefingMessage(data),
    itemCount,
  };
}

export async function buildEveningReminderPayload() {
  const receivables = await fetchUnpaidReceivables();
  const message = buildEveningReminderMessage(receivables);
  return { receivables, message, itemCount: receivables.length };
}

export async function runDailyMorningBriefing(opts?: { force?: boolean }) {
  const pendingDispatch = await fetchPendingDispatchQuotes();
  const receivables = await fetchUnpaidReceivables();
  const quoteFollowUps = await fetchQuoteFollowUps();
  const data = { pendingDispatch, receivables, quoteFollowUps };
  const itemCount = pendingDispatch.length + receivables.length + quoteFollowUps.length;

  const result = await runScheduledLineNotification({
    kind: DAILY_MORNING_BRIEFING_KIND,
    itemCount,
    force: opts?.force,
    buildMessages: async () => {
      const subscribers = await listSubscribersForMorningBriefing();
      const deliveries: Array<{ recipient: { lineUserId: string; userId: number; displayName: string }; message: string; itemCount: number }> = [];

      for (const subscriber of subscribers) {
        const message = buildPersonalizedMorningBriefingMessage(subscriber.prefs, data);
        if (!message) continue;
        deliveries.push({
          recipient: {
            lineUserId: subscriber.lineUserId,
            userId: subscriber.userId,
            displayName: subscriber.displayName,
          },
          message,
          itemCount,
        });
      }

      return deliveries;
    },
  });

  return {
    ...result,
    pendingDispatch,
    receivables,
    quoteFollowUps,
    itemCount,
  };
}

export async function runEveningReceivableReminder(opts?: { force?: boolean }) {
  const receivables = await fetchUnpaidReceivables();
  const message = buildEveningReminderMessage(receivables);
  const itemCount = receivables.length;

  const result = await runScheduledLineNotification({
    kind: EVENING_RECEIVABLE_REMINDER_KIND,
    itemCount,
    force: opts?.force,
    buildMessages: async () => {
      const subscribers = await listSubscribersForEveningReminder();
      return subscribers.map(subscriber => ({
        recipient: {
          lineUserId: subscriber.lineUserId,
          userId: subscriber.userId,
          displayName: subscriber.displayName,
        },
        message,
        itemCount,
      }));
    },
  });

  return { ...result, receivables, message, itemCount };
}

export async function sendDailyMorningBriefingTest(userId: number) {
  return sendTestLineNotification({
    kind: DAILY_MORNING_BRIEFING_KIND,
    userId,
  });
}

export async function sendEveningReceivableReminderTest(userId: number) {
  return sendTestLineNotification({
    kind: EVENING_RECEIVABLE_REMINDER_KIND,
    userId,
  });
}
