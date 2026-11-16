/**
 * Test partial payment on WO-20260731-0079 receivable: 70000 then 10000.
 * Run: npx tsx scripts/test-wo-0079-payment.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

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

const { db, workOrdersTable, receivablesTable } = await import("../shared/db/index.ts");
const { recordReceivablePayment } = await import("../server/lib/receivables/receivablePaymentService.ts");

const [wo] = await db
  .select()
  .from(workOrdersTable)
  .where(eq(workOrdersTable.workOrderNumber, "WO-20260731-0079"));
if (!wo) throw new Error("WO not found");

const [recv] = await db
  .select()
  .from(receivablesTable)
  .where(eq(receivablesTable.workOrderId, wo.id));
if (!recv) throw new Error("receivable not found");

console.log("before", {
  id: recv.id,
  total: recv.totalAmount,
  received: recv.receivedAmount,
  status: recv.paymentStatus,
});

const fakeUser = { id: 1, role: "owner", username: "test" } as any;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

const total = parseFloat(String(recv.totalAmount));
const received = parseFloat(String(recv.receivedAmount));
const remaining = Math.max(0, total - received);

if (remaining >= 70000) {
  const r1 = await recordReceivablePayment({
    receivableId: recv.id,
    amount: 70000,
    paymentDate: today,
    notes: "test partial 70000",
    user: fakeUser,
  });
  console.log("after 70000", r1);
} else {
  console.log("skip 70000, remaining", remaining);
}

const [recv2] = await db
  .select()
  .from(receivablesTable)
  .where(eq(receivablesTable.id, recv.id));
const rem2 = Math.max(
  0,
  parseFloat(String(recv2!.totalAmount)) - parseFloat(String(recv2!.receivedAmount)),
);
console.log("remaining after first", rem2, "status", recv2!.paymentStatus);

if (rem2 > 0) {
  try {
    await recordReceivablePayment({
      receivableId: recv.id,
      amount: rem2 + 1,
      paymentDate: today,
      notes: "should fail overpay",
      user: fakeUser,
    });
    console.log("ERROR: overpay should have failed");
  } catch (e) {
    console.log("overpay blocked OK:", e instanceof Error ? e.message : e);
  }

  const r2 = await recordReceivablePayment({
    receivableId: recv.id,
    amount: rem2,
    paymentDate: today,
    notes: "test final payment",
    user: fakeUser,
  });
  console.log("after final", r2);
}

const [recv3] = await db
  .select()
  .from(receivablesTable)
  .where(eq(receivablesTable.id, recv.id));
console.log("final", {
  total: recv3!.totalAmount,
  received: recv3!.receivedAmount,
  status: recv3!.paymentStatus,
});
process.exit(0);
