import { pool } from "@workspace/db";
import { logger } from "../logger";

/**
 * Idempotent boot migration:
 * - quotes.lost_reason for 未成交統計
 * - remap legacy quote statuses to 客戶確認中 / 已成交 / 未成交
 * - unique work_orders.quote_id when data is clean (prevent duplicate dispatch)
 */
export async function ensureQuoteWinDispatchMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS lost_reason text
    `);

    await pool.query(`
      ALTER TABLE quotes
        ALTER COLUMN status SET DEFAULT '客戶確認中'
    `);

    await pool.query(`
      UPDATE quotes
      SET status = '客戶確認中'
      WHERE status IS NULL
         OR status IN (
           '草稿', '已送出', '尚未完成', '尚未送出',
           '等待客戶回覆', '等待修改', '等待確認', '等待成交',
           '客戶確認中'
         )
    `);

    await pool.query(`
      UPDATE quotes
      SET status = '已成交'
      WHERE status IN ('已接受', '已完成')
    `);

    await pool.query(`
      UPDATE quotes
      SET status = '未成交'
      WHERE status IN ('已拒絕', '已取消', '已失效')
    `);

    const dupes = await pool.query<{ quote_id: number; cnt: string }>(
      `SELECT quote_id, COUNT(*)::text AS cnt
         FROM work_orders
        WHERE quote_id IS NOT NULL
        GROUP BY quote_id
       HAVING COUNT(*) > 1
        LIMIT 1`,
    );

    if (dupes.rows.length > 0) {
      logger.warn(
        { quoteId: dupes.rows[0]?.quote_id, count: dupes.rows[0]?.cnt },
        "DB migration: skip unique work_orders.quote_id — existing duplicates remain; app-level lock still prevents new ones",
      );
    } else {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS work_orders_quote_id_uidx
          ON work_orders (quote_id)
          WHERE quote_id IS NOT NULL
      `);
    }

    logger.info("DB migration: quote win-and-dispatch statuses / lost_reason / unique quote_id ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: quote win-and-dispatch");
    return false;
  }
}
