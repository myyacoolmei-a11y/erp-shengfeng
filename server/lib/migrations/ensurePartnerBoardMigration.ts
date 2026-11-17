import { pool } from "@workspace/db";
import { logger } from "../logger";

const DEFAULTS: Array<{ key: string; content: string }> = [
  { key: "daily_quote", content: "今天也要注意安全，每一步都穩穩的，辛苦了！" },
  { key: "announcement", content: "歡迎使用晟風夥伴，公司最新消息會公告在這裡。" },
  { key: "applause", content: "感謝每一位夥伴的付出，你們都是晟風最棒的後盾！" },
];

/** Idempotent: partner_board + partner_suggestions for 晟風夥伴. */
export async function ensurePartnerBoardMigration(): Promise<boolean> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_board (
        key text PRIMARY KEY,
        content text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by_user_id integer
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_suggestions (
        id serial PRIMARY KEY,
        content text NOT NULL,
        is_anonymous boolean NOT NULL DEFAULT false,
        author_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        author_display_name text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    for (const row of DEFAULTS) {
      await pool.query(
        `INSERT INTO partner_board (key, content) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [row.key, row.content],
      );
    }

    logger.info("DB migration: partner_board + partner_suggestions ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: partner board");
    return false;
  }
}
