import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, paymentsTable, receivablesTable } from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { writeAuditLog } from "../audit/auditLogService.ts";
import {
  derivePaymentStatus,
  legacyReceivableNotesPattern,
  receivablePaymentNotes,
  remainingAmount,
} from "./receivablePaymentUtils.ts";

function parseAmount(value: unknown): number {
  return parseFloat(String(value ?? "0"));
}

async function findActivePaymentsForReceivable(receivableId: number) {
  const legacyPattern = `%${legacyReceivableNotesPattern(receivableId)}%`;
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        isNull(paymentsTable.reversedAt),
        isNull(paymentsTable.reversalOfPaymentId),
        or(
          eq(paymentsTable.receivableId, receivableId),
          sql`${paymentsTable.notes} LIKE ${legacyPattern}`,
        ),
      ),
    )
    .orderBy(paymentsTable.createdAt);

  return rows.filter(row => parseAmount(row.amount) > 0);
}

export async function recordReceivablePayment(opts: {
  receivableId: number;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
  user: JwtPayload;
}) {
  const [current] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.id, opts.receivableId));

  if (!current) {
    throw new Error("找不到應收帳款");
  }

  const total = parseAmount(current.totalAmount);
  const received = parseAmount(current.receivedAmount);
  const remaining = remainingAmount(total, received);

  if (opts.amount > remaining) {
    throw new Error(`收款金額不可超過未收金額（${remaining.toLocaleString("zh-TW")}）`);
  }

  const newReceived = received + opts.amount;
  const paymentStatus = derivePaymentStatus(newReceived, total);
  const paymentNotes = receivablePaymentNotes(opts.receivableId, opts.notes);

  const updateData: Record<string, unknown> = {
    receivedAmount: String(newReceived),
    paymentStatus,
    paymentMethod: opts.paymentMethod ?? current.paymentMethod,
  };

  if (paymentStatus === "已收款") {
    updateData.actualPaymentDate = opts.paymentDate;
  }

  await db.transaction(async tx => {
    await tx
      .update(receivablesTable)
      .set(updateData)
      .where(eq(receivablesTable.id, opts.receivableId));

    await tx.insert(paymentsTable).values({
      customerId: current.customerId,
      workOrderId: current.workOrderId ?? undefined,
      receivableId: opts.receivableId,
      amount: String(opts.amount),
      paymentDate: opts.paymentDate,
      paymentMethod: opts.paymentMethod ?? current.paymentMethod ?? undefined,
      notes: paymentNotes,
    });
  });

  await writeAuditLog({
    action: "receivable.payment.recorded",
    entityType: "receivable",
    entityId: opts.receivableId,
    user: opts.user,
    reason: opts.notes,
    metadata: {
      amount: opts.amount,
      paymentDate: opts.paymentDate,
      paymentMethod: opts.paymentMethod ?? null,
      paymentStatus,
      receivedAmount: newReceived,
      totalAmount: total,
    },
  });

  return { paymentStatus, receivedAmount: newReceived, remainingAmount: remainingAmount(total, newReceived) };
}

export async function reverseReceivablePayment(opts: {
  receivableId: number;
  reason: string;
  user: JwtPayload;
  paymentId?: number;
}) {
  const [current] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.id, opts.receivableId));

  if (!current) {
    throw new Error("找不到應收帳款");
  }

  const received = parseAmount(current.receivedAmount);
  if (received <= 0) {
    throw new Error("此筆尚無收款紀錄可撤銷");
  }

  let activePayments = await findActivePaymentsForReceivable(opts.receivableId);

  if (opts.paymentId) {
    activePayments = activePayments.filter(payment => payment.id === opts.paymentId);
  }

  if (activePayments.length === 0 && !opts.paymentId) {
    const total = parseAmount(current.totalAmount);
    await db
      .update(receivablesTable)
      .set({
        receivedAmount: "0",
        paymentStatus: "未收款",
        actualPaymentDate: null,
      })
      .where(eq(receivablesTable.id, opts.receivableId));

    await writeAuditLog({
      action: "receivable.payment.reversed",
      entityType: "receivable",
      entityId: opts.receivableId,
      user: opts.user,
      reason: opts.reason,
      metadata: {
        reversedPaymentIds: [],
        reversedAmount: received,
        receivedAmount: 0,
        paymentStatus: "未收款",
        totalAmount: total,
        legacyReset: true,
      },
    });

    return {
      paymentStatus: "未收款",
      reversedAmount: received,
      reversedPaymentIds: [],
    };
  }

  if (activePayments.length === 0) {
    throw new Error("找不到可撤銷的收款紀錄");
  }

  const now = new Date();
  const reversedPaymentIds: number[] = [];
  let reversedTotal = 0;

  await db.transaction(async tx => {
    for (const payment of activePayments) {
      const amount = parseAmount(payment.amount);
      if (amount <= 0) continue;

      reversedTotal += amount;
      reversedPaymentIds.push(payment.id);

      await tx
        .update(paymentsTable)
        .set({ reversedAt: now })
        .where(eq(paymentsTable.id, payment.id));

      await tx.insert(paymentsTable).values({
        customerId: payment.customerId,
        workOrderId: payment.workOrderId ?? undefined,
        receivableId: opts.receivableId,
        amount: String(-amount),
        paymentDate: now.toISOString().split("T")[0],
        paymentMethod: payment.paymentMethod ?? undefined,
        notes: `撤銷沖銷 #${payment.id}：${opts.reason}`,
        reversalOfPaymentId: payment.id,
      });
    }

    const total = parseAmount(current.totalAmount);
    const newReceived = Math.max(0, received - reversedTotal);
    const paymentStatus = derivePaymentStatus(newReceived, total);

    await tx
      .update(receivablesTable)
      .set({
        receivedAmount: String(newReceived),
        paymentStatus,
        actualPaymentDate: paymentStatus === "已收款" ? current.actualPaymentDate : null,
      })
      .where(eq(receivablesTable.id, opts.receivableId));
  });

  await writeAuditLog({
    action: "receivable.payment.reversed",
    entityType: "receivable",
    entityId: opts.receivableId,
    user: opts.user,
    reason: opts.reason,
    metadata: {
      reversedPaymentIds,
      reversedAmount: reversedTotal,
      receivedAmount: Math.max(0, received - reversedTotal),
      paymentStatus: derivePaymentStatus(Math.max(0, received - reversedTotal), parseAmount(current.totalAmount)),
      totalAmount: parseAmount(current.totalAmount),
    },
  });

  return {
    paymentStatus: derivePaymentStatus(Math.max(0, received - reversedTotal), parseAmount(current.totalAmount)),
    reversedAmount: reversedTotal,
    reversedPaymentIds,
  };
}
