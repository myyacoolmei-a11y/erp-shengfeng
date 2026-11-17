import { pool } from "@workspace/db";
import { logger } from "../logger";

/**
 * Idempotent boot migration for:
 * - Intent choice slip (意向選擇單) + Formal quotation (正式報價單)
 * - Option groups, customer selection records, electronic signature, confirmed snapshot
 * - Work order link back to source intent quote
 * Never drops or truncates existing tables or records.
 */
export async function ensureQuoteIntentAndSignatureMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'formal',
        ADD COLUMN IF NOT EXISTS workflow_stage text NOT NULL DEFAULT '待客戶確認',
        ADD COLUMN IF NOT EXISTS source_intent_quote_id integer REFERENCES quotes(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS converted_formal_quote_id integer REFERENCES quotes(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS intent_groups jsonb,
        ADD COLUMN IF NOT EXISTS customer_selected_at timestamptz,
        ADD COLUMN IF NOT EXISTS customer_selections jsonb,
        ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
        ADD COLUMN IF NOT EXISTS confirmation_method text,
        ADD COLUMN IF NOT EXISTS agreed_terms boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS signature_data_url text,
        ADD COLUMN IF NOT EXISTS confirmed_version integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS confirmed_snapshot jsonb,
        ADD COLUMN IF NOT EXISTS confirmed_html_snapshot text
    `);

    await pool.query(`
      ALTER TABLE quote_items
        ADD COLUMN IF NOT EXISTS install_fee numeric(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS work_content text,
        ADD COLUMN IF NOT EXISTS option_group_id text,
        ADD COLUMN IF NOT EXISTS option_group_name text,
        ADD COLUMN IF NOT EXISTS is_required_group boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS selection_mode text NOT NULL DEFAULT 'single',
        ADD COLUMN IF NOT EXISTS is_selected boolean
    `);

    await pool.query(`
      ALTER TABLE work_orders
        ADD COLUMN IF NOT EXISTS source_intent_quote_id integer REFERENCES quotes(id) ON DELETE SET NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_source_intent_quote_id
        ON quotes (source_intent_quote_id)
        WHERE source_intent_quote_id IS NOT NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_converted_formal_quote_id
        ON quotes (converted_formal_quote_id)
        WHERE converted_formal_quote_id IS NOT NULL
    `);

    logger.info("DB migration: quote intent choice slip + electronic signature + confirmed snapshot ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: quote intent and signature");
    return false;
  }
}
