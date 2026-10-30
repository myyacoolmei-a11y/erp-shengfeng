import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: repair_cases.sales_user_id → users(id), nullable for legacy rows. */
export async function ensureRepairCaseSalesUserMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE repair_cases
      ADD COLUMN IF NOT EXISTS sales_user_id integer REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_repair_cases_sales_user_id
      ON repair_cases (sales_user_id)
    `);
    logger.info("DB migration: repair_cases.sales_user_id ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: repair_cases.sales_user_id");
    return false;
  }
}
