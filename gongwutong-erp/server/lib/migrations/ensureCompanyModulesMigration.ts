import { pool } from "@workspace/db";
import { logger } from "../logger";
import {
  applyPlanToCompany,
  assignUsersMissingCompany,
  ensureCompanyFeatureRows,
  getDefaultCompany,
} from "../companyModuleService";
import { PLAN_SALES_TRIAL } from "../../../shared/companyModules.ts";

/**
 * Idempotent: companies + company_features + users.company_id
 * Seeds 試用公司 with 業務試用版 modules. Never touches Shengfeng production DB.
 */
export async function ensureCompanyModulesMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id serial PRIMARY KEY,
        name text NOT NULL,
        slug text UNIQUE,
        plan_key text NOT NULL DEFAULT 'sales_trial',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_features (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        feature_key text NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, feature_key)
      )
    `);

    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL
    `);

    const company = await getDefaultCompany();
    await ensureCompanyFeatureRows(company.id, company.planKey || PLAN_SALES_TRIAL);
    if ((company.planKey || PLAN_SALES_TRIAL) === PLAN_SALES_TRIAL) {
      const count = await pool.query(
        `SELECT COUNT(*)::int AS n FROM company_features WHERE company_id = $1`,
        [company.id],
      );
      const n = count.rows[0]?.n ?? 0;
      if (n === 0) {
        await applyPlanToCompany(company.id, PLAN_SALES_TRIAL);
      }
    }
    await assignUsersMissingCompany();

    logger.info(
      { companyId: company.id, planKey: company.planKey },
      "DB migration: companies / company_features ready",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: company modules");
    return false;
  }
}
