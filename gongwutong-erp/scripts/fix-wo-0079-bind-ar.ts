/**
 * Bind WO-20260731-0079 to customer (create if needed) and create AR 80000 if missing.
 * Run: npx tsx scripts/fix-wo-0079-bind-ar.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

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
process.env.DATABASE_URL =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_PUBLIC_UNPOOLED_URL ||
  process.env.DATABASE_URL;

const { db, workOrdersTable, customersTable, receivablesTable } = await import("../shared/db/index.ts");

const WO_NO = "WO-20260731-0079";

const [wo] = await db
  .select()
  .from(workOrdersTable)
  .where(eq(workOrdersTable.workOrderNumber, WO_NO));

if (!wo) {
  console.error("Work order not found:", WO_NO);
  process.exit(1);
}

console.log("WO before:", {
  id: wo.id,
  customerId: wo.customerId,
  customerName: wo.customerName,
  mobilePhone: wo.mobilePhone,
  installAddress: wo.installAddress,
  quoteId: wo.quoteId,
  status: wo.status,
});

let customerId = wo.customerId;
if (!customerId) {
  const phone = (wo.mobilePhone || "").replace(/\D/g, "");
  const name = wo.customerName || "阿風";
  // Prefer exact mobile match; else create
  let existing: { id: number } | undefined;
  if (phone) {
    const rows = await db.select({ id: customersTable.id, mobile: customersTable.mobile, phone: customersTable.phone }).from(customersTable);
    const matches = rows.filter((r) => {
      const m = (r.mobile || "").replace(/\D/g, "");
      const p = (r.phone || "").replace(/\D/g, "");
      return m === phone || p === phone;
    });
    if (matches.length === 1) existing = matches[0];
  }
  if (existing) {
    customerId = existing.id;
    console.log("Matched existing customer", customerId);
  } else {
    const [created] = await db
      .insert(customersTable)
      .values({
        name,
        mobile: wo.mobilePhone || null,
        address: wo.installAddress || null,
        contactPerson: wo.contactPerson || null,
        status: "成交客戶",
        source: "派工補綁",
      })
      .returning();
    customerId = created.id;
    console.log("Created customer", customerId, created.name);
  }
  await db
    .update(workOrdersTable)
    .set({
      customerId,
      customerName: name,
      updatedAt: new Date(),
    })
    .where(eq(workOrdersTable.id, wo.id));
  console.log("Bound WO to customerId", customerId);
}

const [recExisting] = await db
  .select({ id: receivablesTable.id })
  .from(receivablesTable)
  .where(eq(receivablesTable.workOrderId, wo.id));

if (recExisting) {
  console.log("Receivable already exists:", recExisting.id);
} else {
  const [rec] = await db
    .insert(receivablesTable)
    .values({
      customerId: customerId!,
      workOrderId: wo.id,
      workOrderNumber: wo.workOrderNumber,
      projectName: wo.title,
      projectType: wo.projectType,
      completionDate: wo.completedDate,
      totalAmount: "80000",
      receivedAmount: "0",
      paymentStatus: "未收款",
      invoiceStatus: "未開立",
    })
    .returning();
  console.log("Created receivable", rec.id, "amount 80000");
}

const [woAfter] = await db
  .select({
    id: workOrdersTable.id,
    customerId: workOrdersTable.customerId,
    customerName: workOrdersTable.customerName,
    workOrderNumber: workOrdersTable.workOrderNumber,
  })
  .from(workOrdersTable)
  .where(eq(workOrdersTable.id, wo.id));

console.log("WO after:", woAfter);
process.exit(0);
