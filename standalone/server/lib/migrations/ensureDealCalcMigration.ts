import { pool } from "@workspace/db";
import { logger } from "../logger";
import { DEFAULT_BENEFIT_RULES } from "../dealCalc/governmentBenefits.ts";

/** Idempotent: deal calculation tables + seed government benefit rules. */
export async function ensureDealCalcMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deal_calculations (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL DEFAULT 1,
        customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
        calc_type text NOT NULL,
        customer_name text,
        input_json text NOT NULL,
        result_json text NOT NULL,
        benefits_json text,
        ai_explanation_json text,
        agent_contact_json text,
        created_by_user_id integer NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS government_benefit_rules (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL DEFAULT 1,
        code text NOT NULL,
        name text NOT NULL,
        category text NOT NULL,
        description text NOT NULL,
        conditions_json text NOT NULL,
        source_url text NOT NULL,
        last_updated text NOT NULL,
        enabled integer NOT NULL DEFAULT 1,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_benefit_rules_tenant_code
        ON government_benefit_rules (tenant_id, code);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_timeline_events (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL DEFAULT 1,
        customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        title text NOT NULL,
        description text,
        ref_type text,
        ref_id integer,
        created_by_user_id integer REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deal_calc_tasks (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL DEFAULT 1,
        customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
        deal_calculation_id integer REFERENCES deal_calculations(id) ON DELETE CASCADE,
        title text NOT NULL,
        due_date text,
        status text NOT NULL DEFAULT 'pending',
        created_by_user_id integer REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    for (const rule of DEFAULT_BENEFIT_RULES) {
      await pool.query(
        `INSERT INTO government_benefit_rules
          (tenant_id, code, name, category, description, conditions_json, source_url, last_updated, sort_order)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, code) DO NOTHING`,
        [
          rule.code,
          rule.name,
          rule.category,
          rule.description,
          JSON.stringify(rule.conditions),
          rule.sourceUrl,
          rule.lastUpdated,
          rule.sortOrder,
        ],
      );
    }

    logger.info("DB migration: deal calculation center ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: deal calculation center");
    return false;
  }
}
