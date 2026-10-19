/**
 * Verify quote dispatch workflow SQL against Railway PostgreSQL.
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function q(label, sql, params = []) {
  try {
    const r = await pool.query(sql, params);
    console.log(`OK  ${label} → ${r.rowCount ?? r.rows.length} rows`);
    return r.rows;
  } catch (err) {
    console.error(`FAIL ${label}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log("=== Workflow SQL verification ===\n");

  await q("column exists", `
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'dispatch_status'
  `);

  await q("quotes list with dispatch_status", `
    SELECT id, title, status, dispatch_status, created_at
    FROM quotes
    ORDER BY created_at DESC
    LIMIT 10
  `);

  const pending = await q("pending dispatch (已接受, no WO)", `
    SELECT q.id, q.title, q.status, q.dispatch_status
    FROM quotes q
    LEFT JOIN LATERAL (
      SELECT wo.id, wo.status
      FROM work_orders wo
      WHERE wo.quote_id = q.id
      ORDER BY wo.created_at DESC
      LIMIT 1
    ) wo ON true
    WHERE q.status = '已接受'
      AND wo.id IS NULL
    LIMIT 20
  `);
  console.log(`    → pending count: ${pending.length}`);

  await q("quotes + work_orders join", `
    SELECT q.id, q.dispatch_status, wo.work_order_number, wo.status AS wo_status
    FROM quotes q
    LEFT JOIN work_orders wo ON wo.quote_id = q.id
    WHERE q.dispatch_status IS NOT NULL
    LIMIT 10
  `);

  await q("dashboard pending dispatch aggregate", `
    SELECT COUNT(*)::int AS pending_dispatch_count
    FROM quotes
    WHERE status = '已接受' AND dispatch_status = '待派工'
  `);

  console.log("\n=== All SQL checks passed ===");
  await pool.end();
}

main().catch(async err => {
  console.error("\nVerification failed:", err.message);
  await pool.end();
  process.exit(1);
});
