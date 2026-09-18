/** Quick verify: monthly collection stats from receivables (same as dashboard). */
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
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const now = new Date();
const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

async function main() {
  const month = await pool.query(
    `SELECT COALESCE(SUM(received_amount::numeric), 0) AS total
     FROM receivables
     WHERE actual_payment_date IS NOT NULL
       AND received_amount::numeric > 0
       AND actual_payment_date >= $1 AND actual_payment_date <= $2`,
    [monthStart, monthEnd],
  );
  const todayQ = await pool.query(
    `SELECT COALESCE(SUM(received_amount::numeric), 0) AS total
     FROM receivables
     WHERE actual_payment_date = $1 AND received_amount::numeric > 0`,
    [today],
  );
  const detail = await pool.query(
    `SELECT c.name, r.received_amount, r.actual_payment_date, r.payment_status
     FROM receivables r
     LEFT JOIN customers c ON c.id = r.customer_id
     WHERE r.actual_payment_date >= $1 AND r.actual_payment_date <= $2
       AND r.received_amount::numeric > 0
     ORDER BY r.actual_payment_date DESC`,
    [monthStart, monthEnd],
  );
  console.log("Month range:", monthStart, "~", monthEnd);
  console.log("本月實收 (receivables):", Number(month.rows[0].total).toLocaleString("zh-TW"));
  console.log("今日收款:", Number(todayQ.rows[0].total).toLocaleString("zh-TW"));
  console.log("Detail:");
  for (const r of detail.rows) {
    console.log(`  ${r.name} | ${Number(r.received_amount).toLocaleString()} | ${r.actual_payment_date} | ${r.payment_status}`);
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
