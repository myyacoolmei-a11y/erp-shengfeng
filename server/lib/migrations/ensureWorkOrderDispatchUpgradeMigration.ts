import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Additive, idempotent columns for 派工單類型／師傅／收款／批發出貨串聯. Never drop or rename. */
export async function ensureWorkOrderDispatchUpgradeMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS job_types jsonb;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS job_type_other text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS primary_technician text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS extra_technician text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS payment_methods jsonb;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS payment_method_other text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS invoice_status text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS billing_total_amount numeric(12, 2);
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS billing_notes text;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS no_charge boolean NOT NULL DEFAULT false;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS wholesale_order_id integer;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS parent_work_order_id integer;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS delivery_confirmed_by integer;

      CREATE INDEX IF NOT EXISTS idx_work_orders_wholesale_order_id
        ON work_orders (wholesale_order_id);
      CREATE INDEX IF NOT EXISTS idx_work_orders_parent_work_order_id
        ON work_orders (parent_work_order_id);

      CREATE TABLE IF NOT EXISTS work_order_delivery_items (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        wholesale_order_id integer REFERENCES wholesale_orders(id) ON DELETE SET NULL,
        wholesale_order_item_id integer,
        product_id integer,
        product_name text,
        brand text,
        model text,
        unit text,
        ordered_qty integer NOT NULL DEFAULT 0,
        ship_qty integer NOT NULL DEFAULT 0,
        inventory_item_id integer,
        inventory_deducted_at timestamptz,
        sort_order integer NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_wo_delivery_items_wo
        ON work_order_delivery_items (work_order_id);
      CREATE INDEX IF NOT EXISTS idx_wo_delivery_items_wholesale
        ON work_order_delivery_items (wholesale_order_id);

      ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by text;
    `);

    logger.info("DB migration: work order dispatch upgrade columns ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: work order dispatch upgrade");
    return false;
  }
}
