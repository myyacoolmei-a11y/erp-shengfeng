import { eq, ne, and } from "drizzle-orm";
import { db, workOrdersTable } from "@workspace/db";
import { emitWorkOrderReminder } from "./workOrdersNotificationHook.ts";
import { logger } from "../logger.ts";

function taipeiNowParts(): { date: string; hour: number; minute: number } {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
  return { date, hour, minute };
}

function parseScheduledTimeMinutes(scheduledTime: string | null): number | null {
  if (!scheduledTime?.trim()) return null;
  const match = scheduledTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function tomorrowDate(from: string): string {
  const d = new Date(`${from}T12:00:00+08:00`);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

/** Day-before and two-hours-before work order reminders. Runs every scheduler tick. */
export async function runWorkOrderReminders(): Promise<{ dayBefore: number; twoHours: number }> {
  const { date, hour, minute } = taipeiNowParts();
  const tomorrow = tomorrowDate(date);
  const nowMinutes = hour * 60 + minute;

  const orders = await db
    .select()
    .from(workOrdersTable)
    .where(
      and(
        ne(workOrdersTable.status, "已取消"),
        ne(workOrdersTable.status, "已完成"),
      ),
    );

  let dayBefore = 0;
  let twoHours = 0;

  for (const order of orders) {
    if (!order.scheduledDate) continue;

    if (order.scheduledDate === tomorrow && hour === 18 && minute === 0) {
      try {
        await emitWorkOrderReminder(order, "day_before");
        dayBefore += 1;
      } catch (err) {
        logger.error({ err, workOrderId: order.id }, "day-before reminder failed");
      }
    }

    if (order.scheduledDate === date) {
      const schedMinutes = parseScheduledTimeMinutes(order.scheduledTime);
      if (schedMinutes == null) continue;
      const diff = schedMinutes - nowMinutes;
      if (diff >= 115 && diff <= 125) {
        try {
          await emitWorkOrderReminder(order, "two_hours");
          twoHours += 1;
        } catch (err) {
          logger.error({ err, workOrderId: order.id }, "two-hours reminder failed");
        }
      }
    }
  }

  return { dayBefore, twoHours };
}
