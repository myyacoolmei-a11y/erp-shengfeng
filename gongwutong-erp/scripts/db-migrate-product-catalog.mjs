/**
 * Run product catalog data migration (usage types + wholesale_products backfill).
 * Uses DATABASE_URL from environment — on Railway, run inside the app container.
 *
 * Usage: node scripts/db-migrate-product-catalog.mjs
 */
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const useSsl =
  connectionString.includes(".proxy.rlwy.net") ||
  connectionString.includes("sslmode=require");

const pool = new pg.Pool({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

async function main() {
  const tableCheck = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'product_usage_types'
     ) AS exists`,
  );
  if (!tableCheck.rows[0]?.exists) {
    console.error("Table product_usage_types not found. Run npm run db:push first.");
    process.exit(1);
  }

  const existing = await pool.query(`SELECT COUNT(*)::int AS c FROM product_usage_types`);
  if (existing.rows[0]?.c > 0) {
    console.log("Product usage types already populated — skipping.");
    await pool.end();
    return;
  }

  console.log("Backfilling product_usage_types…");
  await pool.query(`
    INSERT INTO product_usage_types (product_id, usage_type)
    SELECT id, 'engineering_quote' FROM products
    ON CONFLICT (product_id, usage_type) DO NOTHING
  `);

  const colCheck = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'wholesale_price'
     ) AS exists`,
  );

  if (colCheck.rows[0]?.exists) {
    await pool.query(`
      INSERT INTO product_usage_types (product_id, usage_type)
      SELECT id, 'wholesale_sale' FROM products WHERE wholesale_price IS NOT NULL
      ON CONFLICT (product_id, usage_type) DO NOTHING
    `);
  }

  for (const tbl of ["wholesale_quote_items", "wholesale_order_items"]) {
    await pool.query(`
      INSERT INTO product_usage_types (product_id, usage_type)
      SELECT DISTINCT product_id, 'wholesale_sale' FROM ${tbl} WHERE product_id IS NOT NULL
      ON CONFLICT (product_id, usage_type) DO NOTHING
    `);
  }

  console.log("Backfilling wholesale_products…");
  if (colCheck.rows[0]?.exists) {
    await pool.query(`
      INSERT INTO wholesale_products (product_id, wholesale_price, min_quantity, is_enabled, sort_order)
      SELECT id, wholesale_price, 1, true, 0 FROM products WHERE wholesale_price IS NOT NULL
      ON CONFLICT (product_id) DO NOTHING
    `);
  }

  await pool.query(`
    INSERT INTO wholesale_products (product_id, min_quantity, is_enabled, sort_order)
    SELECT DISTINCT product_id, 1, true, 0 FROM product_usage_types WHERE usage_type = 'wholesale_sale'
    ON CONFLICT (product_id) DO NOTHING
  `);

  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM product_usage_types) AS usage_rows,
      (SELECT COUNT(*)::int FROM wholesale_products) AS wholesale_rows
  `);
  console.log("Done:", counts.rows[0]);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
