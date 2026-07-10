import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: create work_order_field_progress table. */
export async function ensureWorkOrderFieldProgressMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_order_field_progress (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        engineer_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        engineer_name text NOT NULL,
        departed_at timestamptz,
        arrived_at timestamptz,
        completed_at timestamptz,
        unable_to_complete_at timestamptz,
        unable_reason text,
        unable_note text,
        travel_duration_minutes integer,
        work_duration_minutes integer,
        total_duration_minutes integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (work_order_id, engineer_user_id)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_work_order_field_progress_work_order
      ON work_order_field_progress (work_order_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_work_order_field_progress_engineer
      ON work_order_field_progress (engineer_user_id);
    `);

    logger.info("DB migration: work_order_field_progress ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: work_order_field_progress");
    return false;
  }
}
