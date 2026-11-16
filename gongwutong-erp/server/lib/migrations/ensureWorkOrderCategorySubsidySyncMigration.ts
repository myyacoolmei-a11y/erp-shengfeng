import { pool } from "@workspace/db";
import { logger } from "../logger";

/**
 * Align receivable project_type with current work_orders.project_type,
 * and mark subsidy as not_needed for 保養 jobs.
 */
export async function ensureWorkOrderCategorySubsidySyncMigration(): Promise<boolean> {
  try {
    await pool.query(`
      UPDATE receivables r
      SET project_type = w.project_type
      FROM work_orders w
      WHERE r.work_order_id = w.id
        AND COALESCE(r.project_type, '') IS DISTINCT FROM COALESCE(w.project_type, '')
    `);

    await pool.query(`
      UPDATE subsidy_applications sa
      SET
        subsidy_type = 'not_needed',
        assisted_program = NULL,
        updated_at = now()
      FROM work_orders w
      WHERE sa.work_order_id = w.id
        AND w.project_type = '保養'
        AND sa.subsidy_type IS DISTINCT FROM 'not_needed'
    `);

    await pool.query(`
      UPDATE work_orders
      SET admin_needs_subsidy = false, updated_at = now()
      WHERE project_type = '保養'
        AND admin_needs_subsidy = true
    `);

    logger.info("DB migration: work-order category + 保養 subsidy skip synced");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: work-order category subsidy sync");
    return false;
  }
}
