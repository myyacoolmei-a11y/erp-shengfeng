import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: audit_logs table + payment reversal columns. */
export async function ensurePaymentAuditMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id serial PRIMARY KEY,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id integer NOT NULL,
        user_id integer REFERENCES users(id) ON DELETE SET NULL,
        user_display_name text,
        reason text,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
      ON audit_logs (entity_type, entity_id, created_at DESC);
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS receivable_id integer REFERENCES receivables(id) ON DELETE SET NULL;
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS reversal_of_payment_id integer;
    `);

    logger.info("DB migration: audit_logs + payment reversal columns ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: payment audit");
    return false;
  }
}
