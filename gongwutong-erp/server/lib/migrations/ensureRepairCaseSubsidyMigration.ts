import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: subsidy_status text (migrates legacy subsidy_applied boolean). */
export async function ensureRepairCaseSubsidyMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE repair_cases
      ADD COLUMN IF NOT EXISTS subsidy_status text NOT NULL DEFAULT '未申請補助'
    `);

    const legacy = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'repair_cases'
           AND column_name = 'subsidy_applied'
       ) AS exists`,
    );

    if (legacy.rows[0]?.exists) {
      await pool.query(`
        UPDATE repair_cases
        SET subsidy_status = '已申請補助'
        WHERE subsidy_applied = true
          AND subsidy_status = '未申請補助'
      `);
      await pool.query(`
        ALTER TABLE repair_cases
        DROP COLUMN IF EXISTS subsidy_applied
      `);
    }

    logger.info("DB migration: repair_cases.subsidy_status ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: repair_cases.subsidy_status");
    return false;
  }
}
