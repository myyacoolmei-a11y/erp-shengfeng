/**
 * Quote win-and-dispatch regression checks.
 * 1) Status mapping (no DB)
 * 2) If DATABASE_URL is set: create quote → win → duplicate blocked → lost quote has no WO
 */
import {
  normalizeQuoteStatus,
  isQuoteWon,
  isQuoteLost,
  isQuotePending,
  quoteListTab,
  quoteStatusLabel,
  formatLostReason,
  QUOTE_STATUS_PENDING,
  QUOTE_STATUS_WON,
  QUOTE_STATUS_LOST,
} from "../shared/quoteStatus.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function testStatusMapping() {
  const pendingSources = ["草稿", "已送出", "客戶確認中", "", null, "等待成交", "bogus"];
  for (const s of pendingSources) {
    assert(normalizeQuoteStatus(s as string) === QUOTE_STATUS_PENDING, `pending: ${s}`);
    assert(isQuotePending(s as string), `isPending: ${s}`);
    assert(quoteListTab(s as string) === "尚未成交", `tab pending: ${s}`);
    assert(quoteStatusLabel(s as string) === "客戶確認中", `label pending: ${s}`);
  }

  for (const s of ["已成交", "已接受", "已完成"]) {
    assert(normalizeQuoteStatus(s) === QUOTE_STATUS_WON, `won: ${s}`);
    assert(isQuoteWon(s), `isWon: ${s}`);
    assert(quoteListTab(s) === "已成交", `tab won: ${s}`);
  }

  for (const s of ["已拒絕", "未成交", "已取消", "已失效"]) {
    assert(normalizeQuoteStatus(s) === QUOTE_STATUS_LOST, `lost: ${s}`);
    assert(isQuoteLost(s), `isLost: ${s}`);
    assert(quoteListTab(s) === "未成交", `tab lost: ${s}`);
  }

  assert(formatLostReason("價格因素") === "價格因素", "lost reason");
  assert(formatLostReason("其他", "預算不足") === "其他：預算不足", "lost other");
  assert(formatLostReason("") === null, "empty reason");

  const canWin = (status: string | null | undefined) => !isQuoteWon(status) && !isQuoteLost(status);
  assert(canWin("客戶確認中"), "pending can win");
  assert(canWin("草稿"), "legacy pending can win");
  assert(!canWin("已成交"), "won cannot win again until canceled");
  assert(!canWin("未成交"), "lost cannot win");
  console.log("ok status mapping");
}

async function testDatabaseFlow() {
  if (!process.env.DATABASE_URL) {
    console.log("skip db flow (no DATABASE_URL)");
    return;
  }

  const { db, quotesTable, quoteItemsTable, workOrdersTable, workOrderEquipmentItemsTable, customersTable, receivablesTable } = await import("../shared/db/index.ts");
  const { eq } = await import("drizzle-orm");
  const { winQuoteAndCreateWorkOrder, markQuoteLost, cancelQuoteWin } = await import("../server/lib/quoteWinDispatch.ts");
  const { ensureQuoteWinDispatchMigration } = await import("../server/lib/migrations/ensureQuoteWinDispatchMigration.ts");

  await ensureQuoteWinDispatchMigration();

  const marker = `__test_win_dispatch_${Date.now()}__`;
  let recvId: number | null = null;
  let recvCustomerId: number | null = null;

  const [quote] = await db.insert(quotesTable).values({
    title: marker,
    customerName: "測試成交客戶",
    customerPhone: "0912345678",
    address: "台中市測試路 1 號",
    status: QUOTE_STATUS_PENDING,
    amount: "10000",
    finalAmount: "10000",
    notes: "工程備註測試",
    description: "施工說明測試",
  }).returning();

  await db.insert(quoteItemsTable).values({
    quoteId: quote.id,
    category: "裝新機",
    itemName: "測試冷氣",
    brand: "大金",
    model: "RX-TEST",
    quantity: "2",
    unit: "台",
    unitPrice: "5000",
    subtotal: "10000",
    notes: "項目備註",
    sortOrder: 0,
  });

  try {
    assert(normalizeQuoteStatus(quote.status) === QUOTE_STATUS_PENDING, "new quote pending");

    const first = await winQuoteAndCreateWorkOrder(quote.id, { id: 0, displayName: "測試成交者" });
    assert(first.ok, `first win failed: ${JSON.stringify(first)}`);
    if (!first.ok) return;
    assert(first.created === true, "first win should create");
    assert(first.scheduledDate == null, "scheduledDate must be null");
    assert(first.quoteStatus === QUOTE_STATUS_WON, "quote marked won");

    const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, first.workOrderId));
    assert(wo.quoteId === quote.id, "wo linked to quote");
    assert(wo.customerName === "測試成交客戶", "customer name copied");
    assert(wo.mobilePhone === "0912345678", "phone copied");
    assert(wo.installAddress === "台中市測試路 1 號", "address copied");
    assert(wo.scheduledDate == null, "wo date null");
    assert((wo.notes ?? "").includes("工程備註測試"), "notes copied");

    const eqItems = await db.select().from(workOrderEquipmentItemsTable).where(eq(workOrderEquipmentItemsTable.workOrderId, wo.id));
    assert(eqItems.length === 1, "equipment copied");
    assert(eqItems[0]?.itemName === "測試冷氣", "item name");
    assert(eqItems[0]?.brand === "大金", "brand");
    assert(eqItems[0]?.model === "RX-TEST", "model");
    assert(Number(eqItems[0]?.quantity) === 2, "qty");
    assert(Number(eqItems[0]?.unitPrice) === 5000, "unit price copied");

    const [wonQuote] = await db.select().from(quotesTable).where(eq(quotesTable.id, quote.id));
    assert(wonQuote.status === QUOTE_STATUS_WON, "db quote won");
    assert(wonQuote.wonAt != null, "won_at recorded");
    assert(wonQuote.wonByName === "測試成交者", "win operator recorded");

    const titleBefore = wonQuote.title;
    const notesBefore = wonQuote.notes;
    const amountBefore = String(wonQuote.amount);
    const wonAtBefore = wonQuote.wonAt;

    const [recvCustomer] = await db.insert(customersTable).values({
      name: `${marker}_recv_cust`,
      phone: "0912000000",
    }).returning();
    recvCustomerId = recvCustomer.id;
    const [recv] = await db.insert(receivablesTable).values({
      customerId: recvCustomer.id,
      workOrderId: first.workOrderId,
      workOrderNumber: first.workOrderNumber,
      projectName: marker,
      totalAmount: "10000",
      receivedAmount: "3000",
      paymentStatus: "部分收款",
    }).returning();
    recvId = recv.id;

    const canceled = await cancelQuoteWin(quote.id, { id: 0, displayName: "測試操作者" });
    assert(canceled.ok, `cancel win failed: ${JSON.stringify(canceled)}`);
    if (!canceled.ok) return;
    assert(canceled.quoteStatus === QUOTE_STATUS_PENDING, "cancel restores pending");
    assert(canceled.workOrderId === first.workOrderId, "cancel keeps existing WO id");
    assert(canceled.workOrderNumber === first.workOrderNumber, "cancel keeps WO number");

    const [afterCancel] = await db.select().from(quotesTable).where(eq(quotesTable.id, quote.id));
    assert(afterCancel.status === QUOTE_STATUS_PENDING, "db quote pending after cancel");
    assert(afterCancel.title === titleBefore, "title preserved");
    assert(afterCancel.notes === notesBefore, "notes preserved");
    assert(String(afterCancel.amount) === amountBefore, "amount preserved");
    assert(afterCancel.winCanceledAt != null, "win_canceled_at recorded");
    assert(afterCancel.winCanceledByName === "測試操作者", "cancel operator recorded");
    assert(afterCancel.wonAt != null, "original won_at kept");
    assert(String(afterCancel.wonAt) === String(wonAtBefore), "won_at not cleared");

    const itemsAfterCancel = await db.select().from(quoteItemsTable).where(eq(quoteItemsTable.quoteId, quote.id));
    assert(itemsAfterCancel.length === 1, "quote items preserved");
    const woAfterCancel = await db.select({ id: workOrdersTable.id }).from(workOrdersTable).where(eq(workOrdersTable.quoteId, quote.id));
    assert(woAfterCancel.length === 1, "work order preserved after cancel");

    const [recvAfterCancel] = await db.select().from(receivablesTable).where(eq(receivablesTable.id, recv.id));
    assert(recvAfterCancel != null, "receivable still exists");
    assert(String(recvAfterCancel.totalAmount) === "10000.00" || String(recvAfterCancel.totalAmount) === "10000", "receivable amount kept");
    assert(String(recvAfterCancel.receivedAmount) === "3000.00" || String(recvAfterCancel.receivedAmount) === "3000", "receivable received kept");
    assert(recvAfterCancel.paymentStatus === "部分收款", "receivable status kept");
    assert(recvAfterCancel.workOrderId === first.workOrderId, "receivable still linked to WO");

    const doubleCancel = await cancelQuoteWin(quote.id);
    assert(!doubleCancel.ok && doubleCancel.status === 400, "cannot cancel a quote that is not won");

    const rewin = await winQuoteAndCreateWorkOrder(quote.id, { id: 0, displayName: "測試操作者" });
    assert(rewin.ok, `re-win failed: ${JSON.stringify(rewin)}`);
    if (!rewin.ok) return;
    assert(rewin.created === false, "re-win must not create another WO");
    assert(rewin.workOrderId === first.workOrderId, "re-win relinks same WO");
    const [rewon] = await db.select().from(quotesTable).where(eq(quotesTable.id, quote.id));
    assert(rewon.status === QUOTE_STATUS_WON, "re-win marks won");

    const second = await winQuoteAndCreateWorkOrder(quote.id);
    assert(second.ok, "second call should return existing");
    if (!second.ok) return;
    assert(second.created === false, "second call must not create");
    assert(second.workOrderId === first.workOrderId, "same work order id");

    const woCount = await db.select({ id: workOrdersTable.id }).from(workOrdersTable).where(eq(workOrdersTable.quoteId, quote.id));
    assert(woCount.length === 1, `duplicate WOs: ${woCount.length}`);

    const lostAttempt = await markQuoteLost(quote.id, "價格因素");
    assert(!lostAttempt.ok && lostAttempt.status === 409, "cannot mark lost after WO exists");

    const [lostQuote] = await db.insert(quotesTable).values({
      title: `${marker}_lost`,
      customerName: "未成交客戶",
      customerPhone: "0987654321",
      status: QUOTE_STATUS_PENDING,
      amount: "1",
      finalAmount: "1",
    }).returning();

    const lost = await markQuoteLost(lostQuote.id, "客戶暫緩");
    assert(lost.ok, "mark lost ok");
    const [lostRow] = await db.select().from(quotesTable).where(eq(quotesTable.id, lostQuote.id));
    assert(lostRow.status === QUOTE_STATUS_LOST, "lost status");
    assert(lostRow.lostReason === "客戶暫緩", "lost reason");
    const lostWos = await db.select({ id: workOrdersTable.id }).from(workOrdersTable).where(eq(workOrdersTable.quoteId, lostQuote.id));
    assert(lostWos.length === 0, "lost quote has no WO");

    await db.delete(quotesTable).where(eq(quotesTable.id, lostQuote.id));
    console.log("ok database win/cancel/re-win/duplicate/lost flow");
  } finally {
    if (recvId != null) {
      await db.delete(receivablesTable).where(eq(receivablesTable.id, recvId));
    }
    await db.delete(workOrdersTable).where(eq(workOrdersTable.quoteId, quote.id));
    if (recvCustomerId != null) {
      await db.delete(customersTable).where(eq(customersTable.id, recvCustomerId));
    }
    await db.delete(quotesTable).where(eq(quotesTable.id, quote.id));
  }
}

testStatusMapping();
await testDatabaseFlow();
console.log("all quote-win-dispatch checks passed");
