import { pool } from "@workspace/db";
import { logger } from "../logger";
import { defaultCompanyAiWorkReminderSettings } from "../../../shared/aiWorkReminder.ts";

const WO_AI_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "estimated_work_minutes", ddl: "integer" },
  { name: "ai_reminder_enabled", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "ai_reminder_scenario_ids", ddl: "text" },
  { name: "ai_notify_supervisor_on_delay", ddl: "boolean NOT NULL DEFAULT false" },
  { name: "ai_reminder_rule_source", ddl: "text DEFAULT 'company_default'" },
  { name: "ai_reminder_custom_config", ddl: "text" },
];

/** Idempotent: work_orders AI reminder columns + company_ai_work_reminder_settings table. */
export async function ensureAiWorkReminderMigration(): Promise<boolean> {
  try {
    for (const col of WO_AI_COLUMNS) {
      const check = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'work_orders'
             AND column_name = $1
         ) AS exists`,
        [col.name],
      );
      if (!check.rows[0]?.exists) {
        await pool.query(`ALTER TABLE work_orders ADD COLUMN ${col.name} ${col.ddl}`);
        logger.info({ column: col.name }, "DB migration: work_orders AI reminder column added");
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_ai_work_reminder_settings (
        id serial PRIMARY KEY,
        scenarios_json text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const seed = JSON.stringify(defaultCompanyAiWorkReminderSettings());
    await pool.query(
      `INSERT INTO company_ai_work_reminder_settings (scenarios_json)
       SELECT $1::text
       WHERE NOT EXISTS (SELECT 1 FROM company_ai_work_reminder_settings LIMIT 1)`,
      [seed],
    );

    logger.info("DB migration: AI work reminder settings ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: AI work reminder");
    return false;
  }
}
