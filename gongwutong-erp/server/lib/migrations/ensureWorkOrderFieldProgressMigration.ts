import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: create / extend work_order_field_progress + admin todos + backfill. */
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
      ALTER TABLE work_order_field_progress
        ADD COLUMN IF NOT EXISTS field_status text NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS paused_at timestamptz,
        ADD COLUMN IF NOT EXISTS resumed_at timestamptz,
        ADD COLUMN IF NOT EXISTS pause_reason text,
        ADD COLUMN IF NOT EXISTS pause_note text,
        ADD COLUMN IF NOT EXISTS pause_total_minutes integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pause_intervals jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS completed_by integer REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS completion_checklist jsonb,
        ADD COLUMN IF NOT EXISTS workflow_status text,
        ADD COLUMN IF NOT EXISTS last_action_by integer REFERENCES users(id) ON DELETE SET NULL;
    `);

    // Backfill field_status from existing timestamps
    await pool.query(`
      UPDATE work_order_field_progress SET field_status = CASE
        WHEN completed_at IS NOT NULL THEN 'completed'
        WHEN paused_at IS NOT NULL AND (resumed_at IS NULL OR paused_at > resumed_at) THEN 'paused'
        WHEN arrived_at IS NOT NULL THEN 'in_progress'
        WHEN departed_at IS NOT NULL THEN 'en_route'
        ELSE 'pending'
      END
      WHERE field_status = 'pending'
        AND (departed_at IS NOT NULL OR arrived_at IS NOT NULL OR completed_at IS NOT NULL OR paused_at IS NOT NULL);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_work_order_field_progress_work_order
      ON work_order_field_progress (work_order_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_work_order_field_progress_engineer
      ON work_order_field_progress (engineer_user_id);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_todos (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        todo_type text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        payload jsonb,
        created_by integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS admin_todos_work_order_type_uidx
      ON admin_todos (work_order_id, todo_type);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS field_progress_backfill_requests (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        progress_id integer REFERENCES work_order_field_progress(id) ON DELETE SET NULL,
        requested_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        missed_step text NOT NULL,
        requested_time timestamptz NOT NULL,
        reason text NOT NULL,
        note text,
        approval_status text NOT NULL DEFAULT 'pending',
        requested_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_field_progress_backfill_wo
      ON field_progress_backfill_requests (work_order_id);
    `);

    logger.info("DB migration: work_order_field_progress (+ pause/checklist/admin todos) ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: work_order_field_progress");
    return false;
  }
}
