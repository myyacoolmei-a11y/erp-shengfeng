/**
 * Migrate quotes.dispatch_status to Railway PostgreSQL.
 * Uses DATABASE_PUBLIC_URL (local) or DATABASE_URL (Railway internal).
 *
 * For Railway public TCP proxy, set in .env:
 *   DATABASE_PUBLIC_URL=postgresql://postgres:...@xxx.proxy.rlwy.net:36202/railway
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

const url =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_PUBLIC_UNPOOLED_URL ||
  process.env.DATABASE_URL;

if (!url) {
  console.error("ERROR: Set DATABASE_PUBLIC_URL or DATABASE_URL in standalone/.env");
  process.exit(1);
}

const isPublic =
  url.includes(".proxy.rlwy.net") ||
  url.includes("railway.app") ||
  process.env.DATABASE_PUBLIC_URL != null;

const pool = new pg.Pool({
  connectionString: url,
  connectionTimeoutMillis: 15000,
  ...(isPublic ? { ssl: { rejectUnauthorized: false } } : {}),
});

async function main() {
  let host = "unknown";
  try {
    host = new URL(url.replace(/^postgres:/, "postgresql:")).hostname;
  } catch {
    /* ignore */
  }
  console.log(`Connecting (${isPublic ? "public+ssl" : "direct"}) host=${host}...`);

  const client = await pool.connect();
  try {
    const before = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'quotes'
           AND column_name = 'dispatch_status'
       ) AS exists`,
    );
    const existed = before.rows[0]?.exists === true;
    console.log(`Before: dispatch_status ${existed ? "EXISTS" : "MISSING"}`);

    if (!existed) {
      await client.query(
        `ALTER TABLE quotes
         ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT '未派工'`,
      );
      console.log("Migration: ALTER TABLE executed");
    } else {
      console.log("Migration: skipped (already exists)");
    }

    const after = await client.query(
      `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'quotes'
         AND column_name = 'dispatch_status'`,
    );
    if (after.rows.length === 0) {
      console.error("VERIFY FAILED: dispatch_status not found after migration");
      process.exit(1);
    }
    console.log("VERIFY OK:", after.rows[0]);
    process.exit(0);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("MIGRATION FAILED:", err.code ?? err.message);
  if (String(err.message).includes("ENOTFOUND")) {
    console.error(
      "\nHint: postgres.railway.internal only works inside Railway.",
      "Use DATABASE_PUBLIC_URL (*.proxy.rlwy.net:PORT) for local migration.",
    );
  }
  process.exit(1);
});
