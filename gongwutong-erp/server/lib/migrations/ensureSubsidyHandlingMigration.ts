import { pool } from "@workspace/db";
import { logger } from "../logger";

/**
 * Minimal additive migration for subsidy handling methods + assisted program.
 *
 * Safety:
 * - ADD COLUMN IF NOT EXISTS only (assisted_program nullable)
 * - Does NOT rewrite subsidy_type / pipeline_status / tokens / attachments
 * - Does NOT backfill pending_confirmation for historical rows without a subsidy record
 * - Does NOT assign new_unit / trade_in / not_needed automatically
 * - Idempotent / safe to re-run
 */
export async function ensureSubsidyHandlingMigration(): Promise<boolean> {
  try {
    const before = await pool.query(`SELECT COUNT(*)::int AS n FROM subsidy_applications`);
    const beforeCount = before.rows[0]?.n ?? 0;

    await pool.query(`
      ALTER TABLE subsidy_applications
        ADD COLUMN IF NOT EXISTS assisted_program text;
    `);

    // Keep default text column semantics compatible; do not change existing rows.
    // Optionally document allowed values via comment (no CHECK constraint — avoids
    // blocking legacy 'none' and future-safe text storage).
    await pool.query(`
      COMMENT ON COLUMN subsidy_applications.subsidy_type IS
        'pending_confirmation|not_needed|customer_self_apply|company_assisted|none(legacy)';
    `);
    await pool.query(`
      COMMENT ON COLUMN subsidy_applications.assisted_program IS
        'new_unit|trade_in|new_unit_and_trade_in|null — only when subsidy_type=company_assisted; never auto-filled';
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
      "DB migration: subsidy handling (assisted_program) ready",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: subsidy handling");
    return false;
  }
}
