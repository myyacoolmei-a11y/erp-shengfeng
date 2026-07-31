import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderFieldProgressTable,
  quotesTable,
  receivablesTable,
  adminTodosTable,
  subsidyApplicationsTable,
  customerDocumentsTable,
} from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { effectiveRoles } from "../auth.ts";
import { writeAuditLog } from "../audit/auditLogService.ts";
import { recordReceivablePayment } from "../receivables/receivablePaymentService.ts";
import {
  type AdminBillingInfo,
  type AdminWorkflowStatus,
  type ReceivableCardStatus,
  type SubsidyPipelineStatus,
  type SubsidyType,
  ADMIN_WORKFLOW_LABELS,
  SUBSIDY_PIPELINE_LABELS,
  SUBSIDY_TYPE_LABELS,
  engineeringStatusLabel,
  normalizeAdminWorkflowStatus,
  receivableStatusLabel,
} from "../../../shared/adminWorkflowConstants.ts";
import { taipeiDateString } from "./fieldProgressUtils.ts";

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function moneyStr(n: number): string {
  return n.toFixed(2);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+08:00`).getTime();
  const b = new Date(`${to}T00:00:00+08:00`).getTime();
  return Math.round((b - a) / 86400000);
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
      }
    } catch {
      if (technicians.trim()) parts.push(technicians.trim());
    }
  }
  return parts.join("、") || "—";
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

export async function setPendingAdminReviewOnComplete(
  workOrderId: number,
  user: JwtPayload,
): Promise<void> {
  const [wo] = await db
    .select({
      id: workOrdersTable.id,
      adminWorkflowStatus: workOrdersTable.adminWorkflowStatus,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, workOrderId))
    .limit(1);
  if (!wo) return;

  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "pending_admin_review",
    user,
    note: "工程師施工完成，進入待確認施工資料",
  });
}

function canCloseCase(input: {
  engineeringConfirmed: boolean;
  hasReceivable: boolean;
  isPaid: boolean;
  subsidyType: SubsidyType;
  subsidyPipeline: SubsidyPipelineStatus | null;
  hasCloseOverride: boolean;
}): { canClose: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!input.engineeringConfirmed) blockers.push("工程資料尚未確認");
  if (!input.hasReceivable) blockers.push("尚未建立應收帳款");
  if (!input.isPaid) blockers.push("尚未收款完成");
  if (input.subsidyType === "company_assisted") {
    const applied = input.subsidyPipeline === "applied";
    if (!applied && !input.hasCloseOverride) {
      blockers.push("公司協助補助尚未申請完成（需 owner／super_admin 核准方可先結案）");
    }
  }
  return { canClose: blockers.length === 0, blockers };
}

function buildCardStatuses(opts: {
  engineeringConfirmed: boolean;
  recv: typeof receivablesTable.$inferSelect | null;
  subsidyType: SubsidyType;
  subsidyPipeline: SubsidyPipelineStatus | null;
  hasCloseOverride: boolean;
  adminStatus: AdminWorkflowStatus | null;
}) {
  const eng: "pending_confirm" | "confirmed" = opts.engineeringConfirmed
    ? "confirmed"
    : "pending_confirm";

  let recvStatus: ReceivableCardStatus = "not_created";
  if (opts.recv) {
    const total = num(opts.recv.totalAmount);
    const received = num(opts.recv.receivedAmount);
    if (opts.recv.paymentStatus === "已收款" || (total > 0 && received >= total)) {
      recvStatus = "paid";
    } else if (opts.recv.paymentStatus === "部分收款" || received > 0) {
      recvStatus = "partial";
    } else if (!opts.recv.expectedPaymentDate) {
      recvStatus = "no_due_date";
    } else {
      recvStatus = "unpaid";
    }
  }

  const subsidyLabel =
    opts.subsidyType === "none"
      ? SUBSIDY_TYPE_LABELS.none
      : SUBSIDY_PIPELINE_LABELS[opts.subsidyPipeline ?? "link_not_sent"];

  const closeCheck = canCloseCase({
    engineeringConfirmed: opts.engineeringConfirmed,
    hasReceivable: !!opts.recv,
    isPaid: recvStatus === "paid",
    subsidyType: opts.subsidyType,
    subsidyPipeline: opts.subsidyPipeline,
    hasCloseOverride: opts.hasCloseOverride,
  });

  return {
    engineeringStatus: eng,
    engineeringStatusLabel: engineeringStatusLabel(eng),
    receivableStatus: recvStatus,
    receivableStatusLabel: receivableStatusLabel(recvStatus),
    subsidyType: opts.subsidyType,
    subsidyTypeLabel: SUBSIDY_TYPE_LABELS[opts.subsidyType],
    subsidyPipelineStatus: opts.subsidyPipeline,
    subsidyStatusLabel: subsidyLabel,
    canClose: closeCheck.canClose,
    closeBlockers: closeCheck.blockers,
    adminWorkflowStatus: opts.adminStatus,
    adminWorkflowLabel: opts.adminStatus ? ADMIN_WORKFLOW_LABELS[opts.adminStatus] : null,
  };
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
    .where(isNotNull(workOrdersTable.adminWorkflowStatus))
    .orderBy(desc(workOrdersTable.updatedAt));

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

  const subsidies =
    woIds.length === 0
      ? []
      : await db
          .select()
          .from(subsidyApplicationsTable)
          .where(inArray(subsidyApplicationsTable.workOrderId, woIds));
  const subByWo = new Map<number, (typeof subsidies)[number]>();
  for (const s of subsidies) subByWo.set(s.workOrderId, s);

  const sections = {
    pendingConstructionConfirm: [] as unknown[],
    pendingCreateReceivable: [] as unknown[],
    noDueDate: [] as unknown[],
    collectionSoon: [] as unknown[],
    collectionToday: [] as unknown[],
    collectionOverdue: [] as unknown[],
    collectionPartial: [] as unknown[],
    subsidyLinkNotSent: [] as unknown[],
    subsidyAwaitingUpload: [] as unknown[],
    subsidyDocsIncomplete: [] as unknown[],
    subsidyDocsComplete: [] as unknown[],
    subsidyPendingApply: [] as unknown[],
    pendingClose: [] as unknown[],
    closed: [] as unknown[],
  };

  for (const r of list) {
    let status = normalizeAdminWorkflowStatus(r.wo.adminWorkflowStatus);
    if (!status) continue;

    const checklist = (r.fpChecklist ?? null) as Record<string, boolean> | null;
    const billing = (r.wo.adminBillingInfo ?? {}) as AdminBillingInfo;
    const quoteOriginal = num(r.quoteFinal ?? r.quoteAmount);
    const extra = num(billing.extraAmount);
    const discount = num(billing.discountAmount);
    const finalAmount =
      billing.finalAmount != null && billing.finalAmount !== ""
        ? num(billing.finalAmount)
        : Math.max(0, quoteOriginal + extra - discount);

    const recv = recvByWo.get(r.wo.id) ?? null;
    const sub = subByWo.get(r.wo.id) ?? null;
    const subsidyType: SubsidyType =
      sub?.subsidyType === "company_assisted" || r.wo.adminNeedsSubsidy
        ? "company_assisted"
        : "none";
    const subsidyPipeline = (sub?.pipelineStatus ??
      (subsidyType === "company_assisted" ? "link_not_sent" : null)) as SubsidyPipelineStatus | null;

    const engConfirmed = !!r.wo.adminConfirmedAt;

    const card = buildCardStatuses({
      engineeringConfirmed: engConfirmed,
      recv,
      subsidyType,
      subsidyPipeline,
      hasCloseOverride: !!sub?.closeOverrideAt,
      adminStatus: status,
    });

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
      quoteId: r.wo.quoteId,
      completedAt: r.fpCompletedAt?.toISOString() ?? null,
      hasPhotos: !!checklist?.photos,
      hasSignature: !!checklist?.signed,
      hasMaterials: !!checklist?.materials,
      anomalyNote: r.fpUnableNote ?? r.wo.notes ?? null,
      quoteOriginalAmount: moneyStr(quoteOriginal),
      extraAmount: moneyStr(extra),
      discountAmount: moneyStr(discount),
      finalAmount: moneyStr(finalAmount),
      invoiceNeeded: billing.invoiceNeeded ?? false,
      billTo: billing.billTo ?? r.wo.customerName,
      expectedPaymentDate: due,
      receivableId: recv?.id ?? null,
      totalAmount: moneyStr(total),
      receivedAmount: moneyStr(received),
      unpaidAmount: moneyStr(unpaid),
      billedAt: r.wo.adminBilledAt?.toISOString() ?? null,
      paymentStatus: recv?.paymentStatus ?? null,
      overdueDays: overdueDays != null && overdueDays > 0 ? overdueDays : overdueDays === 0 ? 0 : null,
      subsidyApplicationId: sub?.id ?? null,
      subsidyNote: sub?.note ?? r.wo.adminSubsidyNote,
      uploadLinkSentAt: sub?.uploadLinkSentAt?.toISOString() ?? null,
      closeOverrideAt: sub?.closeOverrideAt?.toISOString() ?? null,
      ...card,
    };

    // Closed list (recent)
    if (status === "closed") {
      sections.closed.push(base);
      continue;
    }

    // 1. Construction confirm
    if (status === "pending_admin_review" || !engConfirmed) {
      sections.pendingConstructionConfirm.push(base);
    }

    // 2–7 Receivable / collection (independent of subsidy)
    if (engConfirmed && !recv) {
      sections.pendingCreateReceivable.push(base);
    } else if (recv && card.receivableStatus !== "paid") {
      if (card.receivableStatus === "no_due_date") {
        sections.noDueDate.push(base);
      }
      if (card.receivableStatus === "partial") {
        sections.collectionPartial.push(base);
      }
      if (due && card.receivableStatus !== "paid") {
        const d = daysBetween(today, due);
        if (d < 0) sections.collectionOverdue.push(base);
        else if (d === 0) sections.collectionToday.push(base);
        else if (d <= 7) sections.collectionSoon.push(base);
      }
    }

    // 8–12 Subsidy pipeline (independent of payment)
    if (subsidyType === "company_assisted" && subsidyPipeline) {
      switch (subsidyPipeline) {
        case "link_not_sent":
          sections.subsidyLinkNotSent.push(base);
          break;
        case "awaiting_upload":
          sections.subsidyAwaitingUpload.push(base);
          break;
        case "docs_incomplete":
          sections.subsidyDocsIncomplete.push(base);
          break;
        case "docs_complete":
          sections.subsidyDocsComplete.push(base);
          break;
        case "pending_apply":
          sections.subsidyPendingApply.push(base);
          break;
        default:
          break;
      }
    }

    // 13. Pending close
    if (status === "pending_close" || status === "paid" || card.canClose) {
      if (status !== "closed" && (status === "pending_close" || card.receivableStatus === "paid")) {
        sections.pendingClose.push(base);
      }
    }
  }

  // Dedupe pendingClose by workOrderId
  const closeSeen = new Set<number>();
  sections.pendingClose = sections.pendingClose.filter((item) => {
    const id = (item as { workOrderId: number }).workOrderId;
    if (closeSeen.has(id)) return false;
    closeSeen.add(id);
    return true;
  });

  const startOfDay = new Date(`${today}T00:00:00+08:00`);
  const endOfDay = new Date(`${today}T23:59:59.999+08:00`);

  const counts = {
    pendingConstructionConfirm: sections.pendingConstructionConfirm.length,
    pendingCreateReceivable: sections.pendingCreateReceivable.length,
    noDueDate: sections.noDueDate.length,
    collectionSoon: sections.collectionSoon.length,
    collectionToday: sections.collectionToday.length,
    collectionOverdue: sections.collectionOverdue.length,
    collectionPartial: sections.collectionPartial.length,
    subsidyLinkNotSent: sections.subsidyLinkNotSent.length,
    subsidyAwaitingUpload: sections.subsidyAwaitingUpload.length,
    subsidyDocsIncomplete: sections.subsidyDocsIncomplete.length,
    subsidyDocsComplete: sections.subsidyDocsComplete.length,
    subsidyPendingApply: sections.subsidyPendingApply.length,
    pendingClose: sections.pendingClose.length,
    closed: sections.closed.length,
  };

  const openTodos =
    counts.pendingConstructionConfirm +
    counts.pendingCreateReceivable +
    counts.noDueDate +
    counts.collectionSoon +
    counts.collectionToday +
    counts.collectionOverdue +
    counts.collectionPartial +
    counts.subsidyLinkNotSent +
    counts.subsidyAwaitingUpload +
    counts.subsidyDocsIncomplete +
    counts.subsidyDocsComplete +
    counts.subsidyPendingApply +
    counts.pendingClose;

  return {
    today,
    alerts: {
      hasOverdue: counts.collectionOverdue > 0,
      hasDueToday: counts.collectionToday > 0,
      overdueCount: counts.collectionOverdue,
      dueTodayCount: counts.collectionToday,
    },
    counts: { ...counts, openTodos },
    sections,
    todayStats: {
      confirmedToday:
        (
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
      receivableCreatedToday:
        (
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
      paidToday:
        (
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
      closedToday:
        (
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(workOrdersTable)
            .where(
              and(
                eq(workOrdersTable.adminWorkflowStatus, "closed"),
                orClosedToday(startOfDay, endOfDay),
              ),
            )
        )[0]?.n ?? 0,
      openTodos,
    },
  };
}

function orClosedToday(startOfDay: Date, endOfDay: Date) {
  return sql`(${workOrdersTable.adminClosedAt} >= ${startOfDay} AND ${workOrdersTable.adminClosedAt} <= ${endOfDay})
    OR (${workOrdersTable.adminArchivedAt} >= ${startOfDay} AND ${workOrdersTable.adminArchivedAt} <= ${endOfDay})`;
}

export async function confirmAdminCompletion(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");

  const status = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (status !== "pending_admin_review" && !wo.adminConfirmedAt) {
    // allow re-entry if still pending
  }
  if (status !== "pending_admin_review") {
    throw new Error("此案件不在待確認施工資料");
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
    note: note ?? "行政確認施工資料",
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

export async function markBilled(
  workOrderId: number,
  user: JwtPayload,
  input: AdminBillingInfo & { needsSubsidy?: boolean; subsidyType?: SubsidyType; note?: string },
): Promise<{ receivableId: number }> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");
  if (!wo.adminConfirmedAt) throw new Error("請先確認施工資料");
  if (!wo.customerId) throw new Error("派工單未綁定客戶，無法建立應收帳款");

  const [quote] = wo.quoteId
    ? await db.select().from(quotesTable).where(eq(quotesTable.id, wo.quoteId)).limit(1)
    : [null];

  const prevBilling = (wo.adminBillingInfo ?? {}) as AdminBillingInfo;
  // Merge draft fields but treat null/undefined input as "omit" so we don't wipe amounts.
  const billing: AdminBillingInfo = { ...prevBilling };
  for (const [k, v] of Object.entries(input)) {
    if (k === "needsSubsidy" || k === "subsidyType" || k === "note") continue;
    if (v !== undefined) (billing as Record<string, unknown>)[k] = v;
  }

  // quotation final/成交金額 is the base; extra/discount adjust once at billing time.
  const quoteOriginal = num(quote?.finalAmount ?? quote?.amount);
  const extra = num(billing.extraAmount);
  const discount = num(billing.discountAmount);
  const computed = Math.max(0, quoteOriginal + extra - discount);
  const finalAmount =
    input.finalAmount != null && String(input.finalAmount).trim() !== ""
      ? num(input.finalAmount)
      : computed > 0
        ? computed
        : num(prevBilling.finalAmount);
  if (!(finalAmount > 0)) {
    throw new Error("應收金額必須大於 0（請確認報價金額，或填寫最終應收金額）");
  }
  billing.finalAmount = moneyStr(finalAmount);
  billing.extraAmount = moneyStr(extra);
  billing.discountAmount = moneyStr(discount);
  // expectedPaymentDate may be null (optional)
  if (input.expectedPaymentDate !== undefined) {
    billing.expectedPaymentDate = input.expectedPaymentDate || null;
  }

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
        invoiceTitle: billing.billTo ?? wo.customerName,
        notes: input.note ?? null,
      })
      .returning();
    recv = created;
    if (num(recv.totalAmount) <= 0) {
      // Guard against numeric write anomalies — force correct amount.
      const [fixed] = await db
        .update(receivablesTable)
        .set({ totalAmount: moneyStr(finalAmount), updatedAt: new Date() })
        .where(eq(receivablesTable.id, created.id))
        .returning();
      recv = fixed;
    }
  } else {
    const [updated] = await db
      .update(receivablesTable)
      .set({
        totalAmount: moneyStr(finalAmount),
        expectedPaymentDate:
          input.expectedPaymentDate !== undefined
            ? billing.expectedPaymentDate ?? null
            : recv.expectedPaymentDate,
        invoiceTitle: billing.billTo ?? recv.invoiceTitle,
        updatedAt: new Date(),
      })
      .where(eq(receivablesTable.id, recv.id))
      .returning();
    recv = updated;
  }

  const wantsSubsidy =
    input.subsidyType === "company_assisted" ||
    input.needsSubsidy === true ||
    wo.adminNeedsSubsidy;

  if (wantsSubsidy) {
    await ensureCompanyAssistedSubsidy(workOrderId, wo.customerId, user);
  }

  const now = new Date();
  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "billed",
    user,
    note: input.note ?? "建立應收帳款",
    extraUpdate: {
      adminBillingInfo: billing,
      adminNeedsSubsidy: wantsSubsidy,
      adminBilledAt: now,
      adminBilledBy: user.id,
    },
  });

  return { receivableId: recv.id };
}

async function ensureCompanyAssistedSubsidy(
  workOrderId: number,
  customerId: number | null,
  _user: JwtPayload,
) {
  const [existing] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (existing) {
    if (existing.subsidyType !== "company_assisted") {
      await db
        .update(subsidyApplicationsTable)
        .set({ subsidyType: "company_assisted", updatedAt: new Date() })
        .where(eq(subsidyApplicationsTable.id, existing.id));
    }
    return existing;
  }
  const [created] = await db
    .insert(subsidyApplicationsTable)
    .values({
      workOrderId,
      customerId,
      subsidyType: "company_assisted",
      pipelineStatus: "link_not_sent",
      uploadLinkToken: randomBytes(16).toString("hex"),
    })
    .returning();
  return created;
}

export async function setSubsidyType(
  workOrderId: number,
  user: JwtPayload,
  subsidyType: SubsidyType,
  note?: string,
) {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");

  if (subsidyType === "none") {
    const [existing] = await db
      .select()
      .from(subsidyApplicationsTable)
      .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
      .limit(1);
    if (existing) {
      await db
        .update(subsidyApplicationsTable)
        .set({ subsidyType: "none", note: note ?? existing.note, updatedAt: new Date() })
        .where(eq(subsidyApplicationsTable.id, existing.id));
    }
    await db
      .update(workOrdersTable)
      .set({ adminNeedsSubsidy: false, updatedAt: new Date() })
      .where(eq(workOrdersTable.id, workOrderId));
  } else {
    await ensureCompanyAssistedSubsidy(workOrderId, wo.customerId, user);
    await db
      .update(workOrdersTable)
      .set({ adminNeedsSubsidy: true, updatedAt: new Date() })
      .where(eq(workOrdersTable.id, workOrderId));
  }

  await writeAuditLog({
    action: "admin_workflow.subsidy_type",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: { subsidyType },
  });
}

const PIPELINE_ORDER: SubsidyPipelineStatus[] = [
  "link_not_sent",
  "awaiting_upload",
  "docs_incomplete",
  "docs_complete",
  "pending_apply",
  "applied",
];

export async function advanceSubsidyPipeline(
  workOrderId: number,
  user: JwtPayload,
  toStatus: SubsidyPipelineStatus,
  note?: string,
) {
  let [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub || sub.subsidyType !== "company_assisted") {
    const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
    if (!wo) throw new Error("找不到派工單");
    sub = await ensureCompanyAssistedSubsidy(workOrderId, wo.customerId, user);
  }

  const now = new Date();
  const patch: Partial<typeof subsidyApplicationsTable.$inferInsert> = {
    pipelineStatus: toStatus,
    note: note ?? sub.note,
    updatedAt: now,
  };

  if (toStatus === "awaiting_upload" || toStatus === "link_not_sent") {
    if (toStatus === "awaiting_upload") {
      patch.uploadLinkSentAt = now;
      patch.uploadLinkSentBy = user.id;
      if (!sub.uploadLinkToken) patch.uploadLinkToken = randomBytes(16).toString("hex");
    }
  }
  if (toStatus === "applied") {
    patch.appliedAt = now;
    patch.appliedBy = user.id;
  }

  await db
    .update(subsidyApplicationsTable)
    .set(patch)
    .where(eq(subsidyApplicationsTable.id, sub.id));

  if (toStatus === "docs_incomplete" || toStatus === "docs_complete") {
    // track a placeholder document row for audit trail
    await db.insert(customerDocumentsTable).values({
      workOrderId,
      customerId: sub.customerId,
      subsidyApplicationId: sub.id,
      docType: "subsidy",
      status: toStatus === "docs_complete" ? "accepted" : "rejected",
      note: note ?? (toStatus === "docs_complete" ? "資料已齊" : "資料待補"),
      reviewedBy: user.id,
      uploadedAt: now,
    });
  }

  await writeAuditLog({
    action: "admin_workflow.subsidy_pipeline",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: {
      fromStatus: sub.pipelineStatus,
      toStatus,
      subsidyApplicationId: sub.id,
    },
  });

  // sync legacy receivable subsidy flag when applied
  if (toStatus === "applied") {
    await db
      .update(receivablesTable)
      .set({ subsidyStatus: "已申請補助", updatedAt: now })
      .where(eq(receivablesTable.workOrderId, workOrderId));
    await db
      .update(workOrdersTable)
      .set({
        adminSubsidyStatus: "已申請補助",
        adminSubsidyAppliedAt: now,
        adminSubsidyAppliedBy: user.id,
        updatedAt: now,
      })
      .where(eq(workOrdersTable.id, workOrderId));
  }

  return { pipelineStatus: toStatus, order: PIPELINE_ORDER };
}

/** @deprecated simple toggle — maps to applied / link_not_sent */
export async function toggleSubsidy(
  workOrderId: number,
  user: JwtPayload,
  applied: boolean,
  note?: string,
) {
  await advanceSubsidyPipeline(
    workOrderId,
    user,
    applied ? "applied" : "link_not_sent",
    note,
  );
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
  if (!recv) throw new Error("尚未建立應收帳款");

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
  if (!recv) throw new Error("尚未建立應收帳款");

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
  if (!cur || cur === "closed" || cur === "pending_admin_review") return;

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

  if (
    paymentStatus === "已收款" &&
    cur !== "pending_close" &&
    cur !== "paid" &&
    cur !== "closed"
  ) {
    await transitionAdminStatus({
      workOrderId,
      from: wo.adminWorkflowStatus,
      to: "pending_close",
      user,
      note: note ?? "已收款，進入待結案",
    });
  }
}

export async function approveCloseOverride(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
) {
  const roles = effectiveRoles(user);
  if (!roles.includes("owner") && !roles.includes("super_admin")) {
    throw new Error("僅 owner／super_admin 可核准補助未完成時先結案");
  }
  let [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub) {
    const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
    if (!wo) throw new Error("找不到派工單");
    sub = await ensureCompanyAssistedSubsidy(workOrderId, wo.customerId, user);
  }
  const now = new Date();
  await db
    .update(subsidyApplicationsTable)
    .set({
      closeOverrideAt: now,
      closeOverrideBy: user.id,
      closeOverrideNote: note ?? "核准先結案",
      updatedAt: now,
    })
    .where(eq(subsidyApplicationsTable.id, sub.id));

  await writeAuditLog({
    action: "admin_workflow.close_override",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: { subsidyApplicationId: sub.id },
  });
}

/** Close case — NO warranty checks. */
export async function completeClose(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");

  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);

  const subsidyType: SubsidyType =
    sub?.subsidyType === "company_assisted" || wo.adminNeedsSubsidy
      ? "company_assisted"
      : "none";
  const total = recv ? num(recv.totalAmount) : 0;
  const received = recv ? num(recv.receivedAmount) : 0;
  const isPaid =
    !!recv &&
    (recv.paymentStatus === "已收款" || (total > 0 && received >= total - 0.001));

  const check = canCloseCase({
    engineeringConfirmed: !!wo.adminConfirmedAt,
    hasReceivable: !!recv,
    isPaid,
    subsidyType,
    subsidyPipeline: (sub?.pipelineStatus as SubsidyPipelineStatus) ?? null,
    hasCloseOverride: !!sub?.closeOverrideAt,
  });

  if (!check.canClose) {
    return { ok: false, missing: check.blockers };
  }

  const now = new Date();
  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "closed",
    user,
    note: note ?? "完成結案",
    extraUpdate: {
      adminClosedAt: now,
      adminClosedBy: user.id,
      status: "已結案",
    },
  });

  return { ok: true };
}

/** Legacy name used by routes — maps to completeClose (no warranty). */
export async function completeArchive(
  workOrderId: number,
  user: JwtPayload,
  _checklist: unknown,
  note?: string,
) {
  return completeClose(workOrderId, user, note);
}

export async function updateBillingDraft(
  workOrderId: number,
  user: JwtPayload,
  billing: AdminBillingInfo & { needsSubsidy?: boolean },
): Promise<void> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");

  const prev = (wo.adminBillingInfo ?? {}) as AdminBillingInfo;
  const next: AdminBillingInfo = { ...prev, ...billing };
  delete (next as { needsSubsidy?: boolean }).needsSubsidy;

  await db
    .update(workOrdersTable)
    .set({
      adminBillingInfo: next,
      adminNeedsSubsidy: billing.needsSubsidy ?? wo.adminNeedsSubsidy,
      updatedAt: new Date(),
    })
    .where(eq(workOrdersTable.id, workOrderId));

  if (billing.expectedPaymentDate !== undefined) {
    await db
      .update(receivablesTable)
      .set({
        expectedPaymentDate: billing.expectedPaymentDate || null,
        updatedAt: new Date(),
      })
      .where(eq(receivablesTable.workOrderId, workOrderId));
  }

  if (billing.needsSubsidy) {
    await ensureCompanyAssistedSubsidy(workOrderId, wo.customerId, user);
  }

  await writeAuditLog({
    action: "admin_workflow.billing_draft",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    metadata: { billing: next },
  });
}

/** Simple: set expected_payment_date only (no billing form fields). */
export async function setReceivableExpectedPaymentDate(
  workOrderId: number,
  user: JwtPayload,
  expectedPaymentDate: string,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedPaymentDate)) {
    throw new Error("請選擇有效的預計收款日");
  }
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");

  const [recv] = await db
    .select({ id: receivablesTable.id })
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);
  if (!recv) throw new Error("尚未建立應收帳款");

  await db
    .update(receivablesTable)
    .set({ expectedPaymentDate, updatedAt: new Date() })
    .where(eq(receivablesTable.id, recv.id));

  const prev = (wo.adminBillingInfo ?? {}) as AdminBillingInfo;
  await db
    .update(workOrdersTable)
    .set({
      adminBillingInfo: { ...prev, expectedPaymentDate },
      updatedAt: new Date(),
    })
    .where(eq(workOrdersTable.id, workOrderId));

  await writeAuditLog({
    action: "admin_workflow.set_expected_payment_date",
    entityType: "receivable",
    entityId: recv.id,
    user,
    metadata: { workOrderId, expectedPaymentDate },
  });
}
