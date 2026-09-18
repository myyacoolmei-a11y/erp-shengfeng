import { pool } from "@workspace/db";
import { logger } from "../logger";

/** Idempotent data migration: usage types + wholesale_products from legacy wholesale_price. */
export async function ensureProductCatalogMigration(): Promise<boolean> {
  try {
    const tableCheck = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'product_usage_types'
       ) AS exists`,
    );
    if (!tableCheck.rows[0]?.exists) {
      logger.info("DB migration: product_usage_types not yet created — run db:push first");
      return true;
    }

    const flagCheck = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM product_usage_types LIMIT 1
       ) AS exists`,
    );
    if (flagCheck.rows[0]?.exists) {
      return true;
    }

    logger.info("DB migration: backfilling product usage types and wholesale_products…");

    await pool.query(`
      INSERT INTO product_usage_types (product_id, usage_type)
      SELECT id, 'engineering_quote' FROM products
      ON CONFLICT (product_id, usage_type) DO NOTHING
    `);

    const wholesalePriceCol = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'products'
           AND column_name = 'wholesale_price'
       ) AS exists`,
    );

    if (wholesalePriceCol.rows[0]?.exists) {
      await pool.query(`
        INSERT INTO product_usage_types (product_id, usage_type)
        SELECT id, 'wholesale_sale' FROM products
        WHERE wholesale_price IS NOT NULL
        ON CONFLICT (product_id, usage_type) DO NOTHING
      `);
    }

    await pool.query(`
      INSERT INTO product_usage_types (product_id, usage_type)
      SELECT DISTINCT product_id, 'wholesale_sale'
      FROM wholesale_quote_items
      WHERE product_id IS NOT NULL
      ON CONFLICT (product_id, usage_type) DO NOTHING
    `);

    await pool.query(`
      INSERT INTO product_usage_types (product_id, usage_type)
      SELECT DISTINCT product_id, 'wholesale_sale'
      FROM wholesale_order_items
      WHERE product_id IS NOT NULL
      ON CONFLICT (product_id, usage_type) DO NOTHING
    `);

    const wpExists = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'wholesale_products'
       ) AS exists`,
    );

    if (wpExists.rows[0]?.exists) {
      if (wholesalePriceCol.rows[0]?.exists) {
        await pool.query(`
          INSERT INTO wholesale_products (product_id, wholesale_price, min_quantity, is_enabled, sort_order)
          SELECT p.id, p.wholesale_price, 1, true, 0
          FROM products p
          WHERE p.wholesale_price IS NOT NULL
          ON CONFLICT (product_id) DO NOTHING
        `);
      }

      await pool.query(`
        INSERT INTO wholesale_products (product_id, min_quantity, is_enabled, sort_order)
        SELECT DISTINCT put.product_id, 1, true, 0
        FROM product_usage_types put
        WHERE put.usage_type = 'wholesale_sale'
          AND NOT EXISTS (SELECT 1 FROM wholesale_products wp WHERE wp.product_id = put.product_id)
        ON CONFLICT (product_id) DO NOTHING
      `);
    }

    logger.info("DB migration: product catalog backfill complete");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: product catalog");
    return false;
  }
}
