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
import {
  recordReceivablePayment,
  reverseReceivablePayment,
} from "../receivables/receivablePaymentService.ts";
import {
  type AdminBillingInfo,
  type AdminWorkflowStatus,
  type AssistedProgram,
  type ReceivableCardStatus,
  type SubsidyInvoiceKind,
  type SubsidyPipelineStatus,
  type SubsidyType,
  ADMIN_WORKFLOW_LABELS,
  SUBSIDY_INVOICE_KIND_LABELS,
  SUBSIDY_INVOICE_KIND_TO_RECEIVABLE_TYPE,
  engineeringStatusLabel,
  normalizeAdminWorkflowStatus,
  normalizeAssistedProgram,
  normalizeSubsidyInvoiceKind,
  normalizeSubsidyType,
  receivableStatusLabel,
} from "../../../shared/adminWorkflowConstants.ts";
import { taipeiDateString } from "./fieldProgressUtils.ts";
import {
  SUBSIDY_DOC_TYPE_LABELS,
  missingRequiredDocs,
  parseSubsidyMeta,
  pipelineToReceivableSubsidyStatus,
  resolveSubsidyDisplayStatus,
  serializeSubsidyMeta,
  subsidyCombinedStatusLabel,
  type SubsidyDocType,
  type SubsidyDisplayStatus,
} from "../../../shared/subsidyDocs.ts";
import {
  mergeMetaAfterCheck,
  runSubsidyCompletenessCheck,
} from "../subsidy/subsidyCheckService.ts";
import { subsidyPublicUploadPath } from "../subsidy/subsidyPublicHtml.ts";

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function moneyStr(n: number): string {
  return n.toFixed(2);
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

/**
 * Idempotent receivable ensure after construction complete.
 * Never duplicates by work_order_id. Skips only when customerId is missing
 * (cannot insert AR without customer FK).
 */
async function ensureReceivable(
  wo: typeof workOrdersTable.$inferSelect,
  user: JwtPayload,
): Promise<{ receivableId: number | null; created: boolean }> {
  if (!wo.customerId) {
    return { receivableId: null, created: false };
  }

  const [existingRecv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, wo.id))
    .limit(1);

  if (existingRecv) {
    return { receivableId: existingRecv.id, created: false };
  }

  const [quote] = wo.quoteId
    ? await db.select().from(quotesTable).where(eq(quotesTable.id, wo.quoteId)).limit(1)
    : [null];
  const billing = (wo.adminBillingInfo ?? {}) as AdminBillingInfo;
  const quoteAmount = num(quote?.finalAmount ?? quote?.amount);
  const billedAmount = num(billing.finalAmount);
  const total = billedAmount > 0 ? billedAmount : quoteAmount;

  try {
    const [created] = await db
      .insert(receivablesTable)
      .values({
        customerId: wo.customerId,
        workOrderId: wo.id,
        workOrderNumber: wo.workOrderNumber,
        projectName: wo.title,
        projectType: wo.projectType,
        completionDate: wo.completedDate ?? taipeiDateString(new Date()),
        totalAmount: moneyStr(Math.max(0, total)),
        receivedAmount: "0",
        paymentStatus: "未收款",
        expectedPaymentDate: billing.expectedPaymentDate ?? null,
        invoiceTitle: billing.billTo ?? wo.customerName,
        subsidyStatus: "未申請補助",
        notes: "施工完成自動建立應收（與補助流程並行）",
      })
      .returning();

    await writeAuditLog({
      action: "admin_workflow.auto_receivable_on_complete",
      entityType: "work_order",
      entityId: wo.id,
      user,
      metadata: { receivableId: created.id, totalAmount: created.totalAmount },
    });

    return { receivableId: created.id, created: true };
  } catch (err) {
    // Race: another request created the same work_order receivable
    const [again] = await db
      .select()
      .from(receivablesTable)
      .where(eq(receivablesTable.workOrderId, wo.id))
      .limit(1);
    if (again) return { receivableId: again.id, created: false };
    throw err;
  }
}

/**
 * Idempotent subsidy-center ensure after construction complete.
 *
 * ALWAYS creates a row when missing — NEVER gated by needsSubsidy /
 * company_assisted / adminNeedsSubsidy / pipeline / subsidyType.
 *
 * Handling method defaults to subsidy_type = pending_confirmation.
 * (pipeline_status stays at link_not_sent placeholder until admin chooses
 * company_assisted; it is NOT used as the "待確認" flag.)
 *
 * If row already exists: reuse as-is — never reset type / pipeline / token /
 * attachments / assisted_program.
 */
export async function ensureSubsidyApplication(
  workOrderId: number,
  customerId: number | null,
  user?: JwtPayload,
): Promise<{
  subsidy: typeof subsidyApplicationsTable.$inferSelect;
  created: boolean;
}> {
  const [existing] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);

  if (existing) {
    if (customerId != null && existing.customerId == null) {
      const [updated] = await db
        .update(subsidyApplicationsTable)
        .set({ customerId, updatedAt: new Date() })
        .where(eq(subsidyApplicationsTable.id, existing.id))
        .returning();
      return { subsidy: updated, created: false };
    }
    return { subsidy: existing, created: false };
  }

  try {
    const [created] = await db
      .insert(subsidyApplicationsTable)
      .values({
        workOrderId,
        customerId,
        subsidyType: "pending_confirmation",
        assistedProgram: null,
        // Placeholder until company_assisted is chosen; display uses subsidy_type.
        pipelineStatus: "link_not_sent",
        uploadLinkToken: null,
      })
      .returning();

    if (user) {
      await writeAuditLog({
        action: "admin_workflow.auto_subsidy_pending_confirmation",
        entityType: "work_order",
        entityId: workOrderId,
        user,
        metadata: {
          subsidyApplicationId: created.id,
          subsidyType: "pending_confirmation",
        },
      });
    }

    return { subsidy: created, created: true };
  } catch (err) {
    const [again] = await db
      .select()
      .from(subsidyApplicationsTable)
      .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
      .limit(1);
    if (again) return { subsidy: again, created: false };
    throw err;
  }
}

/**
 * After construction complete → admin handoff.
 * ALWAYS: ensureReceivable() then ensureSubsidyApplication().
 * No subsidy-condition gating. Idempotent on both.
 */
export async function syncAdminHandoffAfterConstructionComplete(
  workOrderId: number,
  user: JwtPayload,
): Promise<{
  receivableId: number | null;
  receivableCreated: boolean;
  subsidyEnsured: boolean;
  subsidyCreated: boolean;
}> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) {
    return { receivableId: null, receivableCreated: false, subsidyEnsured: false, subsidyCreated: false };
  }

  const recv = await ensureReceivable(wo, user);
  const sub = await ensureSubsidyApplication(workOrderId, wo.customerId, user);

  return {
    receivableId: recv.receivableId,
    receivableCreated: recv.created,
    subsidyEnsured: true,
    subsidyCreated: sub.created,
  };
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

  // Idempotent: if already in admin flow past review, do not bounce back to pending_admin_review
  const current = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (
    !current ||
    current === "pending_admin_review"
  ) {
    await transitionAdminStatus({
      workOrderId,
      from: wo.adminWorkflowStatus,
      to: "pending_admin_review",
      user,
      note: "工程師施工完成，進入待確認施工資料",
    });
  }

  // Receivable + subsidy todos in parallel (no payment prerequisite)
  await syncAdminHandoffAfterConstructionComplete(workOrderId, user);
}

/**
 * 補助是否擋住結案 — 只看 pipeline_status。
 * 每個案件預設都走補助流程；僅舊案件明確標為不需申請／客戶自行申請時視為無補助。
 */
function subsidyBlocksClose(
  subsidyType: SubsidyType | null,
  pipeline: SubsidyPipelineStatus | null,
): boolean {
  if (pipeline === "applied") return false;
  if (!subsidyType) return false;
  if (
    subsidyType === "not_needed" ||
    subsidyType === "customer_self_apply" ||
    subsidyType === "none"
  ) {
    return false;
  }
  return true;
}

function canCloseCase(input: {
  engineeringConfirmed: boolean;
  hasReceivable: boolean;
  isPaid: boolean;
  subsidyType: SubsidyType | null;
  subsidyPipeline: SubsidyPipelineStatus | null;
}): { canClose: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!input.engineeringConfirmed) blockers.push("工程資料尚未確認");
  if (!input.hasReceivable) blockers.push("尚未建立應收帳款");
  if (!input.isPaid) blockers.push("尚未收款完成");
  if (subsidyBlocksClose(input.subsidyType, input.subsidyPipeline)) {
    blockers.push("等待補助完成");
  }
  return { canClose: blockers.length === 0, blockers };
}

function buildCardStatuses(opts: {
  engineeringConfirmed: boolean;
  recv: typeof receivablesTable.$inferSelect | null;
  subsidyType: SubsidyType | null;
  subsidyPipeline: SubsidyPipelineStatus | null;
  adminStatus: AdminWorkflowStatus | null;
}) {
  const eng: "pending_confirm" | "confirmed" = opts.engineeringConfirmed
    ? "confirmed"
    : "pending_confirm";

  // 收款狀態只看 payment_status／金額，不再看收款日
  let recvStatus: ReceivableCardStatus = "not_created";
  if (opts.recv) {
    const total = num(opts.recv.totalAmount);
    const received = num(opts.recv.receivedAmount);
    if (opts.recv.paymentStatus === "已收款" || (total > 0 && received >= total)) {
      recvStatus = "paid";
    } else if (opts.recv.paymentStatus === "部分收款" || received > 0) {
      recvStatus = "partial";
    } else {
      recvStatus = "unpaid";
    }
  }

  const closeCheck = canCloseCase({
    engineeringConfirmed: opts.engineeringConfirmed,
    hasReceivable: !!opts.recv,
    isPaid: recvStatus === "paid",
    subsidyType: opts.subsidyType,
    subsidyPipeline: opts.subsidyPipeline,
  });

  return {
    engineeringStatus: eng,
    engineeringStatusLabel: engineeringStatusLabel(eng),
    receivableStatus: recvStatus,
    receivableStatusLabel: receivableStatusLabel(recvStatus),
    subsidyType: opts.subsidyType,
    subsidyPipelineStatus: opts.subsidyPipeline,
    canClose: closeCheck.canClose,
    closeBlockers: closeCheck.blockers,
    adminWorkflowStatus: opts.adminStatus,
    adminWorkflowLabel: opts.adminStatus ? ADMIN_WORKFLOW_LABELS[opts.adminStatus] : null,
  };
}

/**
 * 自動結案補掃：把條件已齊卻仍卡在待結案的案件即時寫入 closed。
 * 事件觸發（收款／標記補助完成）之外的保險，載入工作台時執行。
 */
async function sweepAutoClose(user: JwtPayload): Promise<number> {
  // 只掃「已收款且尚未結案」的案件，其餘一定不符合結案條件
  const candidates = await db
    .select({ id: workOrdersTable.id })
    .from(workOrdersTable)
    .innerJoin(receivablesTable, eq(receivablesTable.workOrderId, workOrdersTable.id))
    .where(
      and(
        eq(receivablesTable.paymentStatus, "已收款"),
        isNotNull(workOrdersTable.adminWorkflowStatus),
        ne(workOrdersTable.adminWorkflowStatus, "closed"),
        ne(workOrdersTable.adminWorkflowStatus, "pending_admin_review"),
        isNotNull(workOrdersTable.adminConfirmedAt),
      ),
    );

  let closed = 0;
  for (const c of candidates) {
    if (await tryAutoCloseIfReady(c.id, user, "條件齊全，自動結案")) closed += 1;
  }
  return closed;
}

export async function getAdminWorkbench(user?: JwtPayload) {
  const today = taipeiDateString(new Date());

  if (user) {
    try {
      await sweepAutoClose(user);
    } catch {
      // 補掃失敗不影響列表載入
    }
  }

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

  const documents =
    woIds.length === 0
      ? []
      : await db
          .select()
          .from(customerDocumentsTable)
          .where(inArray(customerDocumentsTable.workOrderId, woIds))
          .orderBy(desc(customerDocumentsTable.createdAt));
  const docsByWo = new Map<number, typeof documents>();
  for (const d of documents) {
    const arr = docsByWo.get(d.workOrderId) ?? [];
    arr.push(d);
    docsByWo.set(d.workOrderId, arr);
  }

  // 簡化後只有三區：待確認施工資料／未收款・待結案／已結案
  const sections = {
    pendingConstructionConfirm: [] as unknown[],
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
    const subsidyType: SubsidyType | null = sub
      ? normalizeSubsidyType(sub.subsidyType) ?? "pending_confirmation"
      : null;
    const invoiceKind = normalizeSubsidyInvoiceKind(sub?.invoiceKind ?? null);
    const subsidyPipeline = (sub?.pipelineStatus ?? null) as SubsidyPipelineStatus | null;

    const engConfirmed = !!r.wo.adminConfirmedAt;

    const card = buildCardStatuses({
      engineeringConfirmed: engConfirmed,
      recv,
      subsidyType,
      subsidyPipeline,
      adminStatus: status,
    });

    const total = recv ? num(recv.totalAmount) : finalAmount;
    const received = recv ? num(recv.receivedAmount) : 0;
    const unpaid = Math.max(0, total - received);

    const allDocs = docsByWo.get(r.wo.id) ?? [];
    const subsidyDocs = allDocs.filter(
      (d) =>
        d.status !== "rejected" &&
        d.docType &&
        d.docType !== "subsidy" &&
        (d.subsidyApplicationId == null || d.subsidyApplicationId === sub?.id),
    );
    const { meta: subsidyMeta, freeNote: subsidyFreeNote } = parseSubsidyMeta(sub?.note);
    const missingDocs = missingRequiredDocs(
      invoiceKind,
      subsidyDocs.map((d) => d.docType),
    );
    const displayStatus: SubsidyDisplayStatus = resolveSubsidyDisplayStatus({
      subsidyType,
      pipeline: subsidyPipeline,
      missingDocs,
      needsManualReview: !!subsidyMeta.needsManualReview,
    });
    const subsidyStatusLabel = subsidyCombinedStatusLabel({
      displayStatus,
      pipeline: subsidyPipeline,
    });
    const lastUploadAt =
      subsidyDocs
        .map((d) => d.uploadedAt?.getTime() ?? d.createdAt?.getTime() ?? 0)
        .filter((t) => t > 0)
        .sort((a, b) => b - a)[0] ?? null;
    const uploadUrl =
      sub?.uploadLinkToken != null && sub.uploadLinkToken !== ""
        ? subsidyPublicUploadPath(sub.uploadLinkToken)
        : null;

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
      receivableId: recv?.id ?? null,
      totalAmount: moneyStr(total),
      receivedAmount: moneyStr(received),
      unpaidAmount: moneyStr(unpaid),
      billedAt: r.wo.adminBilledAt?.toISOString() ?? null,
      paymentStatus: recv?.paymentStatus ?? null,
      subsidyApplicationId: sub?.id ?? null,
      invoiceKind,
      invoiceKindLabel: invoiceKind ? SUBSIDY_INVOICE_KIND_LABELS[invoiceKind] : null,
      invoiceTitle: recv?.invoiceTitle ?? null,
      taxId: recv?.taxId ?? null,
      subsidyNote: subsidyFreeNote || r.wo.adminSubsidyNote,
      uploadLinkSentAt: sub?.uploadLinkSentAt?.toISOString() ?? null,
      uploadLinkToken: sub?.uploadLinkToken ?? null,
      uploadUrl,
      closeOverrideAt: sub?.closeOverrideAt?.toISOString() ?? null,
      appliedAt: sub?.appliedAt?.toISOString() ?? null,
      appliedBy: sub?.appliedBy ?? null,
      missingDocs,
      missingDocLabels: missingDocs.map((t) => SUBSIDY_DOC_TYPE_LABELS[t as SubsidyDocType] ?? t),
      uploadedDocCount: subsidyDocs.length,
      lastUploadAt: lastUploadAt ? new Date(lastUploadAt).toISOString() : null,
      needsManualReview: !!subsidyMeta.needsManualReview,
      aiTips: subsidyMeta.aiTips ?? [],
      subsidyDisplayStatus: displayStatus,
      subsidyStatusLabel,
      subsidyCompleted: subsidyPipeline === "applied",
      canMarkApplied: subsidyPipeline !== "applied",
      canCloseReady: !subsidyBlocksClose(subsidyType, subsidyPipeline),
      customerDocuments: subsidyDocs.slice(0, 40).map((d) => ({
        id: d.id,
        docType: d.docType,
        docTypeLabel:
          d.docType && d.docType in SUBSIDY_DOC_TYPE_LABELS
            ? SUBSIDY_DOC_TYPE_LABELS[d.docType as SubsidyDocType]
            : d.docType,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        status: d.status,
        note: d.note,
        uploadedAt: d.uploadedAt?.toISOString() ?? null,
      })),
      customerDocumentCount: subsidyDocs.length,
      ...card,
    };

    // Closed list — never drop; always findable
    if (status === "closed") {
      sections.closed.push(base);
      continue;
    }

    // 1. 待確認施工資料
    if (status === "pending_admin_review" || !engConfirmed) {
      sections.pendingConstructionConfirm.push(base);
      continue;
    }

    // 2. 未收款／待結案 — 確認施工後的所有未結案案件（含未收款、部分收款、等待補助）
    sections.pendingClose.push(base);
  }

  const startOfDay = new Date(`${today}T00:00:00+08:00`);
  const endOfDay = new Date(`${today}T23:59:59.999+08:00`);

  const counts = {
    pendingConstructionConfirm: sections.pendingConstructionConfirm.length,
    pendingClose: sections.pendingClose.length,
    closed: sections.closed.length,
  };

  const openTodos = counts.pendingConstructionConfirm + counts.pendingClose;

  return {
    today,
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

  // Idempotent handoff sync (receivable + subsidy if needed) — safe if already done on complete
  await syncAdminHandoffAfterConstructionComplete(workOrderId, user);

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

  // Billing no longer decides subsidy handling — handoff already created
  // pending_confirmation; admin chooses method in 補助中心.
  const [existingSub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  const adminNeedsSubsidy = existingSub?.subsidyType === "company_assisted";

  const now = new Date();
  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "billed",
    user,
    note: input.note ?? "建立應收帳款",
    extraUpdate: {
      adminBillingInfo: billing,
      adminNeedsSubsidy,
      adminBilledAt: now,
      adminBilledBy: user.id,
    },
  });

  return { receivableId: recv.id };
}

/**
 * Activate company-assisted flow for a chosen program.
 * Only generates token / sets link_not_sent when not already progressed.
 * Never resets applied / advanced pipeline / existing token / attachments.
 */
async function activateCompanyAssistedSubsidy(
  workOrderId: number,
  customerId: number | null,
  program: AssistedProgram,
) {
  const [existing] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);

  if (existing) {
    const patch: Partial<typeof subsidyApplicationsTable.$inferInsert> = {
      subsidyType: "company_assisted",
      assistedProgram: program,
      updatedAt: new Date(),
    };
    // Only set pipeline to link_not_sent when still at default / unset —
    // never downgrade applied or mid-flight statuses.
    if (
      existing.subsidyType !== "company_assisted" ||
      !existing.pipelineStatus ||
      existing.pipelineStatus === "link_not_sent"
    ) {
      if (existing.pipelineStatus !== "applied" && existing.pipelineStatus !== "docs_complete" &&
          existing.pipelineStatus !== "pending_apply" &&
          existing.pipelineStatus !== "awaiting_upload" &&
          existing.pipelineStatus !== "docs_incomplete") {
        patch.pipelineStatus = "link_not_sent";
      }
    }
    if (!existing.uploadLinkToken) {
      patch.uploadLinkToken = randomBytes(16).toString("hex");
    }
    if (customerId != null && existing.customerId == null) {
      patch.customerId = customerId;
    }
    const [updated] = await db
      .update(subsidyApplicationsTable)
      .set(patch)
      .where(eq(subsidyApplicationsTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(subsidyApplicationsTable)
    .values({
      workOrderId,
      customerId,
      subsidyType: "company_assisted",
      assistedProgram: program,
      pipelineStatus: "link_not_sent",
      uploadLinkToken: randomBytes(16).toString("hex"),
    })
    .returning();
  return created;
}

/**
 * Admin selects subsidy handling method (4-way).
 * company_assisted requires assistedProgram (new_unit | trade_in).
 */
export async function setSubsidyType(
  workOrderId: number,
  user: JwtPayload,
  subsidyType: SubsidyType,
  note?: string,
  assistedProgram?: AssistedProgram | null,
) {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");

  if (subsidyType === "none") {
    throw new Error("請選擇：不需要申請／客戶自行申請／公司協助（新機或舊換新）");
  }

  if (subsidyType === "company_assisted") {
    const program = normalizeAssistedProgram(assistedProgram ?? null);
    if (!program) {
      throw new Error("公司協助申請須選擇新機補助或舊換新補助");
    }
    await activateCompanyAssistedSubsidy(workOrderId, wo.customerId, program);
    await db
      .update(workOrdersTable)
      .set({ adminNeedsSubsidy: true, updatedAt: new Date() })
      .where(eq(workOrdersTable.id, workOrderId));
  } else if (
    subsidyType === "not_needed" ||
    subsidyType === "customer_self_apply" ||
    subsidyType === "pending_confirmation"
  ) {
    const [existing] = await db
      .select()
      .from(subsidyApplicationsTable)
      .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
      .limit(1);

    if (existing) {
      // Do not wipe tokens/attachments; clear program; do not force pipeline rewind if applied
      if (existing.pipelineStatus === "applied") {
        throw new Error("補助已申請完成，不可改回待確認或其他非公司協助方式");
      }
      await db
        .update(subsidyApplicationsTable)
        .set({
          subsidyType,
          assistedProgram: null,
          note: note ?? existing.note,
          updatedAt: new Date(),
        })
        .where(eq(subsidyApplicationsTable.id, existing.id));
    } else {
      await db.insert(subsidyApplicationsTable).values({
        workOrderId,
        customerId: wo.customerId,
        subsidyType,
        assistedProgram: null,
        pipelineStatus: "link_not_sent",
        uploadLinkToken: null,
        note: note ?? null,
      });
    }
    await db
      .update(workOrdersTable)
      .set({ adminNeedsSubsidy: false, updatedAt: new Date() })
      .where(eq(workOrdersTable.id, workOrderId));
  } else {
    throw new Error("無效的補助辦理方式");
  }

  await writeAuditLog({
    action: "admin_workflow.subsidy_type",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: { subsidyType, assistedProgram: assistedProgram ?? null },
  });
}

/**
 * Admin sets 二聯式／三聯式. This is the only handling choice in the new flow —
 * it also starts the subsidy pipeline (row + upload token) when not started yet.
 */
export async function setSubsidyInvoiceKind(
  workOrderId: number,
  user: JwtPayload,
  invoiceKind: SubsidyInvoiceKind,
) {
  const kind = normalizeSubsidyInvoiceKind(invoiceKind);
  if (!kind) throw new Error("請選擇二聯式或三聯式");

  const [wo] = await db
    .select({ customerId: workOrdersTable.customerId })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, workOrderId))
    .limit(1);
  if (!wo) throw new Error("找不到派工單");

  const { subsidy: sub } = await ensureSubsidyApplication(
    workOrderId,
    wo.customerId ?? null,
    user,
  );
  if (sub.pipelineStatus === "applied") {
    throw new Error("補助已完成，無法變更發票類型");
  }

  const now = new Date();
  await db
    .update(subsidyApplicationsTable)
    .set({
      invoiceKind: kind,
      subsidyType: "company_assisted",
      uploadLinkToken: sub.uploadLinkToken || randomBytes(16).toString("hex"),
      pipelineStatus: sub.pipelineStatus ?? "link_not_sent",
      updatedAt: now,
    })
    .where(eq(subsidyApplicationsTable.id, sub.id));

  const receivableType = SUBSIDY_INVOICE_KIND_TO_RECEIVABLE_TYPE[kind];
  await db
    .update(receivablesTable)
    .set({ invoiceType: receivableType, updatedAt: now })
    .where(eq(receivablesTable.workOrderId, workOrderId));

  // 案件頁補助面板沿用此舊旗標判斷是否顯示
  await db
    .update(workOrdersTable)
    .set({ adminNeedsSubsidy: true, updatedAt: now })
    .where(eq(workOrdersTable.id, workOrderId));

  await writeAuditLog({
    action: "admin_workflow.subsidy_invoice_kind",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    metadata: { invoiceKind: kind, receivableInvoiceType: receivableType },
  });

  return { invoiceKind: kind };
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
    throw new Error("請先在補助中心選擇公司協助申請（新機或舊換新）");
  }

  const now = new Date();
  const patch: Partial<typeof subsidyApplicationsTable.$inferInsert> = {
    pipelineStatus: toStatus,
    updatedAt: now,
  };
  if (note != null) {
    const { meta, freeNote } = parseSubsidyMeta(sub.note);
    patch.note = serializeSubsidyMeta(note.trim() || freeNote, meta);
  }

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

  // MVP: admin may mark 補助完成 at any company_assisted stage (no docs-complete gate)

  await db
    .update(subsidyApplicationsTable)
    .set(patch)
    .where(eq(subsidyApplicationsTable.id, sub.id));

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

  // sync legacy receivable / work-order Chinese fields from pipeline (single source)
  await syncLegacySubsidyFlags(workOrderId, toStatus, user, now);

  // 補助完成後：若已收款則自動結案
  if (toStatus === "applied") {
    await tryAutoCloseIfReady(workOrderId, user, note ?? "補助已完成，自動結案");
  }

  return { pipelineStatus: toStatus, order: PIPELINE_ORDER };
}

async function syncLegacySubsidyFlags(
  workOrderId: number,
  pipeline: SubsidyPipelineStatus,
  user: JwtPayload,
  now = new Date(),
) {
  const zh = pipelineToReceivableSubsidyStatus(pipeline);
  await db
    .update(receivablesTable)
    .set({ subsidyStatus: zh, updatedAt: now })
    .where(eq(receivablesTable.workOrderId, workOrderId));
  await db
    .update(workOrdersTable)
    .set({
      adminSubsidyStatus: zh,
      adminSubsidyAppliedAt: pipeline === "applied" ? now : null,
      adminSubsidyAppliedBy: pipeline === "applied" ? user.id : null,
      updatedAt: now,
    })
    .where(eq(workOrdersTable.id, workOrderId));
}

/** Undo mistaken「補助申請已完成」— restore to docs_complete; keep all attachments & audit. */
export async function unmarkSubsidyApplied(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
) {
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub || sub.subsidyType !== "company_assisted") {
    throw new Error("此案件非公司協助補助");
  }
  if (sub.pipelineStatus !== "applied") {
    throw new Error("目前不是「補助申請已完成」狀態");
  }

  const now = new Date();
  const { meta, freeNote } = parseSubsidyMeta(sub.note);
  const mergedNote = serializeSubsidyMeta(
    note?.trim() ? `${freeNote}\n${note.trim()}`.trim() : freeNote,
    meta,
  );

  await db
    .update(subsidyApplicationsTable)
    .set({
      pipelineStatus: "docs_complete",
      appliedAt: null,
      appliedBy: null,
      note: mergedNote,
      updatedAt: now,
    })
    .where(eq(subsidyApplicationsTable.id, sub.id));

  await syncLegacySubsidyFlags(workOrderId, "docs_complete", user, now);

  await writeAuditLog({
    action: "admin_workflow.subsidy_unmark_applied",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: {
      fromStatus: "applied",
      toStatus: "docs_complete",
      subsidyApplicationId: sub.id,
      previousAppliedAt: sub.appliedAt?.toISOString() ?? null,
      previousAppliedBy: sub.appliedBy ?? null,
    },
  });

  // 取消補助完成後：若已自動結案則解除，回到待結案（已收款仍保留）
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (normalizeAdminWorkflowStatus(wo?.adminWorkflowStatus) === "closed") {
    await reopenClosedCase(workOrderId, user, note ?? "取消補助完成，自動解除結案");
  }

  return { pipelineStatus: "docs_complete" as const };
}

/** Admin confirms docs after AI flagged manual review → docs_complete. */
export async function confirmSubsidyDocsManually(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
) {
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub || sub.subsidyType !== "company_assisted") {
    throw new Error("此案件非公司協助補助");
  }
  if (sub.pipelineStatus === "applied") {
    throw new Error("補助已完成，無需再確認資料");
  }

  const docs = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.subsidyApplicationId, sub.id));
  const missing = missingRequiredDocs(
    normalizeSubsidyInvoiceKind(sub.invoiceKind),
    docs.filter((d) => d.status !== "rejected" && d.fileUrl).map((d) => d.docType),
  );
  if (missing.length > 0) {
    throw new Error(
      `仍缺少必要文件：${missing.map((t) => SUBSIDY_DOC_TYPE_LABELS[t]).join("、")}`,
    );
  }

  const { meta, freeNote } = parseSubsidyMeta(sub.note);
  const now = new Date();
  const newMeta = {
    ...meta,
    needsManualReview: false,
    manualConfirmedAt: now.toISOString(),
    manualConfirmedBy: user.id,
    aiTips: meta.aiTips ?? [],
  };
  const merged = serializeSubsidyMeta(
    note?.trim() ? `${freeNote}\n人工確認：${note.trim()}`.trim() : freeNote,
    newMeta,
  );

  await db
    .update(subsidyApplicationsTable)
    .set({
      pipelineStatus: "docs_complete",
      note: merged,
      updatedAt: now,
    })
    .where(eq(subsidyApplicationsTable.id, sub.id));

  await writeAuditLog({
    action: "admin_workflow.subsidy_manual_confirm",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: { subsidyApplicationId: sub.id, toStatus: "docs_complete" },
  });

  return { pipelineStatus: "docs_complete" as const };
}

/** Regenerate public upload token (only when expired / missing). */
export async function regenerateSubsidyUploadToken(
  workOrderId: number,
  user: JwtPayload,
  force = false,
) {
  let [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub) {
    throw new Error("尚無補助紀錄");
  }

  const { SUBSIDY_UPLOAD_TOKEN_TTL_DAYS } = await import("../../../shared/subsidyDocs.ts");
  const base = sub.uploadLinkSentAt ?? sub.createdAt;
  const expired =
    !sub.uploadLinkToken ||
    Date.now() - base.getTime() > SUBSIDY_UPLOAD_TOKEN_TTL_DAYS * 86400000;
  if (!force && !expired) {
    return {
      token: sub.uploadLinkToken!,
      uploadUrl: subsidyPublicUploadPath(sub.uploadLinkToken!),
      regenerated: false,
    };
  }

  const token = randomBytes(16).toString("hex");
  const now = new Date();
  await db
    .update(subsidyApplicationsTable)
    .set({ uploadLinkToken: token, updatedAt: now })
    .where(eq(subsidyApplicationsTable.id, sub.id));

  await writeAuditLog({
    action: "admin_workflow.subsidy_regenerate_token",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    metadata: { subsidyApplicationId: sub.id },
  });

  return { token, uploadUrl: subsidyPublicUploadPath(token), regenerated: true };
}

/** Re-run completeness check (admin trigger). */
export async function recheckSubsidyDocuments(workOrderId: number, user: JwtPayload) {
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub || sub.subsidyType !== "company_assisted") {
    throw new Error("此案件非公司協助補助");
  }
  if (sub.pipelineStatus === "applied") {
    return { pipelineStatus: "applied" as const };
  }

  const docs = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.subsidyApplicationId, sub.id));
  const { meta, freeNote } = parseSubsidyMeta(sub.note);

  const check = await runSubsidyCompletenessCheck({
    subsidyType: "company_assisted",
    invoiceKind: normalizeSubsidyInvoiceKind(sub.invoiceKind),
    docs,
    prevMeta: meta,
  });

  const note = mergeMetaAfterCheck(freeNote, meta, check);
  let next = check.suggestedPipeline;
  if (docs.filter((d) => d.fileUrl).length === 0) {
    next = sub.pipelineStatus === "link_not_sent" ? "link_not_sent" : "awaiting_upload";
  }

  await db
    .update(subsidyApplicationsTable)
    .set({ pipelineStatus: next, note, updatedAt: new Date() })
    .where(eq(subsidyApplicationsTable.id, sub.id));

  await writeAuditLog({
    action: "admin_workflow.subsidy_recheck",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    metadata: {
      subsidyApplicationId: sub.id,
      toStatus: next,
      needsManualReview: check.needsManualReview,
    },
  });

  return {
    pipelineStatus: next,
    displayStatus: check.displayStatus,
    missingDocs: check.missingDocs,
    aiTips: check.aiTips,
  };
}

/** @deprecated simple toggle — maps to applied / unmark */
export async function toggleSubsidy(
  workOrderId: number,
  user: JwtPayload,
  applied: boolean,
  note?: string,
) {
  if (applied) {
    await advanceSubsidyPipeline(workOrderId, user, "applied", note);
  } else {
    await unmarkSubsidyApplied(workOrderId, user, note);
  }
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

/**
 * Auto-close when ready:
 * - paid + (not company_assisted OR pipeline applied)
 * Uses same canCloseCase rules (eng confirmed / receivable / paid / subsidy).
 */
export async function tryAutoCloseIfReady(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
): Promise<boolean> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) return false;
  const cur = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (!cur || cur === "closed" || cur === "pending_admin_review") return cur === "closed";

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

  const subsidyType = normalizeSubsidyType(sub?.subsidyType) ?? null;
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
  });
  if (!check.canClose) return false;

  const now = new Date();
  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "closed",
    user,
    note: note ?? "條件齊全，自動結案",
    extraUpdate: {
      adminClosedAt: now,
      adminClosedBy: user.id,
      status: "已結案",
    },
  });
  return true;
}

export async function syncAdminWorkflowFromReceivable(
  workOrderId: number,
  user: JwtPayload,
  paymentStatus: string,
  note?: string,
): Promise<void> {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) return;
  let cur = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (!cur || cur === "pending_admin_review") return;

  // 已結案後若收款被取消／變部分收款：先解除結案再往下同步
  if (cur === "closed") {
    if (paymentStatus === "已收款") return;
    await reopenClosedCase(workOrderId, user, note ?? "收款狀態變更，自動解除結案");
    const [wo2] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
    cur = normalizeAdminWorkflowStatus(wo2?.adminWorkflowStatus);
    if (!cur || cur === "closed") return;
  }

  if (paymentStatus === "已收款") {
    const autoClosed = await tryAutoCloseIfReady(
      workOrderId,
      user,
      note ?? "已收款，自動結案",
    );
    if (autoClosed) return;

    // 公司協助補助未完成等：進入待結案，等待補助完成
    if (cur !== "pending_close" && cur !== "paid") {
      const [fresh] = await db
        .select({ adminWorkflowStatus: workOrdersTable.adminWorkflowStatus })
        .from(workOrdersTable)
        .where(eq(workOrdersTable.id, workOrderId))
        .limit(1);
      await transitionAdminStatus({
        workOrderId,
        from: fresh?.adminWorkflowStatus ?? wo.adminWorkflowStatus,
        to: "pending_close",
        user,
        note: note ?? "已收款，等待補助完成後自動結案",
      });
    }
    return;
  }

  if (paymentStatus === "部分收款") {
    if (cur !== "partially_paid") {
      await transitionAdminStatus({
        workOrderId,
        from: wo.adminWorkflowStatus,
        to: "partially_paid",
        user,
        note: note ?? "部分收款",
      });
    }
    return;
  }

  // 未收款 — restore from paid / pending_close / partially_paid back to billed
  if (
    paymentStatus === "未收款" &&
    (cur === "pending_close" || cur === "paid" || cur === "partially_paid")
  ) {
    const [fresh] = await db
      .select({ adminWorkflowStatus: workOrdersTable.adminWorkflowStatus })
      .from(workOrdersTable)
      .where(eq(workOrdersTable.id, workOrderId))
      .limit(1);
    await transitionAdminStatus({
      workOrderId,
      from: fresh?.adminWorkflowStatus ?? cur,
      to: "billed",
      user,
      note: note ?? "取消已收款，恢復待收款",
    });
  }
}

/** Undo mark-paid: reverse payment records + restore admin workflow to unpaid/partial. */
export async function cancelFullyPaid(
  workOrderId: number,
  user: JwtPayload,
  reason?: string,
) {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");
  const cur = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  // 已結案：先自動解除結案，再取消已收款
  if (cur === "closed") {
    await reopenClosedCase(workOrderId, user, reason ?? "取消已收款前自動解除結案");
  }

  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);
  if (!recv) throw new Error("尚未建立應收帳款");

  const received = num(recv.receivedAmount);
  if (recv.paymentStatus !== "已收款" && received <= 0) {
    throw new Error("此案件尚未標記已收款");
  }

  const result = await reverseReceivablePayment({
    receivableId: recv.id,
    reason: reason ?? "取消已收款",
    user,
  });

  // reverseReceivablePayment syncs workflow when workOrderId is set; ensure billed/partial anyway
  await syncAdminWorkflowFromReceivable(
    workOrderId,
    user,
    result.paymentStatus,
    reason ?? "取消已收款",
  );

  return result;
}

/** Undo close — keep payments / subsidy / quote / work-order data. */
export async function reopenClosedCase(
  workOrderId: number,
  user: JwtPayload,
  note?: string,
) {
  const [wo] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId)).limit(1);
  if (!wo) throw new Error("找不到派工單");
  const cur = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  if (cur !== "closed") throw new Error("此案件尚未結案");

  await transitionAdminStatus({
    workOrderId,
    from: wo.adminWorkflowStatus,
    to: "pending_close",
    user,
    note: note ?? "取消結案／重新開啟",
    extraUpdate: {
      adminClosedAt: null,
      adminClosedBy: null,
      // restore operational status; do not touch payments / subsidy / quote
      status: wo.status === "已結案" ? "已完成" : wo.status,
    },
  });

  return { ok: true as const };
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
    throw new Error("尚無補助中心紀錄，無法核准先結案");
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

  const subsidyType = normalizeSubsidyType(sub?.subsidyType) ?? null;
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
