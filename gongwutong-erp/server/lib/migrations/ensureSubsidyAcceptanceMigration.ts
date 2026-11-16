import { pool } from "@workspace/db";
import { logger } from "../logger";

/**
 * Additive: 補助驗收 / L夾 / 財政部 / 經濟部 流程欄位。
 * - ADD COLUMN IF NOT EXISTS only
 * - No backfill, no delete
 * - Idempotent
 */
export async function ensureSubsidyAcceptanceMigration(): Promise<boolean> {
  try {
    const before = await pool.query(`SELECT COUNT(*)::int AS n FROM subsidy_applications`);
    const beforeCount = before.rows[0]?.n ?? 0;

    await pool.query(`
      ALTER TABLE subsidy_applications
        ADD COLUMN IF NOT EXISTS l_folder_created boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS l_folder_created_at timestamptz,
        ADD COLUMN IF NOT EXISTS l_folder_created_by integer,
        ADD COLUMN IF NOT EXISTS mof_completed boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS mof_completed_at timestamptz,
        ADD COLUMN IF NOT EXISTS mof_completed_by integer,
        ADD COLUMN IF NOT EXISTS moea_required boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS moea_completed boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS moea_completed_at timestamptz,
        ADD COLUMN IF NOT EXISTS moea_completed_by integer,
        ADD COLUMN IF NOT EXISTS admin_line_album_created boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS admin_line_album_created_at timestamptz,
        ADD COLUMN IF NOT EXISTS mof_screenshot_saved boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS moea_screenshot_saved boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ar_amount_confirmed boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ar_amount_confirmed_at timestamptz,
        ADD COLUMN IF NOT EXISTS acceptance_checklist jsonb;
    `);

    const after = await pool.query(`SELECT COUNT(*)::int AS n FROM subsidy_applications`);
    const afterCount = after.rows[0]?.n ?? 0;
    if (afterCount < beforeCount) {
      logger.error(
        { beforeCount, afterCount },
        "DB migration aborted signal: subsidy_applications row count decreased",
      );
      return false;
    }

    logger.info(
      { beforeCount, afterCount },
      "DB migration: subsidy acceptance / admin process columns ready",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: subsidy acceptance columns");
    return false;
  }
}
