import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: LINE integration columns on users + notification_settings. */
export async function ensureLineIntegrationMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS line_user_id text;
    `);

    await pool.query(`
      ALTER TABLE notification_settings
      ADD COLUMN IF NOT EXISTS pending_link_user_id integer;
    `);

    logger.info("DB migration: LINE integration columns ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: LINE integration");
    return false;
  }
}
