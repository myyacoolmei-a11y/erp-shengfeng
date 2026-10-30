import { pool } from "@workspace/db";
import { logger } from "../logger";

export async function ensureFieldProgressSnapshotsMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS field_progress_snapshots (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        engineer_user_id integer NOT NULL,
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
        source_progress_id integer,
        archived_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_field_progress_snapshots_work_order
        ON field_progress_snapshots (work_order_id, archived_at DESC);
    `);

    logger.info("DB migration: field_progress_snapshots ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: field_progress_snapshots");
    return false;
  }
}
