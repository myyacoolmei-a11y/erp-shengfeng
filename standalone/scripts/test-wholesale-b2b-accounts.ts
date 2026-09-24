/**
 * Wholesale B2B account math + live DB fixture (晟風空調 大里店).
 * Run: npx tsx scripts/test-wholesale-b2b-accounts.ts
 */
import {
  companyStatus,
  currentMonth,
  monthRange,
  orderPayStatus,
  round2,
  shiftMonth,
} from "../shared/wholesaleAccount.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

assert(monthRange("2026-09").start === "2026-09-01", "month start");
assert(monthRange("2026-09").end === "2026-09-30", "month end");
assert(monthRange("2026-09").label === "2026 年 9 月", "month label");
assert(shiftMonth("2026-09", -1) === "2026-08", "prev month");
assert(shiftMonth("2026-09", 1) === "2026-10", "next month");
assert(typeof currentMonth() === "string" && /^\d{4}-\d{2}$/.test(currentMonth()), "current month format");

assert(orderPayStatus(0, 38000) === "未收款", "order unpaid");
assert(orderPayStatus(10000, 28000) === "部分收款", "order partial");
assert(orderPayStatus(38000, 0) === "已結清", "order settled");

assert(companyStatus(93000, false) === "未結帳", "company unpaid");
assert(companyStatus(93000, true) === "部分收款", "company partial");
assert(companyStatus(0, true) === "已結清", "company settled");

const previousOutstanding = 20000;
const monthlySales = 38000 + 11000 + 54000;
const monthlyPaid = 30000;
const totalOutstanding = round2(previousOutstanding + monthlySales - monthlyPaid);
assert(monthlySales === 103000, "sample monthly sales 103000");
assert(totalOutstanding === 93000, "sample AR 93000");

if (process.exitCode) {
  console.error("wholesale B2B unit tests failed");
  process.exit(process.exitCode);
}

if (!process.env.DATABASE_URL) {
  console.log("SKIP DB: DATABASE_URL is not set");
  process.exit(0);
}

const { eq } = await import("drizzle-orm");
const { db, pool, wholesaleCustomersTable, wholesaleOrdersTable, wholesaleOrderItemsTable } = await import("@workspace/db");
const { ensureWholesaleAccountMigration } = await import("../server/lib/migrations/ensureWholesaleAccountMigration.ts");
const { listCustomerMonthOrders, listCustomerSummaries, getCustomerStatement } = await import("../server/lib/wholesale/accountService.ts");

const COMPANY = "晟風空調 大里店";
const MARKER = "[b2b-account-test-2026-09]";

async function cleanupTestRows(customerId: number) {
  const orders = await pool.query(
    `SELECT id FROM wholesale_orders WHERE customer_id = $1 AND coalesce(notes, '') LIKE $2`,
    [customerId, `%${MARKER}%`],
  );
  const ids = orders.rows.map((r: any) => Number(r.id));
  if (ids.length) {
    await pool.query(`DELETE FROM wholesale_payment_allocations WHERE order_id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM wholesale_order_items WHERE order_id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM wholesale_receivables WHERE order_id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM wholesale_payment_records WHERE wholesale_order_id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM wholesale_orders WHERE id = ANY($1::int[])`, [ids]);
  }
  await pool.query(
    `DELETE FROM wholesale_payment_allocations
     WHERE payment_id IN (SELECT id FROM wholesale_payments WHERE customer_id = $1 AND coalesce(note, '') LIKE $2)`,
    [customerId, `%${MARKER}%`],
  );
  await pool.query(
    `DELETE FROM wholesale_payments WHERE customer_id = $1 AND coalesce(note, '') LIKE $2`,
    [customerId, `%${MARKER}%`],
  );
}

async function insertOrder(opts: { customerId: number; date: string; total: number; productName: string; qty: number }) {
  const [order] = await db.insert(wholesaleOrdersTable).values({
    customerId: opts.customerId,
    customerName: COMPANY,
    orderDate: opts.date,
    status: "已出貨",
    notes: MARKER,
    subtotal: String(opts.total),
    taxRate: "0",
    taxAmount: "0",
    shippingFee: "0",
    total: String(opts.total),
    salesperson: "風哥",
  }).returning();
  const orderNumber = `WO-${opts.date.replace(/-/g, "")}-${String(order.id).padStart(3, "0")}`;
  await db.update(wholesaleOrdersTable).set({ orderNumber }).where(eq(wholesaleOrdersTable.id, order.id));
  await db.insert(wholesaleOrderItemsTable).values({
    orderId: order.id,
    productName: opts.productName,
    qty: opts.qty,
    unitPrice: String(opts.total / opts.qty),
    amount: String(opts.total),
    sortOrder: 0,
  });
  return order.id;
}

await ensureWholesaleAccountMigration();

let [customer] = await db.select().from(wholesaleCustomersTable).where(eq(wholesaleCustomersTable.companyName, COMPANY));
if (!customer) {
  [customer] = await db.insert(wholesaleCustomersTable).values({
    companyName: COMPANY,
    taxId: "12345678",
    contactPerson: "測試聯絡人",
    mobile: "0912345678",
    address: "台中市大里區測試路 1 號",
    paymentTerms: "月結 30 天",
    notes: MARKER,
  }).returning();
}

await cleanupTestRows(customer.id);

const augId = await insertOrder({ customerId: customer.id, date: "2026-08-20", total: 20000, productName: "前期未收測試", qty: 1 });
const sepA = await insertOrder({ customerId: customer.id, date: "2026-09-03", total: 38000, productName: "冰點 R32 冷暖", qty: 2 });
const sepB = await insertOrder({ customerId: customer.id, date: "2026-09-08", total: 11000, productName: "冰點 R32 冷專", qty: 1 });
const sepC = await insertOrder({ customerId: customer.id, date: "2026-09-15", total: 54000, productName: "冰點 R32 吊隱", qty: 1 });

const payIns = await pool.query(
  `INSERT INTO wholesale_payments (customer_id, payment_date, amount, payment_method, note)
   VALUES ($1, '2026-09-20', 30000, '匯款', $2)
   RETURNING id`,
  [customer.id, MARKER],
);
const paymentId = Number(payIns.rows[0].id);
await pool.query(
  `INSERT INTO wholesale_payment_allocations (payment_id, order_id, allocated_amount) VALUES
   ($1, $2, 20000),
   ($1, $3, 10000)`,
  [paymentId, augId, sepA],
);

const summaries = await listCustomerSummaries({ month: "2026-09" });
const row = summaries.find((s) => s.customerId === customer.id);
assert(!!row, "summary contains 晟風空調 大里店");
assert(summaries.filter((s) => s.customerId === customer.id).length === 1, "company appears once");
assert(row?.orderCount === 3, `Sep order count 3, got ${row?.orderCount}`);
assert(row?.monthlySales === 103000, `monthly sales 103000, got ${row?.monthlySales}`);
assert(row?.previousOutstanding === 20000, `previous AR 20000, got ${row?.previousOutstanding}`);
assert(row?.monthlyPaid === 30000, `monthly paid 30000, got ${row?.monthlyPaid}`);
assert(row?.totalOutstanding === 93000, `total AR 93000, got ${row?.totalOutstanding}`);
assert(row?.status === "部分收款", `status 部分收款, got ${row?.status}`);

const detail = await listCustomerMonthOrders({ customerId: customer.id, month: "2026-09" });
assert(detail.orders.length === 3, `detail has 3 Sep orders, got ${detail.orders.length}`);
assert(detail.orders.map((o) => o.orderId).sort().join(",") === [sepA, sepB, sepC].sort().join(","), "detail order ids match");

const stmt = await getCustomerStatement({ customerId: customer.id, month: "2026-09" });
assert(stmt?.monthlySales === 103000, "statement monthly sales");
assert(stmt?.previousOutstanding === 20000, "statement previous");
assert(stmt?.monthlyPaid === 30000, "statement paid");
assert(stmt?.totalOutstanding === 93000, "statement total");
assert((stmt?.lines.length ?? 0) >= 3, "statement has item lines");

const beforePay = row!.totalOutstanding;
const extraPay = await pool.query(
  `INSERT INTO wholesale_payments (customer_id, payment_date, amount, payment_method, note)
   VALUES ($1, '2026-09-25', 5000, '現金', $2)
   RETURNING id`,
  [customer.id, MARKER + " extra"],
);
const after = (await listCustomerSummaries({ month: "2026-09" })).find((s) => s.customerId === customer.id);
assert(after?.monthlyPaid === 35000, `live payment updates monthly paid, got ${after?.monthlyPaid}`);
assert(after?.totalOutstanding === beforePay - 5000, `live payment updates AR, got ${after?.totalOutstanding}`);
await pool.query(`DELETE FROM wholesale_payments WHERE id = $1`, [Number(extraPay.rows[0].id)]);

const leftover = await pool.query(
  `SELECT count(*)::int AS n FROM wholesale_orders WHERE customer_id = $1 AND coalesce(notes,'') NOT LIKE $2`,
  [customer.id, `%${MARKER}%`],
);
assert(true, `existing non-test orders retained: ${leftover.rows[0].n}`);

const unmatched = await db.insert(wholesaleOrdersTable).values({
  customerName: "幽靈批發客戶_未匹配",
  orderDate: "2026-09-10",
  status: "已出貨",
  notes: MARKER,
  subtotal: "1000",
  taxRate: "0",
  taxAmount: "0",
  shippingFee: "0",
  total: "1000",
}).returning();
await ensureWholesaleAccountMigration();
const stillUnbound = await pool.query(`SELECT customer_id FROM wholesale_orders WHERE id = $1`, [unmatched[0].id]);
assert(stillUnbound.rows[0].customer_id == null, "unmatched order stays unbound");
const unboundRow = (await listCustomerSummaries({ month: "2026-09" })).find((s) => s.unbound);
assert(unboundRow?.customerName === "未綁定批發客戶", `unbound label, got ${unboundRow?.customerName}`);

const nameOnly = await db.insert(wholesaleOrdersTable).values({
  customerName: COMPANY,
  orderDate: "2026-09-12",
  status: "已出貨",
  notes: MARKER,
  subtotal: "1",
  taxRate: "0",
  taxAmount: "0",
  shippingFee: "0",
  total: "1",
}).returning();
await ensureWholesaleAccountMigration();
const matched = await pool.query(`SELECT customer_id FROM wholesale_orders WHERE id = $1`, [nameOnly[0].id]);
assert(Number(matched.rows[0].customer_id) === customer.id, "name match backfills customer_id");
await pool.query(`DELETE FROM wholesale_orders WHERE id = $1`, [nameOnly[0].id]);


if (process.exitCode) {
  console.error("wholesale B2B DB tests failed");
  process.exit(process.exitCode);
}
console.log("wholesale B2B account tests passed");
