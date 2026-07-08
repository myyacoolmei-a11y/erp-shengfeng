/**
 * Quote → Work Order workflow sync.
 * Keeps quotes.dispatchStatus aligned with quote.status + linked work order.
 */
import { eq, inArray, desc } from "drizzle-orm";
import { db, quotesTable, workOrdersTable } from "@workspace/db";

export const DISPATCH_STATUSES = ["未派工", "待派工", "已派工", "施工中", "已完工"] as const;
export type DispatchStatus = typeof DISPATCH_STATUSES[number];

export function deriveDispatchStatus(
  quoteStatus: string,
  workOrderStatus: string | null | undefined,
): DispatchStatus {
  if (!workOrderStatus) {
    return quoteStatus === "已接受" ? "待派工" : "未派工";
  }
  if (workOrderStatus === "已完成") return "已完工";
  if (workOrderStatus === "進行中") return "施工中";
  return "已派工";
}

export type LinkedWorkOrder = {
  id: number;
  workOrderNumber: string | null;
  status: string;
};

export async function loadLatestWorkOrdersByQuoteIds(
  quoteIds: number[],
): Promise<Map<number, LinkedWorkOrder>> {
  const map = new Map<number, LinkedWorkOrder>();
  if (quoteIds.length === 0) return map;

  const rows = await db
    .select({
      quoteId: workOrdersTable.quoteId,
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      status: workOrdersTable.status,
      createdAt: workOrdersTable.createdAt,
    })
    .from(workOrdersTable)
    .where(inArray(workOrdersTable.quoteId, quoteIds))
    .orderBy(desc(workOrdersTable.createdAt));

  for (const row of rows) {
    if (row.quoteId != null && !map.has(row.quoteId)) {
      map.set(row.quoteId, {
        id: row.id,
        workOrderNumber: row.workOrderNumber,
        status: row.status,
      });
    }
  }
  return map;
}

/** Recompute and persist dispatchStatus for one quote. */
export async function syncQuoteDispatchStatus(quoteId: number): Promise<{
  dispatchStatus: DispatchStatus;
  workOrderId: number | null;
  workOrderNumber: string | null;
} | null> {
  const [quote] = await db
    .select({ id: quotesTable.id, status: quotesTable.status, dispatchStatus: quotesTable.dispatchStatus })
    .from(quotesTable)
    .where(eq(quotesTable.id, quoteId));
  if (!quote) return null;

  const woMap = await loadLatestWorkOrdersByQuoteIds([quoteId]);
  const wo = woMap.get(quoteId);
  const dispatchStatus = deriveDispatchStatus(quote.status, wo?.status);

  if (dispatchStatus !== quote.dispatchStatus) {
    await db.update(quotesTable).set({ dispatchStatus }).where(eq(quotesTable.id, quoteId));
  }

  return {
    dispatchStatus,
    workOrderId: wo?.id ?? null,
    workOrderNumber: wo?.workOrderNumber ?? null,
  };
}

/** Batch-sync dispatchStatus for listed quotes (list API). */
export async function syncQuoteDispatchBatch(
  quotes: Array<{ id: number; status: string; dispatchStatus?: string | null }>,
): Promise<Map<number, { dispatchStatus: DispatchStatus; workOrderId: number | null; workOrderNumber: string | null }>> {
  const quoteIds = quotes.map(q => q.id);
  const woMap = await loadLatestWorkOrdersByQuoteIds(quoteIds);
  const result = new Map<number, { dispatchStatus: DispatchStatus; workOrderId: number | null; workOrderNumber: string | null }>();

  for (const q of quotes) {
    const wo = woMap.get(q.id);
    const dispatchStatus = deriveDispatchStatus(q.status, wo?.status);
    if (dispatchStatus !== (q.dispatchStatus ?? "未派工")) {
      await db.update(quotesTable).set({ dispatchStatus }).where(eq(quotesTable.id, q.id));
    }
    result.set(q.id, {
      dispatchStatus,
      workOrderId: wo?.id ?? null,
      workOrderNumber: wo?.workOrderNumber ?? null,
    });
  }
  return result;
}

export async function listPendingDispatchQuotes(limit = 15) {
  const rows = await db
    .select({
      id: quotesTable.id,
      title: quotesTable.title,
      customerName: quotesTable.customerName,
      status: quotesTable.status,
      dispatchStatus: quotesTable.dispatchStatus,
      amount: quotesTable.finalAmount,
      createdAt: quotesTable.createdAt,
    })
    .from(quotesTable)
    .where(eq(quotesTable.status, "已接受"))
    .orderBy(desc(quotesTable.createdAt));

  const ids = rows.map(r => r.id);
  const woMap = await loadLatestWorkOrdersByQuoteIds(ids);
  const pending: Array<{
    id: number;
    title: string;
    customerName: string | null;
    dispatchStatus: string;
    createdAt: string;
  }> = [];

  for (const q of rows) {
    const wo = woMap.get(q.id);
    const dispatchStatus = deriveDispatchStatus(q.status, wo?.status);
    if (dispatchStatus !== q.dispatchStatus) {
      await db.update(quotesTable).set({ dispatchStatus }).where(eq(quotesTable.id, q.id));
    }
    if (dispatchStatus === "待派工") {
      pending.push({
        id: q.id,
        title: q.title,
        customerName: q.customerName,
        dispatchStatus,
        createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : String(q.createdAt),
      });
    }
  }

  return pending.slice(0, limit);
}
