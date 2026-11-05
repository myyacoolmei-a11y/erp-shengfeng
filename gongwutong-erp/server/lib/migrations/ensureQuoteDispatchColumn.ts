import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: ensure quotes.dispatch_status exists (Railway startup migration). */
export async function ensureQuoteDispatchColumn(): Promise<boolean> {
  try {
    const check = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'quotes'
           AND column_name = 'dispatch_status'
       ) AS exists`,
    );
    if (check.rows[0]?.exists) return true;

    await pool.query(
      `ALTER TABLE quotes
       ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT '未派工'`,
    );
    logger.info("DB migration: quotes.dispatch_status column added");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: quotes.dispatch_status");
    return false;
  }
}
