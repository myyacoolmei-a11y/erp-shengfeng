/**
 * Smoke-test customer search query + WO-0079 AR uniqueness (no HTTP server).
 * Run: npx tsx scripts/verify-customer-search.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, ilike, or, desc } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}
process.env.DATABASE_URL =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_PUBLIC_UNPOOLED_URL ||
  process.env.DATABASE_URL;

const { db, customersTable, workOrdersTable, receivablesTable } = await import("../shared/db/index.ts");

const q = "阿風";
const pattern = `%${q}%`;
const rows = await db
  .select({ id: customersTable.id, name: customersTable.name, mobile: customersTable.mobile })
  .from(customersTable)
  .where(or(ilike(customersTable.name, pattern), ilike(customersTable.mobile, pattern)))
  .orderBy(desc(customersTable.updatedAt))
  .limit(21);
console.log("search 阿風 count", rows.length, rows.slice(0, 5));

const [wo] = await db
  .select()
  .from(workOrdersTable)
  .where(eq(workOrdersTable.workOrderNumber, "WO-20260731-0079"));
console.log("WO-0079", { id: wo?.id, customerId: wo?.customerId, customerName: wo?.customerName });

const recs = await db
  .select({ id: receivablesTable.id, totalAmount: receivablesTable.totalAmount, workOrderId: receivablesTable.workOrderId })
  .from(receivablesTable)
  .where(eq(receivablesTable.workOrderId, wo!.id));
console.log("receivables for WO", recs);

process.exit(0);
