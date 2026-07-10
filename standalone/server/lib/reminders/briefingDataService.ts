import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import {
  db,
  receivablesTable,
  customersTable,
  quotesTable,
  workOrdersTable,
} from "@workspace/db";
import { loadLatestWorkOrdersByQuoteIds } from "../quoteWorkflow.ts";
import { diffDays, taipeiToday } from "./dateUtils.ts";

export interface UnpaidReceivableItem {
  id: number;
  customerName: string;
  projectName: string;
  unpaidAmount: number;
  expectedPaymentDate: string | null;
  overdueDays: number;
  daysUntilDue: number;
  isOverdue: boolean;
}

export interface PendingDispatchItem {
  id: number;
  customerName: string;
  projectName: string;
  quoteDate: string;
  waitingDays: number;
}

export interface QuoteFollowUpItem {
  id: number;
  customerName: string;
  quoteAmount: number;
  waitingDays: number;
}

function fmtQuoteDate(createdAt: unknown): string {
  const d = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function parseAmount(value: unknown): number {
  return parseFloat(String(value ?? "0"));
}

export async function fetchUnpaidReceivables(): Promise<UnpaidReceivableItem[]> {
  const today = taipeiToday();

  const rows = await db
    .select({
      id: receivablesTable.id,
      customerName: customersTable.name,
      projectName: receivablesTable.projectName,
      totalAmount: receivablesTable.totalAmount,
      receivedAmount: receivablesTable.receivedAmount,
      expectedPaymentDate: receivablesTable.expectedPaymentDate,
    })
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(ne(receivablesTable.paymentStatus, "已收款"));

  const items: UnpaidReceivableItem[] = [];

  for (const row of rows) {
    const total = parseAmount(row.totalAmount);
    const received = parseAmount(row.receivedAmount);
    const unpaid = Math.max(0, total - received);
    if (unpaid <= 0) continue;

    const expected = row.expectedPaymentDate;
    let overdueDays = 0;
    let daysUntilDue = 0;
    let isOverdue = false;

    if (expected) {
      if (expected < today) {
        isOverdue = true;
        overdueDays = diffDays(expected, today);
      } else {
        daysUntilDue = diffDays(today, expected);
      }
    }

    items.push({
      id: row.id,
      customerName: row.customerName ?? "—",
      projectName: row.projectName ?? "—",
      unpaidAmount: unpaid,
      expectedPaymentDate: expected,
      overdueDays,
      daysUntilDue,
      isOverdue,
    });
  }

  return items.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (a.isOverdue && b.isOverdue) return b.overdueDays - a.overdueDays;
    if (a.expectedPaymentDate && b.expectedPaymentDate) {
      return a.expectedPaymentDate.localeCompare(b.expectedPaymentDate);
    }
    return b.unpaidAmount - a.unpaidAmount;
  });
}

export async function fetchPendingDispatchQuotes(): Promise<PendingDispatchItem[]> {
  const today = taipeiToday();

  const rows = await db
    .select({
      id: quotesTable.id,
      title: quotesTable.title,
      customerName: quotesTable.customerName,
      status: quotesTable.status,
      createdAt: quotesTable.createdAt,
    })
    .from(quotesTable)
    .where(and(ne(quotesTable.status, "草稿"), ne(quotesTable.status, "已拒絕"), ne(quotesTable.status, "已取消")));

  const quoteIds = rows.map(r => r.id);
  const woMap = await loadLatestWorkOrdersByQuoteIds(quoteIds);

  const items: PendingDispatchItem[] = [];

  for (const row of rows) {
    if (woMap.has(row.id)) continue;
    if (row.status !== "已成交" && row.status !== "已接受") continue;

    const quoteDate = fmtQuoteDate(row.createdAt);
    items.push({
      id: row.id,
      customerName: row.customerName ?? "—",
      projectName: row.title,
      quoteDate,
      waitingDays: diffDays(quoteDate, today),
    });
  }

  return items.sort((a, b) => b.waitingDays - a.waitingDays);
}

export async function fetchQuoteFollowUps(): Promise<QuoteFollowUpItem[]> {
  const today = taipeiToday();

  const woRows = await db
    .select({ quoteId: workOrdersTable.quoteId })
    .from(workOrdersTable)
    .where(sql`${workOrdersTable.quoteId} IS NOT NULL`);

  const linkedQuoteIds = woRows.map(r => r.quoteId).filter((id): id is number => id != null);

  const rows = await db
    .select({
      id: quotesTable.id,
      customerName: quotesTable.customerName,
      amount: quotesTable.finalAmount,
      fallbackAmount: quotesTable.amount,
      createdAt: quotesTable.createdAt,
    })
    .from(quotesTable)
    .where(
      linkedQuoteIds.length > 0
        ? and(eq(quotesTable.status, "已送出"), notInArray(quotesTable.id, linkedQuoteIds))
        : eq(quotesTable.status, "已送出"),
    );

  return rows
    .map(row => ({
      id: row.id,
      customerName: row.customerName ?? "—",
      quoteAmount: parseAmount(row.amount ?? row.fallbackAmount),
      waitingDays: diffDays(fmtQuoteDate(row.createdAt), today),
    }))
    .sort((a, b) => b.waitingDays - a.waitingDays);
}
