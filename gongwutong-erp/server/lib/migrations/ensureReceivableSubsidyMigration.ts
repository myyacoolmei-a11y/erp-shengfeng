import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: receivables.subsidy_status for 補助申請 on 收款頁. */
export async function ensureReceivableSubsidyMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE receivables
      ADD COLUMN IF NOT EXISTS subsidy_status text NOT NULL DEFAULT '未申請補助'
    `);
    logger.info("DB migration: receivables.subsidy_status ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: receivables.subsidy_status");
    return false;
  }
}
