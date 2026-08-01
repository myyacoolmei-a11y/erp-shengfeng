import { pool } from "@workspace/db";
import { logger } from "../logger";

/**
 * Minimal additive migration: subsidy invoice kind (dual / triple).
 *
 * Safety:
 * - ADD COLUMN IF NOT EXISTS only
 * - No backfill
 * - Idempotent
 */
export async function ensureSubsidyInvoiceKindMigration(): Promise<boolean> {
  try {
    const before = await pool.query(`SELECT COUNT(*)::int AS n FROM subsidy_applications`);
    const beforeCount = before.rows[0]?.n ?? 0;

    await pool.query(`
      ALTER TABLE subsidy_applications
        ADD COLUMN IF NOT EXISTS invoice_kind text;
    `);
    await pool.query(`
      COMMENT ON COLUMN subsidy_applications.invoice_kind IS
        'dual=二聯式(個人)|triple=三聯式(公司)|null=尚未選擇';
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
      "DB migration: subsidy invoice_kind ready",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: subsidy invoice_kind");
    return false;
  }
}
