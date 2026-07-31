import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderFieldProgressTable,
  quotesTable,
  receivablesTable,
  adminTodosTable,
} from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { writeAuditLog } from "../audit/auditLogService.ts";
import { recordReceivablePayment } from "../receivables/receivablePaymentService.ts";
import {
  type AdminBillingInfo,
  type AdminWorkflowStatus,
  type ArchiveChecklist,
  emptyArchiveChecklist,
  isArchiveChecklistComplete,
  normalizeAdminWorkflowStatus,
} from "../../../shared/adminWorkflowConstants.ts";
import { taipeiDateString } from "./fieldProgressUtils.ts";

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function moneyStr(n: number): string {
  return n.toFixed(2);
}

async function transitionAdminStatus(opts: {
  workOrderId: number;
  from: string | null | undefined;
  to: AdminWorkflowStatus;
  user: JwtPayload;
  note?: string;
  extraUpdate?: Partial<typeof workOrdersTable.$inferInsert>;
}): Promise<void> {
  await db
    .update(workOrdersTable)
    .set({
      adminWorkflowStatus: opts.to,
      updatedAt: new Date(),
      ...(opts.extraUpdate ?? {}),
    })
    .where(eq(workOrdersTable.id, opts.workOrderId));

  await db
    .update(workOrderFieldProgressTable)
    .set({ workflowStatus: opts.to, updatedAt: new Date() })
    .where(eq(workOrderFieldProgressTable.workOrderId, opts.workOrderId));

  await writeAuditLog({
    action: "admin_workflow.transition",
    entityType: "work_order",
    entityId: opts.workOrderId,
    user: opts.user,
    reason: opts.note,
    metadata: {
      fromStatus: opts.from ?? null,
      toStatus: opts.to,
      note: opts.note ?? null,
    },
  });
}

export async function setPendingAdminReviewOnComplete(workOrderId: number, user: JwtPayload): Promise<void> {
  const [wo] = await db
    .select({ id: workOrdersTable.id, adminWorkflowStatus: workOrdersTable.adminWorkflowStatus })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, workOrderId))
    .limit(1);
  if (!wo) return;

  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "pending_admin_review",
    user,
    note: "工程師施工完成，進入待行政確認",
  });
}

function engineerDisplay(assignedTo: string | null, technicians: string | null): string {
  const parts: string[] = [];
  if (assignedTo?.trim()) parts.push(assignedTo.trim());
  if (technicians) {
    try {
      const arr = JSON.parse(technicians) as unknown;
      if (Array.isArray(arr)) {
        for (const t of arr) {
          const s = String(t).trim();
          if (s && !parts.includes(s)) parts.push(s);
        }
      } else if (typeof technicians === "string" && technicians.trim()) {
        parts.push(technicians.trim());
      }
    } catch {
      if (technicians.trim()) parts.push(technicians.trim());
    }
  }
  return parts.join("、") || "—";
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+08:00`).getTime();
  const b = new Date(`${to}T00:00:00+08:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export async function getAdminWorkbench() {
  const today = taipeiDateString(new Date());

  const rows = await db
    .select({
      wo: workOrdersTable,
      quoteAmount: quotesTable.amount,
      quoteDiscount: quotesTable.discountAmount,
      quoteFinal: quotesTable.finalAmount,
      fpCompletedAt: workOrderFieldProgressTable.completedAt,
      fpChecklist: workOrderFieldProgressTable.completionChecklist,
      fpEngineerName: workOrderFieldProgressTable.engineerName,
      fpUnableNote: workOrderFieldProgressTable.unableNote,
      fpFieldStatus: workOrderFieldProgressTable.fieldStatus,
    })
    .from(workOrdersTable)
    .leftJoin(quotesTable, eq(workOrdersTable.quoteId, quotesTable.id))
    .leftJoin(
      workOrderFieldProgressTable,
      and(
        eq(workOrderFieldProgressTable.workOrderId, workOrdersTable.id),
        isNotNull(workOrderFieldProgressTable.completedAt),
      ),
    )
    .where(
      and(
        isNotNull(workOrdersTable.adminWorkflowStatus),
        ne(workOrdersTable.adminWorkflowStatus, "closed"),
      ),
    )
    .orderBy(desc(workOrdersTable.updatedAt));

  // Dedupe by WO (multiple completed progress rows)
  const byId = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    const existing = byId.get(r.wo.id);
    if (!existing) {
      byId.set(r.wo.id, r);
      continue;
    }
    const prevAt = existing.fpCompletedAt?.getTime() ?? 0;
    const nextAt = r.fpCompletedAt?.getTime() ?? 0;
    if (nextAt >= prevAt) byId.set(r.wo.id, r);
  }

  const list = [...byId.values()];
  const woIds = list.map((r) => r.wo.id);
  const receivables =
    woIds.length === 0
      ? []
      : await db.select().from(receivablesTable).where(inArray(receivablesTable.workOrderId, woIds));
  const recvByWo = new Map<number, (typeof receivables)[number]>();
  for (const r of receivables) {
    if (r.workOrderId != null) recvByWo.set(r.workOrderId, r);
  }

  const pendingAdminReview: unknown[] = [];
  const pendingBilling: unknown[] = [];
  const pendingSubsidy: unknown[] = [];
  const collectionToday: unknown[] = [];
  const collectionSoon: unknown[] = [];
  const collectionOverdue: unknown[] = [];
  const collectionPartial: unknown[] = [];
  const pendingArchive: unknown[] = [];

  for (const r of list) {
    const status = normalizeAdminWorkflowStatus(r.wo.adminWorkflowStatus);
    if (!status || status === "closed") continue;

    const checklist = (r.fpChecklist ?? null) as Record<string, boolean> | null;
    const billing = (r.wo.adminBillingInfo ?? {}) as AdminBillingInfo;
    const quoteOriginal = num(r.quoteFinal ?? r.quoteAmount);
    const extra = num(billing.extraAmount);
    const discount = num(billing.discountAmount ?? r.quoteDiscount);
    const finalAmount = billing.finalAmount != null && billing.finalAmount !== ""
      ? num(billing.finalAmount)
      : Math.max(0, quoteOriginal + extra - discount);
    const recv = recvByWo.get(r.wo.id) ?? null;
    const total = recv ? num(recv.totalAmount) : finalAmount;
    const received = recv ? num(recv.receivedAmount) : 0;
    const unpaid = Math.max(0, total - received);
    const due = billing.expectedPaymentDate ?? recv?.expectedPaymentDate ?? null;
    const overdueDays = due ? daysBetween(due, today) : null;

    const base = {
      workOrderId: r.wo.id,
      workOrderNumber: r.wo.workOrderNumber,
      customerId: r.wo.customerId,
      customerName: r.wo.customerName,
      installAddress: r.wo.installAddress,
      mobilePhone: r.wo.mobilePhone,
      telephone: r.wo.telephone,
      engineerName: engineerDisplay(r.wo.assignedTo, r.wo.technicians) || r.fpEngineerName || "—",
      adminWorkflowStatus: status,
      completedAt: r.fpCompletedAt?.toISOString() ?? null,
      hasPhotos: !!checklist?.photos,
      hasSignature: !!checklist?.signed,
      hasMaterials: !!checklist?.materials,
      siteDone: !!checklist?.siteDone,
      anomalyNote: r.fpUnableNote ?? r.wo.notes ?? null,
      quoteOriginalAmount: moneyStr(quoteOriginal),
      extraAmount: moneyStr(extra),
      discountAmount: moneyStr(discount),
      finalAmount: moneyStr(finalAmount),
      invoiceNeeded: billing.invoiceNeeded ?? false,
      billTo: billing.billTo ?? r.wo.customerName,
      expectedPaymentDate: due,
      needsSubsidy: r.wo.adminNeedsSubsidy,
      subsidyStatus: r.wo.adminSubsidyStatus,
      subsidyAppliedAt: r.wo.adminSubsidyAppliedAt?.toISOString() ?? null,
      subsidyNote: r.wo.adminSubsidyNote,
      receivableId: recv?.id ?? null,
      totalAmount: moneyStr(total),
      receivedAmount: moneyStr(received),
      unpaidAmount: moneyStr(unpaid),
      billedAt: r.wo.adminBilledAt?.toISOString() ?? null,
      paymentStatus: recv?.paymentStatus ?? null,
      overdueDays: overdueDays != null && overdueDays > 0 ? overdueDays : overdueDays === 0 ? 0 : null,
      archiveChecklist: r.wo.adminArchiveChecklist,
    };

    if (status === "pending_admin_review") {
      pendingAdminReview.push(base);
      continue;
    }
    if (status === "pending_billing") {
      pendingBilling.push(base);
      if (r.wo.adminNeedsSubsidy && r.wo.adminSubsidyStatus !== "已申請補助") {
        pendingSubsidy.push(base);
      }
      continue;
    }
    if (
      (status === "billed" || status === "partially_paid" || status === "pending_billing") &&
      r.wo.adminNeedsSubsidy &&
      r.wo.adminSubsidyStatus !== "已申請補助"
    ) {
      pendingSubsidy.push(base);
    }

    if (status === "billed" || status === "partially_paid") {
      if (status === "partially_paid" || (recv && recv.paymentStatus === "部分收款")) {
        collectionPartial.push(base);
      }
      if (due) {
        const d = daysBetween(today, due);
        if (d < 0) collectionOverdue.push(base);
        else if (d === 0) collectionToday.push(base);
        else if (d <= 7) collectionSoon.push(base);
        else if (status === "billed") collectionSoon.push(base);
      } else if (status === "billed") {
        collectionSoon.push(base);
      }
      continue;
    }

    if (status === "paid" || status === "pending_archive") {
      pendingArchive.push({
        ...base,
        archiveChecklist:
          r.wo.adminArchiveChecklist ?? emptyArchiveChecklist(r.wo.adminNeedsSubsidy),
      });
    }
  }

  const startOfDay = new Date(`${today}T00:00:00+08:00`);
  const endOfDay = new Date(`${today}T23:59:59.999+08:00`);

  const todayStats = {
    confirmedToday: (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(workOrdersTable)
        .where(
          and(
            isNotNull(workOrdersTable.adminConfirmedAt),
            sql`${workOrdersTable.adminConfirmedAt} >= ${startOfDay}`,
            sql`${workOrdersTable.adminConfirmedAt} <= ${endOfDay}`,
          ),
        )
    )[0]?.n ?? 0,
    billedToday: (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(workOrdersTable)
        .where(
          and(
            isNotNull(workOrdersTable.adminBilledAt),
            sql`${workOrdersTable.adminBilledAt} >= ${startOfDay}`,
            sql`${workOrdersTable.adminBilledAt} <= ${endOfDay}`,
          ),
        )
    )[0]?.n ?? 0,
    paidToday: (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(receivablesTable)
        .where(
          and(
            eq(receivablesTable.paymentStatus, "已收款"),
            eq(receivablesTable.actualPaymentDate, today),
          ),
        )
    )[0]?.n ?? 0,
    archivedToday: (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(workOrdersTable)
        .where(
          and(
            isNotNull(workOrdersTable.adminArchivedAt),
            sql`${workOrdersTable.adminArchivedAt} >= ${startOfDay}`,
            sql`${workOrdersTable.adminArchivedAt} <= ${endOfDay}`,
          ),
        )
    )[0]?.n ?? 0,
    closedToday: (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(workOrdersTable)
        .where(
          and(
            eq(workOrdersTable.adminWorkflowStatus, "closed"),
            isNotNull(workOrdersTable.adminArchivedAt),
            sql`${workOrdersTable.adminArchivedAt} >= ${startOfDay}`,
            sql`${workOrdersTable.adminArchivedAt} <= ${endOfDay}`,
          ),
        )
    )[0]?.n ?? 0,
  };

  const openTodoCount =
    pendingAdminReview.length +
    pendingBilling.length +
    pendingSubsidy.length +
    collectionToday.length +
    collectionSoon.length +
    collectionOverdue.length +
    collectionPartial.length +
    pendingArchive.length;

  return {
    today,
    alerts: {
      hasOverdue: collectionOverdue.length > 0,
      hasDueToday: collectionToday.length > 0,
      overdueCount: collectionOverdue.length,
      dueTodayCount: collectionToday.length,
    },
    counts: {
      overdue: collectionOverdue.length,
      dueToday: collectionToday.length,
      pendingAdminReview: pendingAdminReview.length,
      pendingBilling: pendingBilling.length,
      pendingSubsidy: pendingSubsidy.length,
      pendingArchive: pendingArchive.length,
      openTodos: openTodoCount,
    },
    sections: {
      collectionOverdue,
      collectionToday,
      collectionSoon,
      collectionPartial,
      pendingAdminReview,
      pendingBilling,
      pendingSubsidy,
      pendingArchive,
    },
    todayStats: {
      ...todayStats,
      openTodos: openTodoCount,
    },
  };
}

export async function confirmAdminCompletion(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");

  const status = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (status !== "pending_admin_review") {
    throw new Error("此案件不在待行政確認");
  }

  const [fp] = await db
    .select()
    .from(workOrderFieldProgressTable)
    .where(
      and(
        eq(workOrderFieldProgressTable.workOrderId, workOrderId),
        isNotNull(workOrderFieldProgressTable.completedAt),
      ),
    )
    .orderBy(desc(workOrderFieldProgressTable.completedAt))
    .limit(1);

  const checklist = (fp?.completionChecklist ?? null) as Record<string, boolean> | null;
  const missing: string[] = [];
  if (!fp?.completedAt) missing.push("工程師尚未按施工完成");
  if (!checklist?.photos) missing.push("缺少完工照片確認");
  if (!checklist?.signed) missing.push("客戶簽名尚未完成");
  if (missing.length) return { ok: false, missing };

  const now = new Date();
  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "pending_billing",
    user,
    note: note ?? "行政確認完工",
    extraUpdate: {
      adminConfirmedAt: now,
      adminConfirmedBy: user.id,
    },
  });

  await db
    .update(adminTodosTable)
    .set({ status: "done", updatedAt: now })
    .where(
      and(
        eq(adminTodosTable.workOrderId, workOrderId),
        eq(adminTodosTable.todoType, "field_complete"),
      ),
    );

  return { ok: true };
}

export async function updateBillingDraft(
  workOrderId: number,
  user: JwtPayload,
  billing: AdminBillingInfo & { needsSubsidy?: boolean },
): Promise<void> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");
  const status = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (status !== "pending_billing" && status !== "billed" && status !== "partially_paid") {
    throw new Error("此案件目前不可編輯請款資料");
  }

  const prev = (wo.adminBillingInfo ?? {}) as AdminBillingInfo;
  const next: AdminBillingInfo = {
    ...prev,
    ...billing,
  };
  delete (next as { needsSubsidy?: boolean }).needsSubsidy;

  await db
    .update(workOrdersTable)
    .set({
      adminBillingInfo: next,
      adminNeedsSubsidy: billing.needsSubsidy ?? wo.adminNeedsSubsidy,
      updatedAt: new Date(),
    })
    .where(eq(workOrdersTable.id, workOrderId));

  await writeAuditLog({
    action: "admin_workflow.billing_draft",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    metadata: { billing: next, needsSubsidy: billing.needsSubsidy ?? wo.adminNeedsSubsidy },
  });
}

export async function markBilled(
  workOrderId: number,
  user: JwtPayload,
  input: AdminBillingInfo & { needsSubsidy?: boolean; note?: string },
): Promise<{ receivableId: number }> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");
  const status = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (status !== "pending_billing") throw new Error("此案件不在待請款");

  if (!wo.customerId) throw new Error("派工單未綁定客戶，無法建立請款");

  const [quote] = wo.quoteId
    ? await db.select().from(quotesTable).where(eq(quotesTable.id, wo.quoteId)).limit(1)
    : [null];

  const billing: AdminBillingInfo = {
    ...((wo.adminBillingInfo ?? {}) as AdminBillingInfo),
    ...input,
  };
  const quoteOriginal = num(quote?.finalAmount ?? quote?.amount);
  const extra = num(billing.extraAmount);
  const discount = num(billing.discountAmount ?? quote?.discountAmount);
  const finalAmount =
    billing.finalAmount != null && billing.finalAmount !== ""
      ? num(billing.finalAmount)
      : Math.max(0, quoteOriginal + extra - discount);

  billing.finalAmount = moneyStr(finalAmount);

  let [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);

  if (!recv) {
    const [created] = await db
      .insert(receivablesTable)
      .values({
        customerId: wo.customerId,
        workOrderId: wo.id,
        workOrderNumber: wo.workOrderNumber,
        projectName: wo.title,
        projectType: wo.projectType,
        completionDate: wo.completedDate,
        totalAmount: moneyStr(finalAmount),
        receivedAmount: "0",
        paymentStatus: "未收款",
        expectedPaymentDate: billing.expectedPaymentDate ?? null,
        invoiceStatus: billing.invoiceNeeded ? "未開立" : "未開立",
        invoiceTitle: billing.billTo ?? wo.customerName,
        subsidyStatus: wo.adminNeedsSubsidy || input.needsSubsidy ? "未申請補助" : "未申請補助",
        notes: input.note ?? null,
      })
      .returning();
    recv = created;
  } else {
    const [updated] = await db
      .update(receivablesTable)
      .set({
        totalAmount: moneyStr(finalAmount),
        expectedPaymentDate: billing.expectedPaymentDate ?? recv.expectedPaymentDate,
        invoiceTitle: billing.billTo ?? recv.invoiceTitle,
        updatedAt: new Date(),
      })
      .where(eq(receivablesTable.id, recv.id))
      .returning();
    recv = updated;
  }

  const now = new Date();
  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "billed",
    user,
    note: input.note ?? "標記已請款",
    extraUpdate: {
      adminBillingInfo: billing,
      adminNeedsSubsidy: input.needsSubsidy ?? wo.adminNeedsSubsidy,
      adminBilledAt: now,
      adminBilledBy: user.id,
    },
  });

  return { receivableId: recv.id };
}

export async function toggleSubsidy(
  workOrderId: number,
  user: JwtPayload,
  applied: boolean,
  note?: string,
): Promise<void> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");
  if (!wo.adminNeedsSubsidy) throw new Error("此案件非補助案件");

  const now = new Date();
  const nextStatus = applied ? "已申請補助" : "未申請補助";
  await db
    .update(workOrdersTable)
    .set({
      adminSubsidyStatus: nextStatus,
      adminSubsidyAppliedAt: applied ? now : null,
      adminSubsidyAppliedBy: applied ? user.id : null,
      adminSubsidyNote: note ?? wo.adminSubsidyNote,
      updatedAt: now,
    })
    .where(eq(workOrdersTable.id, workOrderId));

  await db
    .update(receivablesTable)
    .set({ subsidyStatus: nextStatus, updatedAt: now })
    .where(eq(receivablesTable.workOrderId, workOrderId));

  await writeAuditLog({
    action: "admin_workflow.subsidy",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: {
      fromStatus: wo.adminSubsidyStatus,
      toStatus: nextStatus,
      applied,
    },
  });
}

export async function workbenchRecordPayment(
  workOrderId: number,
  user: JwtPayload,
  input: { amount: number; paymentDate: string; paymentMethod?: string; notes?: string },
) {
  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);
  if (!recv) throw new Error("尚未建立請款／應收，請先標記已請款");

  const result = await recordReceivablePayment({
    receivableId: recv.id,
    amount: input.amount,
    paymentDate: input.paymentDate,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    user,
  });

  await syncAdminWorkflowFromReceivable(workOrderId, user, result.paymentStatus, input.notes);
  return result;
}

export async function markFullyPaid(workOrderId: number, user: JwtPayload, note?: string) {
  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);
  if (!recv) throw new Error("尚未建立請款／應收");

  const total = num(recv.totalAmount);
  const received = num(recv.receivedAmount);
  const remaining = Math.max(0, total - received);
  if (remaining > 0) {
    await recordReceivablePayment({
      receivableId: recv.id,
      amount: remaining,
      paymentDate: taipeiDateString(new Date()),
      notes: note ?? "行政標記已收款",
      user,
    });
  }
  await syncAdminWorkflowFromReceivable(workOrderId, user, "已收款", note);
}

export async function syncAdminWorkflowFromReceivable(
  workOrderId: number,
  user: JwtPayload,
  paymentStatus: string,
  note?: string,
): Promise<void> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) return;
  const cur = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (!cur || cur === "closed" || cur === "pending_admin_review" || cur === "pending_billing") return;

  if (paymentStatus === "部分收款" && cur !== "partially_paid") {
    await transitionAdminStatus({
      workOrderId,
      from: wo.adminWorkflowStatus,
      to: "partially_paid",
      user,
      note: note ?? "部分收款",
    });
    return;
  }

  if (paymentStatus === "已收款" && cur !== "pending_archive" && cur !== "paid" && cur !== "closed") {
    await transitionAdminStatus({
      workOrderId,
      from: wo.adminWorkflowStatus,
      to: "pending_archive",
      user,
      note: note ?? "已收款，進入待歸檔",
      extraUpdate: {
        adminArchiveChecklist:
          wo.adminArchiveChecklist ?? emptyArchiveChecklist(wo.adminNeedsSubsidy),
      },
    });
  }
}

export async function completeArchive(
  workOrderId: number,
  user: JwtPayload,
  checklist: ArchiveChecklist,
  note?: string,
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");
  const status = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (status !== "pending_archive" && status !== "paid") {
    throw new Error("此案件不在待歸檔");
  }

  if (!isArchiveChecklistComplete(checklist, wo.adminNeedsSubsidy)) {
    const missing: string[] = [];
    const labels = {
      quote: "報價單",
      workOrder: "派工單",
      photos: "完工照片",
      signature: "客戶簽名",
      billingDoc: "請款單",
      invoice: "發票",
      warranty: "保固書",
      subsidy: "補助資料",
    } as const;
    for (const [k, label] of Object.entries(labels)) {
      if (k === "subsidy" && !wo.adminNeedsSubsidy) continue;
      if (!(checklist as Record<string, boolean>)[k]) missing.push(label);
    }
    return { ok: false, missing };
  }

  const now = new Date();
  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "closed",
    user,
    note: note ?? "完成歸檔",
    extraUpdate: {
      adminArchiveChecklist: checklist,
      adminArchivedAt: now,
      adminArchivedBy: user.id,
      status: "已結案",
    },
  });

  return { ok: true };
}
