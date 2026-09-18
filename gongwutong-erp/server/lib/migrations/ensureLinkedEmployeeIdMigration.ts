import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: linked_employee_id on users for per-engineer work order scoping. */
export async function ensureLinkedEmployeeIdMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS linked_employee_id integer REFERENCES employees(id) ON DELETE SET NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_linked_employee_id
      ON users (linked_employee_id);
    `);

    logger.info("DB migration: users.linked_employee_id ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: linked_employee_id");
    return false;
  }
}
