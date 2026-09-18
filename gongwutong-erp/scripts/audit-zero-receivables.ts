/**
 * List receivables with total_amount = 0 that may have a quote amount > 0.
 * Run: npx tsx scripts/audit-zero-receivables.ts
 * Optional fix: npx tsx scripts/audit-zero-receivables.ts --fix
 *   (only when quote final/amount > 0 AND no extra/discount in admin_billing_info)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, or, sql } from "drizzle-orm";

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

const doFix = process.argv.includes("--fix");

const { db, receivablesTable, workOrdersTable, quotesTable } = await import("../shared/db/index.ts");

const rows = await db
  .select({
    receivableId: receivablesTable.id,
    workOrderId: receivablesTable.workOrderId,
    totalAmount: receivablesTable.totalAmount,
    receivedAmount: receivablesTable.receivedAmount,
    createdAt: receivablesTable.createdAt,
    quoteId: workOrdersTable.quoteId,
    billing: workOrdersTable.adminBillingInfo,
    quoteAmount: quotesTable.amount,
    quoteFinal: quotesTable.finalAmount,
    quoteDiscount: quotesTable.discountAmount,
    workOrderNumber: workOrdersTable.workOrderNumber,
  })
  .from(receivablesTable)
  .leftJoin(workOrdersTable, eq(receivablesTable.workOrderId, workOrdersTable.id))
  .leftJoin(quotesTable, eq(workOrdersTable.quoteId, quotesTable.id))
  .where(
    or(
      eq(receivablesTable.totalAmount, "0"),
      eq(receivablesTable.totalAmount, "0.00"),
      sql`CAST(${receivablesTable.totalAmount} AS numeric) = 0`,
    ),
  );

console.log("zero_total_receivables", rows.length);
const fixable: typeof rows = [];
for (const r of rows) {
  const quoteAmt = parseFloat(String(r.quoteFinal ?? r.quoteAmount ?? "0")) || 0;
  const billing = (r.billing ?? {}) as { extraAmount?: string; discountAmount?: string; finalAmount?: string };
  const extra = parseFloat(String(billing.extraAmount ?? "0")) || 0;
  const discount = parseFloat(String(billing.discountAmount ?? "0")) || 0;
  const computed = Math.max(0, quoteAmt + extra - discount);
  const line = {
    receivable_id: r.receivableId,
    work_order_id: r.workOrderId,
    work_order_number: r.workOrderNumber,
    quotation_id: r.quoteId,
    current_total_amount: r.totalAmount,
    quotation_amount: quoteAmt,
    billing_extra: extra,
    billing_discount: discount,
    computed_final: computed,
    created_at: r.createdAt,
  };
  console.log(JSON.stringify(line));
  if (computed > 0 && quoteAmt > 0) fixable.push(r);
}

if (doFix) {
  console.log("\n--fix: restoring from quote+extra-discount where unambiguous…");
  for (const r of fixable) {
    const quoteAmt = parseFloat(String(r.quoteFinal ?? r.quoteAmount ?? "0")) || 0;
    const billing = (r.billing ?? {}) as { extraAmount?: string; discountAmount?: string };
    const extra = parseFloat(String(billing.extraAmount ?? "0")) || 0;
    const discount = parseFloat(String(billing.discountAmount ?? "0")) || 0;
    const computed = Math.max(0, quoteAmt + extra - discount);
    if (!(computed > 0)) continue;
    await db
      .update(receivablesTable)
      .set({ totalAmount: computed.toFixed(2), updatedAt: new Date() })
      .where(eq(receivablesTable.id, r.receivableId));
    console.log("fixed", r.receivableId, "->", computed.toFixed(2));
  }
} else {
  console.log("\nFixable count (quote>0):", fixable.length, "(re-run with --fix to apply)");
}

process.exit(0);
