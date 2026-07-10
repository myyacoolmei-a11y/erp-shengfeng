import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: one-time LINE binding codes for ERP user ↔ LINE user mapping. */
export async function ensureLineBindingCodesMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS line_binding_codes (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_line_binding_codes_code
      ON line_binding_codes (code);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_line_binding_codes_user_active
      ON line_binding_codes (user_id, used_at, expires_at);
    `);

    logger.info("DB migration: line_binding_codes ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: line_binding_codes");
    return false;
  }
}
