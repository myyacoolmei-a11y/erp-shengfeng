import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: seed AI morning briefing + evening reminder notification kinds. */
export async function ensureAiBriefingMigration(): Promise<boolean> {
  try {
    await pool.query(`
      INSERT INTO notification_settings (kind, enabled, reminder_time)
      VALUES ('daily_morning_briefing', false, '09:00')
      ON CONFLICT (kind) DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO notification_settings (kind, enabled, reminder_time)
      VALUES ('evening_receivable_reminder', false, '21:00')
      ON CONFLICT (kind) DO NOTHING;
    `);

    logger.info("DB migration: AI briefing notification kinds ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: AI briefing kinds");
    return false;
  }
}
