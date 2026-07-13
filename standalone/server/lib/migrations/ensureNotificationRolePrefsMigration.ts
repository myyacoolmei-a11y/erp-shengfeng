import { pool } from "@workspace/db";
import { logger } from "../logger";

const NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "receive_work_reminder_60", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_work_reminder_30", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_work_reminder_15", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_work_reminder_5", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_past_appointment", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_previous_job_incomplete", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_ready_for_next_job", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_one_tap_navigation", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_company_announcement", ddl: "boolean NOT NULL DEFAULT true" },
];

/** Idempotent: engineer work reminder LINE prefs + role-based backfill. */
export async function ensureNotificationRolePrefsMigration(): Promise<boolean> {
  try {
    for (const col of NEW_COLUMNS) {
      const check = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'user_line_notification_prefs'
             AND column_name = $1
         ) AS exists`,
        [col.name],
      );
      if (!check.rows[0]?.exists) {
        await pool.query(`ALTER TABLE user_line_notification_prefs ADD COLUMN ${col.name} ${col.ddl}`);
      }
    }

    // 管理者：啟用管理通知偏好，關閉工程師工作提醒
    await pool.query(`
      UPDATE user_line_notification_prefs p
      SET
        receive_morning_briefing = true,
        receive_evening_reminder = true,
        receive_pending_dispatch = true,
        receive_quote_follow_up = true,
        receive_receivable_collection = true,
        receive_work_reminder_60 = false,
        receive_work_reminder_30 = false,
        receive_work_reminder_15 = false,
        receive_work_reminder_5 = false,
        receive_past_appointment = false,
        receive_previous_job_incomplete = false,
        receive_ready_for_next_job = false,
        receive_one_tap_navigation = false,
        receive_company_announcement = true
      FROM users u
      WHERE p.user_id = u.id
        AND u.role IN ('super_admin', 'owner', 'admin');
    `);

    // 工程師：啟用工作提醒，關閉管理／財務通知
    await pool.query(`
      UPDATE user_line_notification_prefs p
      SET
        receive_morning_briefing = false,
        receive_evening_reminder = false,
        receive_pending_dispatch = false,
        receive_quote_follow_up = false,
        receive_receivable_collection = false,
        receive_work_reminder_60 = true,
        receive_work_reminder_30 = true,
        receive_work_reminder_15 = true,
        receive_work_reminder_5 = true,
        receive_past_appointment = true,
        receive_previous_job_incomplete = true,
        receive_ready_for_next_job = true,
        receive_one_tap_navigation = true,
        receive_company_announcement = true
      FROM users u
      WHERE p.user_id = u.id
        AND u.role IN ('engineer', 'technician');
    `);

    logger.info("DB migration: notification role LINE prefs ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: notification role LINE prefs");
    return false;
  }
}
