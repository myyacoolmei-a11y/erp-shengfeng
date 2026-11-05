import { pool } from "@workspace/db";
import { logger } from "../logger";

const NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "receive_accounts_receivable", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_ai_work_reminder", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_next_job_reminder", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_field_depart", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_field_arrive", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_field_complete", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_field_delay", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "receive_leave_request", ddl: "boolean NOT NULL DEFAULT false" },
];

/** Idempotent: per-user notification prefs columns + backfill from legacy fields. */
export async function ensureUserNotificationPrefsMigration(): Promise<boolean> {
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

    await pool.query(`
      UPDATE user_line_notification_prefs
      SET receive_next_job_reminder = (
        receive_work_reminder_60 OR receive_work_reminder_30
        OR receive_work_reminder_15 OR receive_work_reminder_5
      )
      WHERE receive_next_job_reminder = false
        AND (
          receive_work_reminder_60 OR receive_work_reminder_30
          OR receive_work_reminder_15 OR receive_work_reminder_5
        );
    `);

    await pool.query(`
      UPDATE user_line_notification_prefs
      SET receive_ai_work_reminder = (
        receive_past_appointment OR receive_previous_job_incomplete OR receive_ready_for_next_job
      )
      WHERE receive_ai_work_reminder = false
        AND (
          receive_past_appointment OR receive_previous_job_incomplete OR receive_ready_for_next_job
        );
    `);

    await pool.query(`
      UPDATE user_line_notification_prefs
      SET receive_accounts_receivable = receive_evening_reminder
      WHERE receive_accounts_receivable = false AND receive_evening_reminder = true;
    `);

    logger.info("DB migration: per-user notification prefs ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: per-user notification prefs");
    return false;
  }
}
