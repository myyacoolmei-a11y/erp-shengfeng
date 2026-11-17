import { eq } from "drizzle-orm";
import { db, receivablesTable, paymentsTable } from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { recordReceivablePayment } from "../receivables/receivablePaymentService.ts";
import {
  deriveWoPaymentStatus,
  normalizeInvoiceStatus,
  remainingBalance,
} from "../../../shared/workOrderDispatch.ts";

function parseAmount(value: unknown): number {
  const n = parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export async function loadWorkOrderBilling(workOrderId: number) {
  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId));

  const payments = recv
    ? await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.receivableId, recv.id))
    : [];

  const activePayments = payments.filter((p) => !p.reversedAt && !p.reversalOfPaymentId && parseAmount(p.amount) > 0);
  const totalAmount = recv ? parseAmount(recv.totalAmount) : 0;
  const receivedAmount = recv ? parseAmount(recv.receivedAmount) : 0;

  return {
    receivableId: recv?.id ?? null,
    totalAmount,
    receivedAmount,
    remainingAmount: remainingBalance(totalAmount, receivedAmount),
    paymentStatus: recv?.paymentStatus ?? null,
    invoiceStatus: normalizeInvoiceStatus(recv?.invoiceStatus) || recv?.invoiceStatus || null,
    paymentMethod: recv?.paymentMethod ?? null,
    notes: recv?.notes ?? null,
    payments: activePayments.map((p) => ({
      id: p.id,
      amount: parseAmount(p.amount),
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      notes: p.notes,
      recordedBy: (p as { recordedBy?: string | null }).recordedBy ?? null,
    })),
  };
}

export async function upsertWorkOrderReceivable(opts: {
  workOrderId: number;
  workOrderNumber?: string | null;
  customerId: number | null | undefined;
  projectName?: string | null;
  projectType?: string | null;
  completionDate?: string | null;
  totalAmount: number | null | undefined;
  invoiceStatus?: string | null;
  paymentMethods?: string[] | null;
  billingNotes?: string | null;
  noCharge?: boolean;
  user?: JwtPayload | null;
}): Promise<{ receivableId: number | null; created: boolean }> {
  if (!opts.customerId) return { receivableId: null, created: false };

  const [existing] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, opts.workOrderId));

  const invoiceStatus = normalizeInvoiceStatus(opts.invoiceStatus) || existing?.invoiceStatus || "待開立";
  const methodLabel = (opts.paymentMethods ?? []).filter(Boolean).join("、") || existing?.paymentMethod || null;

  if (opts.noCharge) {
    if (existing) {
      const received = parseAmount(existing.receivedAmount);
      await db
        .update(receivablesTable)
        .set({
          paymentStatus: received > 0 ? existing.paymentStatus : "無須收款",
          invoiceStatus: invoiceStatus || existing.invoiceStatus,
          notes: opts.billingNotes ?? existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(receivablesTable.id, existing.id));
      return { receivableId: existing.id, created: false };
    }
    return { receivableId: null, created: false };
  }

  if (opts.totalAmount == null || !Number.isFinite(opts.totalAmount)) {
    if (existing && opts.invoiceStatus) {
      await db
        .update(receivablesTable)
        .set({
          invoiceStatus,
          paymentMethod: methodLabel,
          notes: opts.billingNotes ?? existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(receivablesTable.id, existing.id));
    }
    return { receivableId: existing?.id ?? null, created: false };
  }

  const total = Math.max(0, opts.totalAmount);
  if (existing) {
    const received = parseAmount(existing.receivedAmount);
    const paymentStatus = deriveWoPaymentStatus({
      noCharge: false,
      totalAmount: total,
      receivedAmount: received,
      storedStatus: existing.paymentStatus,
    });
    await db
      .update(receivablesTable)
      .set({
        totalAmount: String(total),
        paymentStatus,
        invoiceStatus,
        paymentMethod: methodLabel,
        notes: opts.billingNotes ?? existing.notes,
        projectType: opts.projectType ?? existing.projectType,
        projectName: opts.projectName ?? existing.projectName,
        workOrderNumber: opts.workOrderNumber ?? existing.workOrderNumber,
        updatedAt: new Date(),
      })
      .where(eq(receivablesTable.id, existing.id));
    return { receivableId: existing.id, created: false };
  }

  if (total <= 0) return { receivableId: null, created: false };

  const [created] = await db
    .insert(receivablesTable)
    .values({
      customerId: opts.customerId,
      workOrderId: opts.workOrderId,
      workOrderNumber: opts.workOrderNumber ?? null,
      projectName: opts.projectName ?? null,
      projectType: opts.projectType ?? null,
      completionDate: opts.completionDate ?? null,
      totalAmount: String(total),
      receivedAmount: "0",
      paymentStatus: "未收款",
      invoiceStatus: invoiceStatus || "待開立",
      paymentMethod: methodLabel,
      notes: opts.billingNotes ?? null,
    })
    .returning({ id: receivablesTable.id });

  return { receivableId: created?.id ?? null, created: true };
}

export async function recordWorkOrderPayment(opts: {
  workOrderId: number;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
  user: JwtPayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(opts.amount > 0)) return { ok: false, error: "收款金額必須大於 0" };

  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, opts.workOrderId));
  if (!recv) return { ok: false, error: "請先填寫應收總金額並綁定正式客戶" };

  try {
    await recordReceivablePayment({
      receivableId: recv.id,
      amount: opts.amount,
      paymentDate: opts.paymentDate,
      paymentMethod: opts.paymentMethod,
      notes: opts.notes,
      user: opts.user,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "收款失敗" };
  }
}
