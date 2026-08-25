import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  wholesaleOrdersTable,
  wholesalePaymentRecordsTable,
  wholesaleReceivablesTable,
} from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { writeAuditLog } from "../audit/auditLogService.ts";
import {
  allocateWholesalePayment,
  deriveWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
  type WholesalePaymentAllocation,
} from "../../../shared/wholesalePaymentMath.ts";

const SHIPPED_STATUS = "已出貨";
const PAYMENT_METHODS = new Set(["現金", "匯款", "支票", "其他"]);

export class WholesalePaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WholesalePaymentError";
    this.status = status;
  }
}

function assertPaymentMethod(method: string | null | undefined): string {
  const value = (method ?? "").trim() || "其他";
  if (!PAYMENT_METHODS.has(value)) {
    throw new WholesalePaymentError("收款方式請選擇現金、匯款、支票或其他");
  }
  return value;
}

export async function sumPaymentsForOrderIds(orderIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (orderIds.length === 0) return map;

  const rows = await db
    .select({
      orderId: wholesalePaymentRecordsTable.wholesaleOrderId,
      received: sql<number>`coalesce(sum(${wholesalePaymentRecordsTable.amount}), 0)::float`,
    })
    .from(wholesalePaymentRecordsTable)
    .where(inArray(wholesalePaymentRecordsTable.wholesaleOrderId, orderIds))
    .groupBy(wholesalePaymentRecordsTable.wholesaleOrderId);

  for (const row of rows) {
    if (row.orderId == null) continue;
    map.set(row.orderId, parseMoney(row.received));
  }
  return map;
}

export async function listPaymentsForOrderIds(orderIds: number[]) {
  if (orderIds.length === 0) return [];
  return db
    .select()
    .from(wholesalePaymentRecordsTable)
    .where(inArray(wholesalePaymentRecordsTable.wholesaleOrderId, orderIds))
    .orderBy(asc(wholesalePaymentRecordsTable.paymentDate), asc(wholesalePaymentRecordsTable.id));
}

export async function listPaymentsForCustomer(customerId: number) {
  return db
    .select()
    .from(wholesalePaymentRecordsTable)
    .where(eq(wholesalePaymentRecordsTable.wholesaleCustomerId, customerId))
    .orderBy(asc(wholesalePaymentRecordsTable.paymentDate), asc(wholesalePaymentRecordsTable.id));
}

async function ensureReceivableForOrder(order: typeof wholesaleOrdersTable.$inferSelect, receivedAmount: number) {
  const paymentStatus = deriveWholesalePaymentStatus(receivedAmount, parseMoney(order.total));
  const [existing] = await db
    .select()
    .from(wholesaleReceivablesTable)
    .where(eq(wholesaleReceivablesTable.orderId, order.id))
    .limit(1);

  const paidDate = paymentStatus === "已收清" ? new Date().toISOString().slice(0, 10) : null;
  const payload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerName: order.customerName,
    totalAmount: String(parseMoney(order.total)),
    receivedAmount: String(parseMoney(receivedAmount)),
    paymentStatus,
    paidDate: paymentStatus === "已收清" ? (existing?.paidDate ?? paidDate) : null,
    updatedAt: new Date(),
  };

  if (!existing) {
    await db.insert(wholesaleReceivablesTable).values(payload);
    return;
  }

  await db
    .update(wholesaleReceivablesTable)
    .set(payload)
    .where(eq(wholesaleReceivablesTable.id, existing.id));
}

export async function syncOrderReceivableFromPayments(orderId: number) {
  const [order] = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.id, orderId))
    .limit(1);
  if (!order) return null;

  const receivedMap = await sumPaymentsForOrderIds([orderId]);
  const received = receivedMap.get(orderId) ?? 0;
  await ensureReceivableForOrder(order, received);
  const total = parseMoney(order.total);
  return {
    orderId,
    totalAmount: total,
    receivedAmount: received,
    outstandingAmount: remainingAmount(total, received),
    paymentStatus: deriveWholesalePaymentStatus(received, total),
  };
}

async function loadShippedOrders(opts: {
  customerId: number;
  orderId?: number;
  from?: string;
  to?: string;
}) {
  const conditions = [
    eq(wholesaleOrdersTable.customerId, opts.customerId),
    eq(wholesaleOrdersTable.status, SHIPPED_STATUS),
  ];
  if (opts.orderId) conditions.push(eq(wholesaleOrdersTable.id, opts.orderId));
  if (opts.from) conditions.push(gte(wholesaleOrdersTable.orderDate, opts.from));
  if (opts.to) conditions.push(lte(wholesaleOrdersTable.orderDate, opts.to));

  return db
    .select()
    .from(wholesaleOrdersTable)
    .where(and(...conditions))
    .orderBy(asc(wholesaleOrdersTable.orderDate), asc(wholesaleOrdersTable.id));
}

async function unpaidAllocationsForOrders(orders: Array<typeof wholesaleOrdersTable.$inferSelect>) {
  const receivedMap = await sumPaymentsForOrderIds(orders.map(order => order.id));
  return orders.map(order => {
    const total = parseMoney(order.total);
    const received = receivedMap.get(order.id) ?? 0;
    return {
      order,
      total,
      received,
      remaining: remainingAmount(total, received),
    };
  });
}

async function insertAllocations(opts: {
  customerId: number;
  allocations: WholesalePaymentAllocation[];
  paymentDate: string;
  paymentMethod: string;
  note?: string | null;
  createdBy: number | null;
}) {
  const inserted = [];
  for (const allocation of opts.allocations) {
    const [row] = await db
      .insert(wholesalePaymentRecordsTable)
      .values({
        wholesaleCustomerId: opts.customerId,
        wholesaleOrderId: allocation.orderId,
        amount: String(allocation.amount),
        paymentDate: opts.paymentDate,
        paymentMethod: opts.paymentMethod,
        note: opts.note?.trim() ? opts.note.trim() : null,
        createdBy: opts.createdBy,
      })
      .returning();
    inserted.push(row);
    await syncOrderReceivableFromPayments(allocation.orderId);
  }
  return inserted;
}

export async function recordWholesalePayment(opts: {
  customerId: number;
  orderId?: number;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  note?: string;
  from?: string;
  to?: string;
  user: JwtPayload;
}) {
  const amount = parseMoney(opts.amount);
  if (!(amount > 0)) {
    throw new WholesalePaymentError("本次收款金額必須大於 0");
  }
  if (!opts.paymentDate) {
    throw new WholesalePaymentError("請填寫收款日期");
  }

  const paymentMethod = assertPaymentMethod(opts.paymentMethod);
  const orders = await loadShippedOrders({
    customerId: opts.customerId,
    orderId: opts.orderId,
    from: opts.orderId ? undefined : opts.from,
    to: opts.orderId ? undefined : opts.to,
  });

  if (orders.length === 0) {
    throw new WholesalePaymentError(opts.orderId ? "找不到此出貨單" : "此期間沒有可收款的出貨單", 404);
  }

  const snapshots = await unpaidAllocationsForOrders(orders);
  let allocations: WholesalePaymentAllocation[];
  try {
    allocations = allocateWholesalePayment(
      amount,
      snapshots.map(row => ({ orderId: row.order.id, remaining: row.remaining })),
    );
  } catch (err) {
    throw new WholesalePaymentError(err instanceof Error ? err.message : "無法分配收款金額");
  }

  const inserted = await insertAllocations({
    customerId: opts.customerId,
    allocations,
    paymentDate: opts.paymentDate,
    paymentMethod,
    note: opts.note,
    createdBy: opts.user.id,
  });

  await writeAuditLog({
    action: "wholesale.payment.recorded",
    entityType: "wholesale_payment_record",
    entityId: inserted[0]?.id ?? opts.customerId,
    user: opts.user,
    reason: opts.note,
    metadata: {
      customerId: opts.customerId,
      orderId: opts.orderId ?? null,
      amount,
      paymentDate: opts.paymentDate,
      paymentMethod,
      allocations,
    },
  });

  return inserted;
}

export async function updateWholesalePayment(opts: {
  id: number;
  amount?: number;
  paymentDate?: string;
  paymentMethod?: string;
  note?: string | null;
  user: JwtPayload;
}) {
  const [current] = await db
    .select()
    .from(wholesalePaymentRecordsTable)
    .where(eq(wholesalePaymentRecordsTable.id, opts.id))
    .limit(1);
  if (!current) {
    throw new WholesalePaymentError("找不到收款紀錄", 404);
  }
  if (current.wholesaleOrderId == null) {
    throw new WholesalePaymentError("此收款紀錄沒有對應出貨單，無法修改", 400);
  }

  const nextAmount = opts.amount == null ? parseMoney(current.amount) : parseMoney(opts.amount);
  if (!(nextAmount > 0)) {
    throw new WholesalePaymentError("收款金額必須大於 0");
  }

  const receivedMap = await sumPaymentsForOrderIds([current.wholesaleOrderId]);
  const otherReceived = parseMoney((receivedMap.get(current.wholesaleOrderId) ?? 0) - parseMoney(current.amount));
  const [order] = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.id, current.wholesaleOrderId))
    .limit(1);
  if (!order) {
    throw new WholesalePaymentError("找不到對應出貨單", 404);
  }
  const remaining = remainingAmount(parseMoney(order.total), otherReceived);
  if (nextAmount > remaining + 0.009) {
    throw new WholesalePaymentError(`收款金額不可超過未收金額（${remaining.toLocaleString("zh-TW")}）`);
  }

  const [updated] = await db
    .update(wholesalePaymentRecordsTable)
    .set({
      amount: String(nextAmount),
      paymentDate: opts.paymentDate ?? current.paymentDate,
      paymentMethod: opts.paymentMethod != null ? assertPaymentMethod(opts.paymentMethod) : current.paymentMethod,
      note: opts.note !== undefined ? (opts.note?.trim() ? opts.note.trim() : null) : current.note,
      updatedAt: new Date(),
    })
    .where(eq(wholesalePaymentRecordsTable.id, opts.id))
    .returning();

  await syncOrderReceivableFromPayments(current.wholesaleOrderId);
  await writeAuditLog({
    action: "wholesale.payment.updated",
    entityType: "wholesale_payment_record",
    entityId: opts.id,
    user: opts.user,
    reason: opts.note ?? current.note ?? undefined,
    metadata: {
      before: current,
      after: updated,
    },
  });
  return updated;
}

export async function deleteWholesalePayment(opts: { id: number; user: JwtPayload }) {
  const [current] = await db
    .select()
    .from(wholesalePaymentRecordsTable)
    .where(eq(wholesalePaymentRecordsTable.id, opts.id))
    .limit(1);
  if (!current) {
    throw new WholesalePaymentError("找不到收款紀錄", 404);
  }

  await db.delete(wholesalePaymentRecordsTable).where(eq(wholesalePaymentRecordsTable.id, opts.id));
  if (current.wholesaleOrderId != null) {
    await syncOrderReceivableFromPayments(current.wholesaleOrderId);
  }

  await writeAuditLog({
    action: "wholesale.payment.deleted",
    entityType: "wholesale_payment_record",
    entityId: opts.id,
    user: opts.user,
    reason: "刪除錯誤收款紀錄",
    metadata: { deleted: current },
  });

  return current;
}
