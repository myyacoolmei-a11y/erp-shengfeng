/**
 * Wholesale AR payment ledger against the live database.
 * Run: npx tsx scripts/test-wholesale-payments-db.ts
 * Skips when DATABASE_URL is not set.
 */
if (!process.env.DATABASE_URL) {
  console.log("SKIP: DATABASE_URL is not set; math tests cover the 26,500 flow.");
  process.exit(0);
}

const { eq, inArray } = await import("drizzle-orm");
const math = await import("../shared/wholesalePaymentMath.ts");
const { ensureWholesalePaymentRecordsMigration } = await import("../server/lib/migrations/ensureWholesalePaymentRecordsMigration.ts");
const paymentService = await import("../server/lib/wholesale/wholesalePaymentService.ts");
const dbMod = await import("@workspace/db");

const {
  deriveWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
} = math;
const {
  deleteWholesalePayment,
  listPaymentsForOrderIds,
  recordWholesalePayment,
  sumPaymentsForOrderIds,
  syncOrderReceivableFromPayments,
} = paymentService;
const {
  db,
  usersTable,
  wholesaleCustomersTable,
  wholesaleOrderItemsTable,
  wholesaleOrdersTable,
  wholesalePaymentRecordsTable,
  wholesaleReceivablesTable,
} = dbMod;

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const TEST_NAME = "__AR_TEST_26500_DELETE_ME__";

async function cleanup(customerId?: number, orderId?: number) {
  const named = await db
    .select({ id: wholesaleCustomersTable.id })
    .from(wholesaleCustomersTable)
    .where(eq(wholesaleCustomersTable.companyName, TEST_NAME));
  const customerIds = [...new Set([
    ...named.map(row => row.id),
    ...(customerId ? [customerId] : []),
  ])];

  const orderRows = customerIds.length
    ? await db.select({ id: wholesaleOrdersTable.id }).from(wholesaleOrdersTable).where(inArray(wholesaleOrdersTable.customerId, customerIds))
    : [];
  const orderIds = [...new Set([
    ...orderRows.map(row => row.id),
    ...(orderId ? [orderId] : []),
  ])];

  if (orderIds.length) {
    await db.delete(wholesalePaymentRecordsTable).where(inArray(wholesalePaymentRecordsTable.wholesaleOrderId, orderIds));
    await db.delete(wholesaleReceivablesTable).where(inArray(wholesaleReceivablesTable.orderId, orderIds));
    await db.delete(wholesaleOrderItemsTable).where(inArray(wholesaleOrderItemsTable.orderId, orderIds));
    await db.delete(wholesaleOrdersTable).where(inArray(wholesaleOrdersTable.id, orderIds));
  }
  if (customerIds.length) {
    await db.delete(wholesalePaymentRecordsTable).where(inArray(wholesalePaymentRecordsTable.wholesaleCustomerId, customerIds));
    await db.delete(wholesaleReceivablesTable).where(inArray(wholesaleReceivablesTable.customerId, customerIds));
    await db.delete(wholesaleCustomersTable).where(inArray(wholesaleCustomersTable.id, customerIds));
  }
}

async function settlementSnapshot(orderId: number) {
  const receivedMap = await sumPaymentsForOrderIds([orderId]);
  const received = receivedMap.get(orderId) ?? 0;
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));
  const total = parseMoney(order?.total);
  const [receivable] = await db.select().from(wholesaleReceivablesTable).where(eq(wholesaleReceivablesTable.orderId, orderId));
  const payments = await listPaymentsForOrderIds([orderId]);
  return {
    orderTotal: total,
    received,
    outstanding: remainingAmount(total, received),
    status: deriveWholesalePaymentStatus(received, total),
    receivableReceived: parseMoney(receivable?.receivedAmount),
    receivableStatus: receivable?.paymentStatus,
    paymentCount: payments.length,
  };
}

await ensureWholesalePaymentRecordsMigration();
await cleanup();

const [user] = await db.select({
  id: usersTable.id,
  username: usersTable.username,
  displayName: usersTable.displayName,
  role: usersTable.role,
}).from(usersTable).limit(1);
if (!user) {
  console.error("FAIL: no user in database to act as created_by");
  process.exit(1);
}
const actor = {
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  roles: [user.role],
  mustChangePassword: false,
};

const [customer] = await db.insert(wholesaleCustomersTable).values({
  companyName: TEST_NAME,
  contactPerson: "測試",
  paymentTerms: "月結",
}).returning();

const today = new Date().toISOString().slice(0, 10);
const [order] = await db.insert(wholesaleOrdersTable).values({
  customerId: customer.id,
  customerName: TEST_NAME,
  orderDate: today,
  subtotal: "26500",
  taxRate: "0",
  taxAmount: "0",
  shippingFee: "0",
  total: "26500",
  status: "已出貨",
}).returning();
await db.update(wholesaleOrdersTable).set({ orderNumber: `WO-TEST-${order.id}` }).where(eq(wholesaleOrdersTable.id, order.id));
await db.insert(wholesaleOrderItemsTable).values({
  orderId: order.id,
  productName: "測試商品",
  qty: 1,
  unitPrice: "26500",
  amount: "26500",
  sortOrder: 0,
});

try {
  const unpaid = await settlementSnapshot(order.id);
  assert(unpaid.orderTotal === 26500 && unpaid.received === 0 && unpaid.outstanding === 26500, "shipped unpaid: 待收 26500 / 已收 0");
  assert(unpaid.status === "未收款", "shipped unpaid status 未收款");

  const first = await recordWholesalePayment({
    customerId: customer.id,
    orderId: order.id,
    amount: 10000,
    paymentDate: today,
    paymentMethod: "匯款",
    note: "第一筆",
    user: actor,
  });
  const partial = await settlementSnapshot(order.id);
  assert(first.length === 1 && parseMoney(first[0].amount) === 10000, "first payment stored 10000");
  assert(partial.received === 10000 && partial.outstanding === 16500, "after 10000: 已收 10000 / 待收 16500");
  assert(partial.status === "部分收款" && partial.receivableStatus === "部分收款", "status 部分收款 and snapshot matches");
  assert(partial.paymentCount === 1, "one payment record after first pay");

  const second = await recordWholesalePayment({
    customerId: customer.id,
    orderId: order.id,
    amount: 16500,
    paymentDate: today,
    paymentMethod: "匯款",
    note: "尾款",
    user: actor,
  });
  const paid = await settlementSnapshot(order.id);
  assert(second.length === 1, "second payment stored");
  assert(paid.received === 26500 && paid.outstanding === 0, "after 16500: 已收 26500 / 待收 0");
  assert(paid.status === "已收清" && paid.receivableStatus === "已收清", "status 已收清");
  assert(paid.paymentCount === 2, "two payment records after full pay");

  await deleteWholesalePayment({ id: second[0].id, user: actor });
  const afterDelete = await settlementSnapshot(order.id);
  assert(afterDelete.received === 10000 && afterDelete.outstanding === 16500, "delete second payment restores 已收 10000 / 待收 16500");
  assert(afterDelete.status === "部分收款", "status back to 部分收款");
  assert(afterDelete.paymentCount === 1, "one payment record remains");

  await syncOrderReceivableFromPayments(order.id);
  const synced = await settlementSnapshot(order.id);
  assert(synced.receivableReceived === 10000, "receivable snapshot matches SUM(payments)");
} finally {
  await cleanup(customer.id, order.id);
}

if (process.exitCode) {
  console.error("wholesale payment DB tests failed");
  process.exit(process.exitCode);
}
console.log("wholesale payment DB tests passed");
process.exit(0);
