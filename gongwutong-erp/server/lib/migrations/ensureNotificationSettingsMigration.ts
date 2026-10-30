import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: create notification_settings + notification_logs tables. */
export async function ensureNotificationSettingsMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id serial PRIMARY KEY,
        kind text NOT NULL UNIQUE,
        enabled boolean NOT NULL DEFAULT false,
        reminder_time text NOT NULL DEFAULT '09:00',
        line_channel_access_token text,
        line_user_id text,
        app_base_url text,
        last_sent_date date,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id serial PRIMARY KEY,
        kind text NOT NULL,
        sent_at timestamptz NOT NULL DEFAULT now(),
        recipient text,
        item_count integer NOT NULL DEFAULT 0,
        success boolean NOT NULL,
        error_message text,
        message_preview text
      );
    `);

    await pool.query(`
      INSERT INTO notification_settings (kind, enabled, reminder_time)
      VALUES ('receivable_collection', false, '09:00')
      ON CONFLICT (kind) DO NOTHING;
    `);

    logger.info("DB migration: notification_settings + notification_logs ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: notification settings");
    return false;
  }
}
