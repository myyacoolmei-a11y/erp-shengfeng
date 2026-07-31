/**
 * One-shot backfill: bind customer_id on work orders missing it.
 * Run: npx tsx scripts/backfill-work-order-customers.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, isNull, isNotNull, or, and, inArray } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const dbUrl =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_PUBLIC_UNPOOLED_URL ||
  process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("ERROR: Set DATABASE_URL in standalone/.env");
  process.exit(1);
}

process.env.DATABASE_URL = dbUrl;

const { db, pool, workOrdersTable, customersTable, quotesTable } = await import("@workspace/db");

function normalizeDigits(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

type Category = "A" | "B" | "C";

interface ClassifiedWo {
  id: number;
  workOrderNumber: string | null;
  category: Category;
  customerId?: number;
  reason: string;
}

function buildUniquePhoneIndex(
  customers: { id: number; phone: string | null; mobile: string | null }[],
): Map<string, number> {
  const counts = new Map<string, Set<number>>();

  for (const c of customers) {
    for (const raw of [c.phone, c.mobile]) {
      const digits = normalizeDigits(raw);
      if (!digits) continue;
      const set = counts.get(digits) ?? new Set<number>();
      set.add(c.id);
      counts.set(digits, set);
    }
  }

  const unique = new Map<string, number>();
  for (const [digits, ids] of counts) {
    if (ids.size === 1) unique.set(digits, [...ids][0]!);
  }
  return unique;
}

const workOrders = await db
  .select({
    id: workOrdersTable.id,
    workOrderNumber: workOrdersTable.workOrderNumber,
    customerName: workOrdersTable.customerName,
    quoteId: workOrdersTable.quoteId,
    mobilePhone: workOrdersTable.mobilePhone,
  })
  .from(workOrdersTable)
  .where(
    and(
      isNull(workOrdersTable.customerId),
      or(
        isNotNull(workOrdersTable.customerName),
        isNotNull(workOrdersTable.quoteId),
        isNotNull(workOrdersTable.mobilePhone),
      ),
    ),
  );

const quoteIds = [...new Set(workOrders.map((wo) => wo.quoteId).filter((id): id is number => id != null))];
const quotes =
  quoteIds.length > 0
    ? await db
        .select({ id: quotesTable.id, customerId: quotesTable.customerId })
        .from(quotesTable)
        .where(inArray(quotesTable.id, quoteIds))
    : [];
const quoteById = new Map(quotes.map((q) => [q.id, q]));

const allCustomers = await db
  .select({ id: customersTable.id, phone: customersTable.phone, mobile: customersTable.mobile })
  .from(customersTable);
const uniquePhoneIndex = buildUniquePhoneIndex(allCustomers);

const classified: ClassifiedWo[] = [];

for (const wo of workOrders) {
  const woNum = wo.workOrderNumber ?? `id:${wo.id}`;

  if (wo.quoteId != null) {
    const quote = quoteById.get(wo.quoteId);
    if (quote?.customerId != null) {
      classified.push({
        id: wo.id,
        workOrderNumber: wo.workOrderNumber,
        category: "A",
        customerId: quote.customerId,
        reason: `quote_id=${wo.quoteId} → customer_id=${quote.customerId}`,
      });
      continue;
    }
  }

  const phoneDigits = normalizeDigits(wo.mobilePhone);
  if (phoneDigits) {
    const matchedCustomerId = uniquePhoneIndex.get(phoneDigits);
    if (matchedCustomerId != null) {
      classified.push({
        id: wo.id,
        workOrderNumber: wo.workOrderNumber,
        category: "B",
        customerId: matchedCustomerId,
        reason: `mobile_phone=${wo.mobilePhone} → customer_id=${matchedCustomerId}`,
      });
      continue;
    }
  }

  const parts: string[] = [];
  if (wo.quoteId != null) {
    const quote = quoteById.get(wo.quoteId);
    parts.push(quote ? "quote has no customer_id" : "quote not found");
  }
  if (phoneDigits) parts.push("phone not uniquely matched");
  else if (wo.mobilePhone) parts.push("mobile_phone not normalizable");
  if (parts.length === 0) parts.push("no quote or unique phone match");

  classified.push({
    id: wo.id,
    workOrderNumber: wo.workOrderNumber,
    category: "C",
    reason: parts.join("; "),
  });
}

const byCategory = {
  A: classified.filter((c) => c.category === "A"),
  B: classified.filter((c) => c.category === "B"),
  C: classified.filter((c) => c.category === "C"),
};

let updated = 0;
for (const item of [...byCategory.A, ...byCategory.B]) {
  await db
    .update(workOrdersTable)
    .set({ customerId: item.customerId! })
    .where(eq(workOrdersTable.id, item.id));
  updated++;
}

function listNumbers(items: ClassifiedWo[]): string {
  return items.map((i) => i.workOrderNumber ?? `id:${i.id}`).join(", ") || "(none)";
}

console.log("=== Work Order Customer Backfill ===");
console.log(`Scanned: ${workOrders.length} work orders with null customer_id`);
console.log(`Updated: ${updated}`);
console.log("");
console.log(`A (from quotation): ${byCategory.A.length}`);
console.log(`  ${listNumbers(byCategory.A)}`);
console.log("");
console.log(`B (unique phone match): ${byCategory.B.length}`);
console.log(`  ${listNumbers(byCategory.B)}`);
console.log("");
console.log(`C (manual): ${byCategory.C.length}`);
console.log(`  ${listNumbers(byCategory.C)}`);
if (byCategory.C.length > 0) {
  console.log("");
  console.log("C details:");
  for (const item of byCategory.C) {
    console.log(`  ${item.workOrderNumber ?? `id:${item.id}`}: ${item.reason}`);
  }
}

const target = classified.find(
  (c) => c.workOrderNumber === "WO-20260731-0079" || c.workOrderNumber?.endsWith("-0079"),
);
if (target) {
  console.log("");
  console.log(`WO-20260731-0079: category ${target.category}${target.category !== "C" ? " (fixed)" : " (not fixed)"}`);
} else {
  console.log("");
  console.log("WO-20260731-0079: not found in candidate set");
}

await pool.end();
