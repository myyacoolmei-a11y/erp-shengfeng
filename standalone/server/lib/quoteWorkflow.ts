/**
 * Quote → Work Order workflow sync.
 * Keeps quotes.dispatchStatus and quotes.workflowStage aligned with quote.status + linked work order.
 */
import { eq, inArray, desc, or } from "drizzle-orm";
import { db, quotesTable, workOrdersTable } from "@workspace/db";
import { isQuoteWon } from "./quoteStatus";
import { deriveQuoteWorkflowStage } from "../../shared/quoteIntentLogic.ts";

export const DISPATCH_STATUSES = ["未派工", "待派工", "已派工", "施工中", "已完工", "已結案"] as const;
export type DispatchStatus = typeof DISPATCH_STATUSES[number];

export function deriveDispatchStatus(
  quoteStatus: string,
  workOrderStatus: string | null | undefined,
  scheduledDate?: string | null,
  assignedTo?: string | null,
): DispatchStatus {
  if (!workOrderStatus) {
    return isQuoteWon(quoteStatus) ? "待派工" : "未派工";
  }
  if (workOrderStatus === "已結案") return "已結案";
  if (workOrderStatus === "已完成") return "已完工";
  if (
    workOrderStatus === "施工中" ||
    workOrderStatus === "進行中" ||
    workOrderStatus === "異常" ||
    workOrderStatus === "暫停"
  ) {
    return "施工中";
  }
  if (
    (workOrderStatus === "待派工" || workOrderStatus === "待安排") &&
    !scheduledDate &&
    !assignedTo
  ) {
    return "待派工";
  }
  return "已派工";
}

export type LinkedWorkOrder = {
  id: number;
  workOrderNumber: string | null;
  status: string;
  scheduledDate: string | null;
  assignedTo: string | null;
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
      scheduledDate: workOrdersTable.scheduledDate,
      assignedTo: workOrdersTable.assignedTo,
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
        scheduledDate: row.scheduledDate ?? null,
        assignedTo: row.assignedTo ?? null,
      });
    }
  }
  return map;
}

/** Recompute and persist dispatchStatus & workflowStage for one quote. */
export async function syncQuoteDispatchStatus(quoteId: number): Promise<{
  dispatchStatus: DispatchStatus;
  workflowStage: string;
  workOrderId: number | null;
  workOrderNumber: string | null;
} | null> {
  const [quote] = await db
    .select({
      id: quotesTable.id,
      status: quotesTable.status,
      dispatchStatus: quotesTable.dispatchStatus,
      workflowStage: quotesTable.workflowStage,
      documentType: quotesTable.documentType,
      customerSelectedAt: quotesTable.customerSelectedAt,
      customerConfirmedAt: quotesTable.customerConfirmedAt,
      convertedFormalQuoteId: quotesTable.convertedFormalQuoteId,
    })
    .from(quotesTable)
    .where(eq(quotesTable.id, quoteId));
  if (!quote) return null;

  const woMap = await loadLatestWorkOrdersByQuoteIds([quoteId]);
  const wo = woMap.get(quoteId);
  const dispatchStatus = deriveDispatchStatus(quote.status, wo?.status, wo?.scheduledDate, wo?.assignedTo);
  const workflowStage = deriveQuoteWorkflowStage(
    {
      ...quote,
      workOrderId: wo?.id ?? null,
      dispatchStatus,
    },
    wo,
  );

  if (dispatchStatus !== quote.dispatchStatus || workflowStage !== quote.workflowStage) {
    await db
      .update(quotesTable)
      .set({ dispatchStatus, workflowStage })
      .where(eq(quotesTable.id, quoteId));
  }

  return {
    dispatchStatus,
    workflowStage,
    workOrderId: wo?.id ?? null,
    workOrderNumber: wo?.workOrderNumber ?? null,
  };
}

/** Batch-sync dispatchStatus & workflowStage for listed quotes (list API). */
export async function syncQuoteDispatchBatch(
  quotes: Array<{
    id: number;
    status: string;
    dispatchStatus?: string | null;
    workflowStage?: string | null;
    documentType?: string | null;
    customerSelectedAt?: Date | string | null;
    customerConfirmedAt?: Date | string | null;
    convertedFormalQuoteId?: number | null;
  }>,
): Promise<
  Map<
    number,
    {
      dispatchStatus: DispatchStatus;
      workflowStage: string;
      workOrderId: number | null;
      workOrderNumber: string | null;
    }
  >
> {
  const quoteIds = quotes.map((q) => q.id);
  const woMap = await loadLatestWorkOrdersByQuoteIds(quoteIds);
  const result = new Map<
    number,
    {
      dispatchStatus: DispatchStatus;
      workflowStage: string;
      workOrderId: number | null;
      workOrderNumber: string | null;
    }
  >();

  for (const q of quotes) {
    const wo = woMap.get(q.id);
    const dispatchStatus = deriveDispatchStatus(q.status, wo?.status, wo?.scheduledDate, wo?.assignedTo);
    const workflowStage = deriveQuoteWorkflowStage(
      {
        ...q,
        workOrderId: wo?.id ?? null,
        dispatchStatus,
      },
      wo,
    );
    if (dispatchStatus !== (q.dispatchStatus ?? "未派工") || workflowStage !== (q.workflowStage ?? "")) {
      await db
        .update(quotesTable)
        .set({ dispatchStatus, workflowStage })
        .where(eq(quotesTable.id, q.id));
    }
    result.set(q.id, {
      dispatchStatus,
      workflowStage,
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
    .where(or(eq(quotesTable.status, "已成交"), eq(quotesTable.status, "已接受")))
    .orderBy(desc(quotesTable.createdAt));

  const ids = rows.map((r) => r.id);
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
    const dispatchStatus = deriveDispatchStatus(q.status, wo?.status, wo?.scheduledDate, wo?.assignedTo);
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
