/**
 * Integration test: quote dispatch workflow via server modules (no HTTP auth).
 * Run: npx tsx scripts/test-workflow-integration.mjs
 */
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
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

const { db, quotesTable } = await import("@workspace/db");
const { eq, desc } = await import("drizzle-orm");
const { syncQuoteDispatchBatch, listPendingDispatchQuotes } = await import("../server/lib/quoteWorkflow.ts");
const { getDashboardSummary } = await import("../server/lib/statistics/statisticsService.ts");

async function main() {
  console.log("=== Workflow integration test ===\n");

  const quoteRows = await db
    .select({
      id: quotesTable.id,
      status: quotesTable.status,
      dispatchStatus: quotesTable.dispatchStatus,
    })
    .from(quotesTable)
    .orderBy(desc(quotesTable.createdAt))
    .limit(20);

  const workflowMap = await syncQuoteDispatchBatch(quoteRows);
  console.log(`OK  syncQuoteDispatchBatch → ${workflowMap.size} quotes synced`);

  const sample = quoteRows.slice(0, 5).map(q => {
    const w = workflowMap.get(q.id);
    return {
      id: q.id,
      status: q.status,
      dispatchStatus: w?.dispatchStatus,
      workOrderNumber: w?.workOrderNumber,
    };
  });
  console.log("    sample:", JSON.stringify(sample, null, 2));

  const pending = await listPendingDispatchQuotes(20);
  console.log(`OK  listPendingDispatchQuotes → ${pending.length} pending`);
  if (pending.length > 0) {
    console.log("    first:", JSON.stringify(pending[0]));
  }

  const dashboard = await getDashboardSummary();
  console.log(`OK  getDashboardSummary → pendingDispatchCount=${dashboard.pendingDispatchCount}`);
  console.log(`    pendingDispatchQuotes=${dashboard.pendingDispatchQuotes?.length ?? 0} items`);

  const woLinked = [...workflowMap.values()].filter(w => w.workOrderId != null).length;
  const inProgress = [...workflowMap.values()].filter(w => w.dispatchStatus === "施工中").length;
  const completed = [...workflowMap.values()].filter(w => w.dispatchStatus === "已完工").length;
  console.log(`OK  dispatch breakdown: 已派工/施工中/已完工 linked=${woLinked} 施工中=${inProgress} 已完工=${completed}`);

  console.log("\n=== All workflow integration checks passed ===");
  process.exit(0);
}

main().catch(err => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
