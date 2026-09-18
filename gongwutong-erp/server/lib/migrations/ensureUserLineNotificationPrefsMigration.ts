import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: per-user LINE notification preference rows. */
export async function ensureUserLineNotificationPrefsMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_line_notification_prefs (
        user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        receive_morning_briefing boolean NOT NULL DEFAULT true,
        receive_evening_reminder boolean NOT NULL DEFAULT true,
        receive_pending_dispatch boolean NOT NULL DEFAULT true,
        receive_quote_follow_up boolean NOT NULL DEFAULT true,
        receive_receivable_collection boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      INSERT INTO user_line_notification_prefs (user_id)
      SELECT id FROM users WHERE line_user_id IS NOT NULL AND line_user_id <> ''
      ON CONFLICT (user_id) DO NOTHING;
    `);

    logger.info("DB migration: user_line_notification_prefs ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: user_line_notification_prefs");
    return false;
  }
}
