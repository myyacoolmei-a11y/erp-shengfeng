import { pool } from "@workspace/db";
import { logger } from "../logger";

/** subsidy_applications + customer_documents + admin close columns (no warranty tables). */
export async function ensureSubsidyTablesMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_closed_at timestamptz;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS admin_closed_by integer REFERENCES users(id) ON DELETE SET NULL;

      UPDATE work_orders
      SET admin_workflow_status = 'pending_close'
      WHERE admin_workflow_status = 'pending_archive';

      CREATE TABLE IF NOT EXISTS subsidy_applications (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
        subsidy_type text NOT NULL DEFAULT 'pending_confirmation',
        assisted_program text,
        pipeline_status text NOT NULL DEFAULT 'link_not_sent',
        upload_link_token text,
        upload_link_sent_at timestamptz,
        upload_link_sent_by integer REFERENCES users(id) ON DELETE SET NULL,
        applied_at timestamptz,
        applied_by integer REFERENCES users(id) ON DELETE SET NULL,
        note text,
        close_override_at timestamptz,
        close_override_by integer REFERENCES users(id) ON DELETE SET NULL,
        close_override_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS subsidy_applications_work_order_uidx
        ON subsidy_applications (work_order_id);

      CREATE TABLE IF NOT EXISTS customer_documents (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
        subsidy_application_id integer REFERENCES subsidy_applications(id) ON DELETE SET NULL,
        doc_type text NOT NULL DEFAULT 'subsidy',
        file_name text,
        file_url text,
        status text NOT NULL DEFAULT 'pending',
        note text,
        uploaded_at timestamptz,
        reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_documents_work_order
        ON customer_documents (work_order_id);

      -- Backfill company_assisted rows from legacy admin_needs_subsidy
      INSERT INTO subsidy_applications (work_order_id, customer_id, subsidy_type, pipeline_status, note)
      SELECT wo.id, wo.customer_id, 'company_assisted',
        CASE WHEN wo.admin_subsidy_status = '已申請補助' THEN 'applied' ELSE 'link_not_sent' END,
        wo.admin_subsidy_note
      FROM work_orders wo
      WHERE wo.admin_needs_subsidy = true
        AND NOT EXISTS (
          SELECT 1 FROM subsidy_applications sa WHERE sa.work_order_id = wo.id
        );
    `);
    logger.info("DB migration: subsidy_applications + customer_documents ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: subsidy tables");
    return false;
  }
}
