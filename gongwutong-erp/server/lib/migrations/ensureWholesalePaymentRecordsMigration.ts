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
      INSERT INTO wholesale_payment_records (
        wholesale_customer_id,
        wholesale_order_id,
        amount,
        payment_date,
        payment_method,
        note
      )
      SELECT
        wr.customer_id,
        wr.order_id,
        wr.received_amount,
        COALESCE(wr.paid_date, wr.updated_at::date, wr.created_at::date, CURRENT_DATE),
        COALESCE(NULLIF(wr.payment_method, ''), '其他'),
        '系統轉入既有已收金額'
      FROM wholesale_receivables wr
      WHERE wr.order_id IS NOT NULL
        AND COALESCE(wr.received_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM wholesale_payment_records p
          WHERE p.wholesale_order_id = wr.order_id
        );
    `);

    logger.info("DB migration: wholesale_payment_records ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: wholesale_payment_records");
    return false;
  }
}
