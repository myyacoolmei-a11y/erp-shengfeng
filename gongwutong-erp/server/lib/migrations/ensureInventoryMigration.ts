import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: inventory_items + inventory_transactions tables. */
export async function ensureInventoryMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id serial PRIMARY KEY,
        brand text,
        category text,
        item_name text NOT NULL,
        model text,
        serial_number text,
        unit text NOT NULL DEFAULT '台',
        warehouse_location text,
        status text NOT NULL DEFAULT '庫存中',
        cost_price numeric(12, 2),
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_items_brand
      ON inventory_items (brand);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_items_model
      ON inventory_items (model);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_items_status
      ON inventory_items (status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_items_warehouse
      ON inventory_items (warehouse_location);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id serial PRIMARY KEY,
        inventory_item_id integer NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        reason text NOT NULL,
        quantity_change integer NOT NULL,
        notes text,
        created_by integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_tx_item
      ON inventory_transactions (inventory_item_id, created_at DESC);
    `);

    logger.info("DB migration: inventory_items + inventory_transactions ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: inventory");
    return false;
  }
}
