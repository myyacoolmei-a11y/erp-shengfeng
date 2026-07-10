import {
  DAILY_MORNING_BRIEFING_KIND,
  EVENING_RECEIVABLE_REMINDER_KIND,
} from "../../../shared/reminders/types.ts";
import {
  fetchPendingDispatchQuotes,
  fetchQuoteFollowUps,
  fetchUnpaidReceivables,
} from "./briefingDataService.ts";
import { buildMorningBriefingMessage, buildEveningReminderMessage } from "./briefingMessage.ts";
import { runScheduledLineNotification, sendTestLineNotification } from "./scheduledNotificationRunner.ts";

export async function buildMorningBriefingPayload() {
  const pendingDispatch = await fetchPendingDispatchQuotes();
  const receivables = await fetchUnpaidReceivables();
  const quoteFollowUps = await fetchQuoteFollowUps();

  const message = buildMorningBriefingMessage({ pendingDispatch, receivables, quoteFollowUps });
  const itemCount = pendingDispatch.length + receivables.length + quoteFollowUps.length;

  return {
    pendingDispatch,
    receivables,
    quoteFollowUps,
    message,
    itemCount,
  };
}

export async function buildEveningReminderPayload() {
  const receivables = await fetchUnpaidReceivables();
  const message = buildEveningReminderMessage(receivables);
  return { receivables, message, itemCount: receivables.length };
}

export async function runDailyMorningBriefing(opts?: { force?: boolean }) {
  const payload = await buildMorningBriefingPayload();
  const result = await runScheduledLineNotification({
    kind: DAILY_MORNING_BRIEFING_KIND,
    message: payload.message,
    itemCount: payload.itemCount,
    force: opts?.force,
  });
  return { ...result, ...payload };
}

export async function runEveningReceivableReminder(opts?: { force?: boolean }) {
  const payload = await buildEveningReminderPayload();
  const result = await runScheduledLineNotification({
    kind: EVENING_RECEIVABLE_REMINDER_KIND,
    message: payload.message,
    itemCount: payload.itemCount,
    force: opts?.force,
  });
  return { ...result, ...payload };
}

export async function sendDailyMorningBriefingTest() {
  const payload = await buildMorningBriefingPayload();
  return sendTestLineNotification({
    kind: DAILY_MORNING_BRIEFING_KIND,
    message: payload.message,
    itemCount: payload.itemCount,
  });
}

export async function sendEveningReceivableReminderTest() {
  const payload = await buildEveningReminderPayload();
  return sendTestLineNotification({
    kind: EVENING_RECEIVABLE_REMINDER_KIND,
    message: payload.message,
    itemCount: payload.itemCount,
  });
}
