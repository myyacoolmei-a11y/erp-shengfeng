import { and, eq } from "drizzle-orm";
import { db, workOrdersTable, customersTable } from "@workspace/db";
import { taipeiToday } from "../reminders/dateUtils.ts";
import { logger } from "../logger.ts";
import { fireAndForgetNotification } from "./notificationService.ts";
import { resolveEngineerUserIdsForWorkOrder } from "./workOrderNotificationHelpers.ts";
import { listActiveManagerUserIds } from "./notificationRecipientFilter.ts";
import { getCompanyAiWorkReminderSettings } from "../aiWorkReminder/companySettingsService.ts";
import {
  parseAiReminderScenarioIds,
  parseWorkOrderAiReminderCustomConfig,
  resolveWorkOrderReminderMessage,
  renderAiReminderMessage,
  buildWorkOrderPreviewContext,
  type WorkReminderScenarioId,
} from "../../../shared/aiWorkReminder.ts";
import {
  AI_WORK_REMINDER_NOTIFICATION_TYPES,
} from "../../../shared/notificationRolePermissions.ts";
import { NOTIFICATION_TYPES } from "../../../shared/notifications/types.ts";
import { tryToAbsoluteAppUrl } from "../appUrl.ts";
import { notifyPreviousJobIncompleteIfNeeded } from "./workReminderChainHelpers.ts";

const SCENARIO_WINDOWS: Array<{
  scenarioId: WorkReminderScenarioId;
  notificationType: string;
  targetMinutes: number;
  toleranceMinutes: number;
}> = [
  { scenarioId: "next_job_60", notificationType: AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_60, targetMinutes: 60, toleranceMinutes: 2 },
  { scenarioId: "next_job_30", notificationType: AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_30, targetMinutes: 30, toleranceMinutes: 2 },
  { scenarioId: "next_job_15", notificationType: AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_15, targetMinutes: 15, toleranceMinutes: 2 },
  { scenarioId: "next_job_5", notificationType: AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_5, targetMinutes: 5, toleranceMinutes: 2 },
  { scenarioId: "past_appointment", notificationType: AI_WORK_REMINDER_NOTIFICATION_TYPES.AI_WORK_REMINDER_PAST, targetMinutes: -5, toleranceMinutes: 5 },
];

function appointmentMs(scheduledDate: string, scheduledTime: string): number | null {
  const m = scheduledTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const [y, mo, d] = scheduledDate.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(y, mo - 1, d, hour - 8, minute));
  return utcGuess.getTime();
}

function taipeiNowMs(): number {
  return Date.now();
}

let running = false;

export async function runAiWorkReminderScheduler(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const today = taipeiToday();
    const companySettings = await getCompanyAiWorkReminderSettings();
    const orders = await db
      .select({
        id: workOrdersTable.id,
        workOrderNumber: workOrdersTable.workOrderNumber,
        customerName: workOrdersTable.customerName,
        linkedCustomerName: customersTable.name,
        installAddress: workOrdersTable.installAddress,
        scheduledDate: workOrdersTable.scheduledDate,
        scheduledTime: workOrdersTable.scheduledTime,
        status: workOrdersTable.status,
        assignedTo: workOrdersTable.assignedTo,
        assistantTo: workOrdersTable.assistantTo,
        technicians: workOrdersTable.technicians,
        aiReminderEnabled: workOrdersTable.aiReminderEnabled,
        aiReminderScenarioIds: workOrdersTable.aiReminderScenarioIds,
        aiNotifySupervisorOnDelay: workOrdersTable.aiNotifySupervisorOnDelay,
        aiReminderRuleSource: workOrdersTable.aiReminderRuleSource,
        aiReminderCustomConfig: workOrdersTable.aiReminderCustomConfig,
      })
      .from(workOrdersTable)
      .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
      .where(and(eq(workOrdersTable.aiReminderEnabled, true), eq(workOrdersTable.scheduledDate, today)));

    const now = taipeiNowMs();

    for (const order of orders) {
      if (!order.scheduledDate || !order.scheduledTime) continue;
      const apptMs = appointmentMs(order.scheduledDate, order.scheduledTime);
      if (apptMs == null) continue;

      const minutesUntil = Math.round((apptMs - now) / 60_000);
      const scenarioIds = parseAiReminderScenarioIds(
        order.aiReminderScenarioIds ? JSON.parse(order.aiReminderScenarioIds) : null,
      );
      const customConfig = parseWorkOrderAiReminderCustomConfig(
        order.aiReminderCustomConfig ? JSON.parse(order.aiReminderCustomConfig) : null,
      );
      const ruleSource = (order.aiReminderRuleSource as "company_default" | "custom") ?? "company_default";
      const customerName = order.linkedCustomerName ?? order.customerName ?? "—";
      const recipients = await resolveEngineerUserIdsForWorkOrder(order);
      if (recipients.length === 0) continue;

      for (const window of SCENARIO_WINDOWS) {
        if (!scenarioIds.includes(window.scenarioId)) continue;
        const inWindow =
          window.scenarioId === "past_appointment"
            ? minutesUntil <= window.targetMinutes
            : Math.abs(minutesUntil - window.targetMinutes) <= window.toleranceMinutes;
        if (!inWindow) continue;

        const template = resolveWorkOrderReminderMessage({
          scenarioId: window.scenarioId,
          ruleSource,
          companySettings,
          customConfig,
        });
        const ctx = buildWorkOrderPreviewContext({
          customerName,
          installAddress: order.installAddress ?? undefined,
          workOrderNumber: order.workOrderNumber ?? undefined,
          engineerName: order.assignedTo ?? undefined,
          scheduledDate: order.scheduledDate,
          scheduledTime: order.scheduledTime,
          scenarioId: window.scenarioId,
        });
        const rendered = renderAiReminderMessage(template, ctx);
        const navUrl = order.installAddress ? tryToAbsoluteAppUrl(`/work-orders?open=${order.id}`) : null;
        const lineText = navUrl ? `${rendered}\n\n📍 一鍵導航：${navUrl}` : rendered;

        fireAndForgetNotification({
          recipientUserIds: recipients,
          type: window.notificationType,
          title: "AI 工作提醒",
          message: rendered,
          workOrderId: order.id,
          dedupeKey: `ai-wr-${order.id}-${window.scenarioId}-${order.scheduledDate}`,
          lineMessage: lineText,
          channels: ["web_push", "line"],
        });

        if (window.scenarioId.startsWith("next_job_")) {
          void notifyPreviousJobIncompleteIfNeeded({
            nextOrder: {
              id: order.id,
              workOrderNumber: order.workOrderNumber,
              customerName: order.customerName,
              linkedCustomerName: order.linkedCustomerName,
              installAddress: order.installAddress,
              scheduledDate: order.scheduledDate,
              scheduledTime: order.scheduledTime,
              status: order.status,
              assignedTo: order.assignedTo,
              assistantTo: order.assistantTo,
              technicians: order.technicians,
              apptMs,
            },
            engineerUserIds: recipients,
          });
        }

        if (
          window.scenarioId === "past_appointment" &&
          order.aiNotifySupervisorOnDelay
        ) {
          const managerIds = await listActiveManagerUserIds();
          if (managerIds.length > 0) {
            fireAndForgetNotification({
              recipientUserIds: managerIds,
              type: NOTIFICATION_TYPES.AI_WORK_REMINDER_SUPERVISOR_ALERT,
              title: "工程師可能延誤",
              message: `${customerName} · ${order.workOrderNumber ?? order.id}\n工程師可能已逾預約到場時間，請留意。`,
              workOrderId: order.id,
              dedupeKey: `ai-wr-supervisor-${order.id}-${order.scheduledDate}`,
              lineMessage: `⚠️ 工程師可能延誤\n\n客戶：${customerName}\n案件：${order.workOrderNumber ?? order.id}\n預約：${order.scheduledDate} ${order.scheduledTime}`,
              channels: ["in_app", "web_push", "line"],
            });
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "AI work reminder scheduler failed");
  } finally {
    running = false;
  }
}
