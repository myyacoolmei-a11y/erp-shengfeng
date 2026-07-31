import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent columns for 行政每日工作台 workflow on work_orders. */
export async function ensureAdminWorkflowMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_workflow_status text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_billing_info jsonb;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_needs_subsidy boolean NOT NULL DEFAULT false;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_subsidy_status text NOT NULL DEFAULT '未申請補助';
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_subsidy_applied_at timestamptz;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_subsidy_applied_by integer REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_subsidy_note text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_archive_checklist jsonb;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_confirmed_at timestamptz;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_confirmed_by integer REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_billed_at timestamptz;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_billed_by integer REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_archived_at timestamptz;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_archived_by integer REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_work_orders_admin_workflow_status
        ON work_orders (admin_workflow_status);

      -- Backfill from field_progress.workflow_status = pending_admin
      UPDATE work_orders wo
      SET admin_workflow_status = 'pending_admin_review'
      WHERE admin_workflow_status IS NULL
        AND EXISTS (
          SELECT 1 FROM work_order_field_progress fp
          WHERE fp.work_order_id = wo.id
            AND fp.workflow_status IN ('pending_admin', 'pending_admin_review')
            AND fp.completed_at IS NOT NULL
        );

      UPDATE work_order_field_progress
      SET workflow_status = 'pending_admin_review'
      WHERE workflow_status = 'pending_admin';
    `);
    logger.info("DB migration: admin workflow columns ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: admin workflow");
    return false;
  }
}
