import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent: wholesale_payment_records ledger + backfill from snapshot received_amount. */
export async function ensureWholesalePaymentRecordsMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wholesale_payment_records (
        id serial PRIMARY KEY,
        wholesale_customer_id integer REFERENCES wholesale_customers(id) ON DELETE SET NULL,
        wholesale_order_id integer REFERENCES wholesale_orders(id) ON DELETE SET NULL,
        amount numeric(12, 2) NOT NULL,
        payment_date date NOT NULL,
        payment_method text,
        note text,
        created_by integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wholesale_payment_records_order
      ON wholesale_payment_records (wholesale_order_id, payment_date, id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wholesale_payment_records_customer
      ON wholesale_payment_records (wholesale_customer_id, payment_date, id);
    `);

    await pool.query(`
      UPDATE wholesale_orders o
      SET customer_name = c.company_name
      FROM wholesale_customers c
      WHERE o.customer_id = c.id
        AND (o.customer_name IS NULL OR btrim(o.customer_name) = '');
    `);

    await pool.query(`
      INSERT INTO wholesale_customers (company_name, payment_terms)
      SELECT DISTINCT btrim(o.customer_name), '月結'
      FROM wholesale_orders o
      WHERE o.customer_id IS NULL
        AND o.customer_name IS NOT NULL
        AND btrim(o.customer_name) <> ''
        AND btrim(o.customer_name) <> '未知客戶'
        AND NOT EXISTS (
          SELECT 1
          FROM wholesale_customers c
          WHERE regexp_replace(lower(btrim(c.company_name)), '\\s+', '', 'g')
              = regexp_replace(lower(btrim(o.customer_name)), '\\s+', '', 'g')
        );
    `);

    await pool.query(`
      WITH matched AS (
        SELECT DISTINCT ON (o.id)
          o.id AS order_id,
          c.id AS customer_id,
          c.company_name AS company_name
        FROM wholesale_orders o
        JOIN wholesale_customers c
          ON regexp_replace(lower(btrim(o.customer_name)), '\\s+', '', 'g')
           = regexp_replace(lower(btrim(c.company_name)), '\\s+', '', 'g')
        WHERE o.customer_id IS NULL
          AND o.customer_name IS NOT NULL
          AND btrim(o.customer_name) <> ''
        ORDER BY o.id, c.id ASC
      )
      UPDATE wholesale_orders o
      SET customer_id = matched.customer_id
      FROM matched
      WHERE o.id = matched.order_id
        AND o.customer_id IS NULL;
    `);

    await pool.query(`
      UPDATE wholesale_receivables wr
      SET customer_id = o.customer_id,
          customer_name = COALESCE(NULLIF(btrim(wr.customer_name), ''), o.customer_name)
      FROM wholesale_orders o
      WHERE wr.order_id = o.id
        AND wr.customer_id IS NULL
        AND o.customer_id IS NOT NULL;
    `);

    await pool.query(`
      INSERT INTO wholesale_payment_records (
        wholesale_customer_id,
        wholesale_order_id,
        amount,
        payment_date,
        payment_method,
        note
      )
      SELECT
        COALESCE(wr.customer_id, o.customer_id),
        wr.order_id,
        wr.received_amount,
        COALESCE(wr.paid_date, wr.updated_at::date, wr.created_at::date, CURRENT_DATE),
        COALESCE(NULLIF(wr.payment_method, ''), '其他'),
        '系統轉入既有已收金額'
      FROM wholesale_receivables wr
      LEFT JOIN wholesale_orders o ON o.id = wr.order_id
      WHERE wr.order_id IS NOT NULL
        AND COALESCE(wr.received_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM wholesale_payment_records p
          WHERE p.wholesale_order_id = wr.order_id
        );
    `);

    await pool.query(`
      UPDATE wholesale_payment_records p
      SET wholesale_customer_id = o.customer_id
      FROM wholesale_orders o
      WHERE p.wholesale_order_id = o.id
        AND p.wholesale_customer_id IS NULL
        AND o.customer_id IS NOT NULL;
    `);

    logger.info("DB migration: wholesale_payment_records ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: wholesale_payment_records");
    return false;
  }
}
