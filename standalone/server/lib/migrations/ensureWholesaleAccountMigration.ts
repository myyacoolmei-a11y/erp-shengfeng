import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent wholesale B2B account fields, payment tables, indexes, and order↔customer backfill. */
export async function ensureWholesaleAccountMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE wholesale_customers
        ADD COLUMN IF NOT EXISTS billing_company_name text,
        ADD COLUMN IF NOT EXISTS billing_tax_id text,
        ADD COLUMN IF NOT EXISTS billing_address text,
        ADD COLUMN IF NOT EXISTS invoice_email text,
        ADD COLUMN IF NOT EXISTS sales_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS delivery_addresses jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await pool.query(`
      ALTER TABLE wholesale_orders
        ADD COLUMN IF NOT EXISTS delivery_address text
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wholesale_payments (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL REFERENCES wholesale_customers(id) ON DELETE RESTRICT,
        payment_date date NOT NULL,
        amount numeric(12, 2) NOT NULL,
        payment_method text,
        note text,
        created_by integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wholesale_payment_allocations (
        id serial PRIMARY KEY,
        payment_id integer NOT NULL REFERENCES wholesale_payments(id) ON DELETE CASCADE,
        order_id integer NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
        allocated_amount numeric(12, 2) NOT NULL
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wholesale_orders_customer_id ON wholesale_orders (customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wholesale_orders_order_date ON wholesale_orders (order_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wholesale_payments_customer_id ON wholesale_payments (customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wholesale_payments_payment_date ON wholesale_payments (payment_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wholesale_payment_allocations_order_id ON wholesale_payment_allocations (order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wholesale_payment_allocations_payment_id ON wholesale_payment_allocations (payment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wholesale_customers_sales_user_id ON wholesale_customers (sales_user_id)`);

    const matched = await pool.query(`
      WITH ranked AS (
        SELECT
          o.id AS order_id,
          c.id AS customer_id,
          ROW_NUMBER() OVER (
            PARTITION BY o.id
            ORDER BY
              CASE
                WHEN o.customer_name IS NOT NULL AND btrim(o.customer_name) <> ''
                  AND regexp_replace(lower(btrim(o.customer_name)), '\\s+', '', 'g')
                    = regexp_replace(lower(btrim(c.company_name)), '\\s+', '', 'g') THEN 0
                WHEN c.tax_id IS NOT NULL AND btrim(c.tax_id) <> ''
                  AND regexp_replace(coalesce(o.customer_name, ''), '[^0-9]', '', 'g')
                    = regexp_replace(c.tax_id, '[^0-9]', '', 'g')
                  AND length(regexp_replace(c.tax_id, '[^0-9]', '', 'g')) >= 8 THEN 1
                WHEN c.mobile IS NOT NULL AND btrim(c.mobile) <> ''
                  AND regexp_replace(coalesce(o.customer_name, ''), '[^0-9]', '', 'g')
                    = regexp_replace(c.mobile, '[^0-9]', '', 'g')
                  AND length(regexp_replace(c.mobile, '[^0-9]', '', 'g')) >= 8 THEN 2
                WHEN c.telephone IS NOT NULL AND btrim(c.telephone) <> ''
                  AND regexp_replace(coalesce(o.customer_name, ''), '[^0-9]', '', 'g')
                    = regexp_replace(c.telephone, '[^0-9]', '', 'g')
                  AND length(regexp_replace(c.telephone, '[^0-9]', '', 'g')) >= 8 THEN 3
                ELSE 9
              END,
              c.id
          ) AS rn
        FROM wholesale_orders o
        JOIN wholesale_customers c ON (
          (o.customer_name IS NOT NULL AND btrim(o.customer_name) <> ''
            AND regexp_replace(lower(btrim(o.customer_name)), '\\s+', '', 'g')
              = regexp_replace(lower(btrim(c.company_name)), '\\s+', '', 'g'))
          OR (c.tax_id IS NOT NULL AND btrim(c.tax_id) <> ''
            AND length(regexp_replace(c.tax_id, '[^0-9]', '', 'g')) >= 8
            AND regexp_replace(coalesce(o.customer_name, ''), '[^0-9]', '', 'g')
              = regexp_replace(c.tax_id, '[^0-9]', '', 'g'))
          OR (c.mobile IS NOT NULL AND btrim(c.mobile) <> ''
            AND length(regexp_replace(c.mobile, '[^0-9]', '', 'g')) >= 8
            AND regexp_replace(coalesce(o.customer_name, ''), '[^0-9]', '', 'g')
              = regexp_replace(c.mobile, '[^0-9]', '', 'g'))
          OR (c.telephone IS NOT NULL AND btrim(c.telephone) <> ''
            AND length(regexp_replace(c.telephone, '[^0-9]', '', 'g')) >= 8
            AND regexp_replace(coalesce(o.customer_name, ''), '[^0-9]', '', 'g')
              = regexp_replace(c.telephone, '[^0-9]', '', 'g'))
        )
        WHERE o.customer_id IS NULL
      )
      UPDATE wholesale_orders o
      SET customer_id = ranked.customer_id
      FROM ranked
      WHERE o.id = ranked.order_id AND ranked.rn = 1 AND o.customer_id IS NULL
    `);

    await pool.query(`
      INSERT INTO wholesale_payments (customer_id, payment_date, amount, payment_method, note, created_by, created_at)
      SELECT
        r.wholesale_customer_id,
        r.payment_date,
        r.amount::numeric,
        r.payment_method,
        COALESCE(r.note, '') || CASE WHEN r.note IS NULL OR r.note = '' THEN '' ELSE ' ' END || '[from payment_record #' || r.id || ']',
        r.created_by,
        r.created_at
      FROM wholesale_payment_records r
      WHERE r.wholesale_customer_id IS NOT NULL
        AND COALESCE(r.amount::numeric, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM wholesale_payments p
          WHERE p.note LIKE '%[from payment_record #' || r.id || ']%'
        )
    `);

    await pool.query(`
      INSERT INTO wholesale_payment_allocations (payment_id, order_id, allocated_amount)
      SELECT p.id, r.wholesale_order_id, r.amount::numeric
      FROM wholesale_payment_records r
      JOIN wholesale_payments p ON p.note LIKE '%[from payment_record #' || r.id || ']%'
      WHERE r.wholesale_order_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM wholesale_payment_allocations a
          WHERE a.payment_id = p.id AND a.order_id = r.wholesale_order_id
        )
    `);

    logger.info(
      { matchedOrders: matched.rowCount ?? 0 },
      "DB migration: wholesale B2B accounts / payments ready",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: wholesale B2B accounts");
    return false;
  }
}
