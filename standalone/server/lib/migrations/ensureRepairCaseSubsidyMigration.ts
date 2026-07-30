import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: repair_cases.subsidy_applied for 補助申請狀態. */
export async function ensureRepairCaseSubsidyMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE repair_cases
      ADD COLUMN IF NOT EXISTS subsidy_applied boolean NOT NULL DEFAULT false
    `);
    logger.info("DB migration: repair_cases.subsidy_applied ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: repair_cases.subsidy_applied");
    return false;
  }
}
