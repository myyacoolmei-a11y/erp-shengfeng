import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderFieldProgressTable,
  fieldProgressEventsTable,
  auditLogsTable,
  subsidyApplicationsTable,
  customerDocumentsTable,
  receivablesTable,
  customersTable,
  usersTable,
} from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { writeAuditLog } from "../audit/auditLogService.ts";
import { sendLineWorkOrderNotification } from "../notifications/lineNotificationService.ts";
import { logger } from "../logger.ts";
import { taipeiDateString } from "../workOrders/fieldProgressUtils.ts";
import {
  normalizeAdminWorkflowStatus,
  normalizeSubsidyInvoiceKind,
  normalizeSubsidyType,
  type SubsidyPipelineStatus,
} from "../../../shared/adminWorkflowConstants.ts";
import {
  missingRequiredDocs,
  parseSubsidyMeta,
} from "../../../shared/subsidyDocs.ts";
import {
  ADMIN_BUCKET_LABELS,
  CASE_PROGRESS_LABELS,
  ENGINEERING_BUCKET_LABELS,
  ENGINEERING_BUCKETS,
  ADMIN_BUCKETS,
  SALES_BUCKETS,
  SALES_BUCKET_LABELS,
  OVERDUE_UNBILLED_DAYS,
  missingSubsidyAcceptanceKeys,
  SUBSIDY_ACCEPTANCE_LABELS,
  type AdminBucket,
  type CaseProgressStep,
  type EngineeringBucket,
  type ProgressTone,
  type SalesBucket,
  type SubsidyAcceptanceChecklist,
} from "../../../shared/operationCenterConstants.ts";
import {
  advanceSubsidyPipeline,
  ensureSubsidyApplication,
} from "../workOrders/adminWorkbenchService.ts";

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function moneyStr(n: number): string {
  return n.toFixed(2);
}

function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

type CaseRow = {
  workOrderId: number;
  workOrderNumber: string | null;
  customerName: string | null;
  installAddress: string | null;
  mobilePhone: string | null;
  scheduledDate: string | null;
  status: string | null;
  adminWorkflowStatus: string | null;
  fieldStatus: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  paymentStatus: string | null;
  totalAmount: string | null;
  receivedAmount: string | null;
  unpaidAmount: string | null;
  subsidyPipeline: string | null;
  lFolderCreated: boolean;
  mofCompleted: boolean;
  moeaRequired: boolean;
  moeaCompleted: boolean;
  invoiceKind: string | null;
  docsComplete: boolean;
  subsidyDone: boolean;
  progress: Array<{ step: CaseProgressStep; label: string; tone: ProgressTone }>;
  summary: string;
};

function buildProgress(input: {
  hasDispatch: boolean;
  fieldCompleted: boolean;
  lFolder: boolean;
  docsComplete: boolean;
  mof: boolean;
  moeaRequired: boolean;
  moea: boolean;
  subsidyDone: boolean;
  hasReceivable: boolean;
  paid: boolean;
  closed: boolean;
  unpaid: boolean;
}): Array<{ step: CaseProgressStep; label: string; tone: ProgressTone }> {
  const steps: CaseProgressStep[] = [
    "dispatched",
    "field_completed",
    "l_folder",
    "customer_docs",
    "mof",
    "moea",
    "subsidy_done",
    "billing",
    "paid",
    "closed",
  ];
  const doneMap: Record<CaseProgressStep, boolean> = {
    dispatched: input.hasDispatch,
    field_completed: input.fieldCompleted,
    l_folder: input.lFolder,
    customer_docs: input.docsComplete,
    mof: input.mof,
    moea: !input.moeaRequired || input.moea,
    subsidy_done: input.subsidyDone,
    billing: input.hasReceivable && !input.paid,
    paid: input.paid,
    closed: input.closed,
  };

  let foundCurrent = false;
  return steps.map((step) => {
    const skipped = step === "moea" && !input.moeaRequired;
    if (skipped) {
      return { step, label: CASE_PROGRESS_LABELS[step], tone: "skipped" as const };
    }
    if (doneMap[step]) {
      return { step, label: CASE_PROGRESS_LABELS[step], tone: "done" as const };
    }
    if (!foundCurrent) {
      // 業務「待請款」標示 current 當 unpaid
      if (step === "billing" && input.hasReceivable && input.unpaid) {
        foundCurrent = true;
        return { step, label: CASE_PROGRESS_LABELS[step], tone: "current" as const };
      }
      if (step !== "billing") {
        foundCurrent = true;
        return { step, label: CASE_PROGRESS_LABELS[step], tone: "current" as const };
      }
    }
    return { step, label: CASE_PROGRESS_LABELS[step], tone: "pending" as const };
  });
}

async function loadCaseContext(workOrderIds?: number[]) {
  const woRows =
    workOrderIds && workOrderIds.length
      ? await db
          .select()
          .from(workOrdersTable)
          .where(inArray(workOrdersTable.id, workOrderIds))
      : await db.select().from(workOrdersTable).orderBy(desc(workOrdersTable.updatedAt)).limit(800);

  const ids = woRows.map((w) => w.id);
  if (ids.length === 0) {
    return {
      woRows,
      fpByWo: new Map<number, (typeof workOrderFieldProgressTable.$inferSelect)[]>(),
      subByWo: new Map<number, typeof subsidyApplicationsTable.$inferSelect>(),
      recvByWo: new Map<number, typeof receivablesTable.$inferSelect>(),
      docsByWo: new Map<
        number,
        Array<{
          status: string;
          fileUrl: string | null;
          docType: string;
          subsidyApplicationId: number | null;
        }>
      >(),
    };
  }

  const fps = await db
    .select()
    .from(workOrderFieldProgressTable)
    .where(inArray(workOrderFieldProgressTable.workOrderId, ids));
  const subs = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(inArray(subsidyApplicationsTable.workOrderId, ids));
  const recvs = await db
    .select()
    .from(receivablesTable)
    .where(inArray(receivablesTable.workOrderId, ids));
  const docs = await db
    .select()
    .from(customerDocumentsTable)
    .where(inArray(customerDocumentsTable.workOrderId, ids));

  const fpByWo = new Map<number, (typeof fps)[number][]>();
  for (const f of fps) {
    const list = fpByWo.get(f.workOrderId) ?? [];
    list.push(f);
    fpByWo.set(f.workOrderId, list);
  }
  const subByWo = new Map(subs.map((s) => [s.workOrderId, s] as const));
  const recvByWo = new Map(
    recvs
      .filter((r) => r.workOrderId != null)
      .map((r) => [r.workOrderId as number, r] as const),
  );
  const docsByWo = new Map<number, typeof docs>();
  for (const d of docs) {
    const list = docsByWo.get(d.workOrderId) ?? [];
    list.push(d);
    docsByWo.set(d.workOrderId, list);
  }

  return { woRows, fpByWo, subByWo, recvByWo, docsByWo };
}

function caseDocsComplete(
  sub: typeof subsidyApplicationsTable.$inferSelect | undefined,
  docs: { status: string; fileUrl: string | null; docType: string; subsidyApplicationId: number | null }[],
  recv: typeof receivablesTable.$inferSelect | undefined,
): boolean {
  if (!sub) return false;
  if (sub.pipelineStatus === "applied" || sub.pipelineStatus === "docs_complete" || sub.pipelineStatus === "pending_apply") {
    // still verify actual docs unless applied with manual confirm
  }
  const invoiceKind = normalizeSubsidyInvoiceKind(sub.invoiceKind);
  if (!invoiceKind) return false;
  const active = docs.filter(
    (d) =>
      d.status !== "rejected" &&
      d.fileUrl &&
      (d.subsidyApplicationId == null || d.subsidyApplicationId === sub.id),
  );
  const missing = missingRequiredDocs(
    invoiceKind,
    active.map((d) => d.docType),
  );
  if (missing.length > 0) {
    const { meta } = parseSubsidyMeta(sub.note);
    if (!meta.manualConfirmedAt) return false;
  }
  if (invoiceKind === "triple") {
    const taxIdFilled = /^\d{8}$/.test(String(recv?.taxId ?? "").trim());
    if (!taxIdFilled) {
      const { meta } = parseSubsidyMeta(sub.note);
      if (!meta.manualConfirmedAt) return false;
    }
  }
  return true;
}

function toCaseRow(
  wo: typeof workOrdersTable.$inferSelect,
  fps: (typeof workOrderFieldProgressTable.$inferSelect)[],
  sub: typeof subsidyApplicationsTable.$inferSelect | undefined,
  recv: typeof receivablesTable.$inferSelect | undefined,
  docs: { status: string; fileUrl: string | null; docType: string; subsidyApplicationId: number | null }[],
): CaseRow {
  const primaryFp =
    fps.find((f) => f.fieldStatus === "completed") ??
    fps.find((f) => f.fieldStatus === "in_progress" || f.fieldStatus === "paused") ??
    fps.find((f) => f.fieldStatus === "en_route") ??
    fps[0];
  const fieldCompleted =
    wo.status === "已完成" ||
    fps.some((f) => f.fieldStatus === "completed") ||
    !!primaryFp?.completedAt;
  const adminStatus = normalizeAdminWorkflowStatus(wo.adminWorkflowStatus);
  const closed = adminStatus === "closed" || wo.status === "已結案";
  const total = recv ? num(recv.totalAmount) : 0;
  const received = recv ? num(recv.receivedAmount) : 0;
  const unpaid = Math.max(0, total - received);
  const paid =
    recv?.paymentStatus === "paid" || (total > 0 && unpaid <= 0.009);
  const docsComplete = caseDocsComplete(sub, docs, recv);
  const subsidyDone = sub?.pipelineStatus === "applied";
  const progress = buildProgress({
    hasDispatch: !!wo.scheduledDate || !!wo.assignedTo || !!wo.workOrderNumber,
    fieldCompleted,
    lFolder: !!sub?.lFolderCreated,
    docsComplete,
    mof: !!sub?.mofCompleted,
    moeaRequired: !!sub?.moeaRequired,
    moea: !!sub?.moeaCompleted,
    subsidyDone,
    hasReceivable: !!recv,
    paid,
    closed,
    unpaid: unpaid > 0.009,
  });
  const current = progress.find((p) => p.tone === "current");
  return {
    workOrderId: wo.id,
    workOrderNumber: wo.workOrderNumber,
    customerName: wo.customerName,
    installAddress: wo.installAddress,
    mobilePhone: wo.mobilePhone,
    scheduledDate: wo.scheduledDate,
    status: wo.status,
    adminWorkflowStatus: wo.adminWorkflowStatus,
    fieldStatus: primaryFp?.fieldStatus ?? null,
    departedAt: primaryFp?.departedAt?.toISOString() ?? null,
    arrivedAt: primaryFp?.arrivedAt?.toISOString() ?? null,
    completedAt: primaryFp?.completedAt?.toISOString() ?? null,
    paymentStatus: recv?.paymentStatus ?? null,
    totalAmount: recv ? moneyStr(total) : null,
    receivedAmount: recv ? moneyStr(received) : null,
    unpaidAmount: recv ? moneyStr(unpaid) : null,
    subsidyPipeline: sub?.pipelineStatus ?? null,
    lFolderCreated: !!sub?.lFolderCreated,
    mofCompleted: !!sub?.mofCompleted,
    moeaRequired: !!sub?.moeaRequired,
    moeaCompleted: !!sub?.moeaCompleted,
    invoiceKind: sub?.invoiceKind ?? null,
    docsComplete,
    subsidyDone,
    progress,
    summary: current?.label ?? (closed ? "已結案" : "進行中"),
  };
}

function isProcessViolation(fp: typeof workOrderFieldProgressTable.$inferSelect | undefined): boolean {
  if (!fp) return false;
  const completed = fp.fieldStatus === "completed" || !!fp.completedAt;
  if (!completed) return false;
  return !fp.departedAt || !fp.arrivedAt;
}

export async function getOperationCenterOverview() {
  const today = taipeiDateString();
  const { woRows, fpByWo, subByWo, recvByWo, docsByWo } = await loadCaseContext();
  const cases = woRows.map((wo) =>
    toCaseRow(
      wo,
      fpByWo.get(wo.id) ?? [],
      subByWo.get(wo.id),
      recvByWo.get(wo.id),
      docsByWo.get(wo.id) ?? [],
    ),
  );

const eng: Record<EngineeringBucket, number> = {
    today_dispatched: 0,
    en_route: 0,
    arrived: 0,
    paused: 0,
    field_completed: 0,
    today_incomplete: 0,
    process_violation: 0,
  };
  const admin: Record<AdminBucket, number> = {
    l_folder_pending: 0,
    l_folder_done: 0,
    awaiting_customer_upload: 0,
    docs_complete: 0,
    mof_pending: 0,
    moea_pending: 0,
    subsidy_pending_confirm: 0,
    subsidy_done: 0,
  };
  const sales: Record<SalesBucket, number> = {
    pending_billing: 0,
    billed: 0,
    paid: 0,
    closed: 0,
    overdue_unbilled: 0,
  };

  const overdueCutoff = daysAgoDate(OVERDUE_UNBILLED_DAYS);

  for (const c of cases) {
    const fps = fpByWo.get(c.workOrderId) ?? [];
    const sub = subByWo.get(c.workOrderId);
    const recv = recvByWo.get(c.workOrderId);
    const primaryFp =
      fps.find((f) => f.fieldStatus === "completed") ??
      fps.find((f) => f.fieldStatus === "in_progress" || f.fieldStatus === "paused") ??
      fps.find((f) => f.fieldStatus === "en_route") ??
      fps[0];

    // Engineering
    if (c.scheduledDate === today) eng.today_dispatched += 1;
    if (fps.some((f) => f.fieldStatus === "en_route") || primaryFp?.fieldStatus === "en_route") {
      eng.en_route += 1;
    }
    if (
      primaryFp?.fieldStatus === "in_progress" ||
      (primaryFp?.arrivedAt && !primaryFp.completedAt && primaryFp.fieldStatus !== "paused")
    ) {
      eng.arrived += 1;
    }
    if (primaryFp?.fieldStatus === "paused") eng.paused += 1;
    if (c.progress.find((p) => p.step === "field_completed")?.tone === "done") {
      eng.field_completed += 1;
    }
    if (
      c.scheduledDate === today &&
      primaryFp?.fieldStatus !== "completed" &&
      c.status !== "已完成" &&
      c.status !== "已結案"
    ) {
      eng.today_incomplete += 1;
    }
    if (fps.some((f) => isProcessViolation(f))) eng.process_violation += 1;

    // Admin（以有施工完成或已交行政或有補助單的案件為主；L夾統計採有 sub 或已完工）
    const inAdminScope =
      !!sub ||
      c.progress.find((p) => p.step === "field_completed")?.tone === "done" ||
      !!c.adminWorkflowStatus;
    if (inAdminScope) {
      if (c.lFolderCreated) admin.l_folder_done += 1;
      else admin.l_folder_pending += 1;

      if (sub && normalizeSubsidyType(sub.subsidyType) === "company_assisted" && !c.subsidyDone) {
        if (!c.docsComplete) admin.awaiting_customer_upload += 1;
        else admin.docs_complete += 1;
        if (c.docsComplete && !c.mofCompleted) admin.mof_pending += 1;
        if (c.moeaRequired && !c.moeaCompleted && !c.subsidyDone) admin.moea_pending += 1;
        if (c.docsComplete && c.mofCompleted && (!c.moeaRequired || c.moeaCompleted) && !c.subsidyDone) {
          admin.subsidy_pending_confirm += 1;
        }
      }
      if (c.subsidyDone) admin.subsidy_done += 1;
    }

    // Sales
    const adminClosed = normalizeAdminWorkflowStatus(c.adminWorkflowStatus) === "closed";
    if (adminClosed) sales.closed += 1;
    if (recv) {
      const total = num(recv.totalAmount);
      const received = num(recv.receivedAmount);
      const unpaid = Math.max(0, total - received);
      const isPaid = recv.paymentStatus === "paid" || unpaid <= 0.009;
      if (isPaid) sales.paid += 1;
      else if (received > 0.009) sales.billed += 1;
      else sales.pending_billing += 1;

      // 完工後超過 7 天仍未收款（無收款或未全收）
      const completedAt = primaryFp?.completedAt ?? null;
      if (!isPaid && completedAt && completedAt < overdueCutoff) {
        sales.overdue_unbilled += 1;
      }
    }
  }

  return {
    today,
    engineering: ENGINEERING_BUCKETS.map((id) => ({
      id,
      label: ENGINEERING_BUCKET_LABELS[id],
      count: eng[id],
    })),
    admin: ADMIN_BUCKETS.map((id) => ({
      id,
      label: ADMIN_BUCKET_LABELS[id],
      count: admin[id],
    })),
    sales: SALES_BUCKETS.map((id) => ({
      id,
      label:
        id === "overdue_unbilled"
          ? `超過 ${OVERDUE_UNBILLED_DAYS} 天未請款案件`
          : SALES_BUCKET_LABELS[id],
      count: sales[id],
    })),
  };
}

export async function getOperationCenterCases(opts: {
  department: "engineering" | "admin" | "sales";
  bucket: string;
}) {
  const today = taipeiDateString();
  const { woRows, fpByWo, subByWo, recvByWo, docsByWo } = await loadCaseContext();
  const cases = woRows.map((wo) =>
    toCaseRow(
      wo,
      fpByWo.get(wo.id) ?? [],
      subByWo.get(wo.id),
      recvByWo.get(wo.id),
      docsByWo.get(wo.id) ?? [],
    ),
  );
  const overdueCutoff = daysAgoDate(OVERDUE_UNBILLED_DAYS);

  const filtered = cases.filter((c) => {
    const fps = fpByWo.get(c.workOrderId) ?? [];
    const sub = subByWo.get(c.workOrderId);
    const recv = recvByWo.get(c.workOrderId);
    const primaryFp =
      fps.find((f) => f.fieldStatus === "completed") ??
      fps.find((f) => f.fieldStatus === "in_progress" || f.fieldStatus === "paused") ??
      fps.find((f) => f.fieldStatus === "en_route") ??
      fps[0];

    if (opts.department === "engineering") {
      switch (opts.bucket as EngineeringBucket) {
        case "today_dispatched":
          return c.scheduledDate === today;
        case "en_route":
          return fps.some((f) => f.fieldStatus === "en_route");
        case "arrived":
          return (
            primaryFp?.fieldStatus === "in_progress" ||
            (!!primaryFp?.arrivedAt &&
              !primaryFp.completedAt &&
              primaryFp.fieldStatus !== "paused" &&
              primaryFp.fieldStatus !== "en_route")
          );
        case "paused":
          return primaryFp?.fieldStatus === "paused";
        case "field_completed":
          return c.progress.find((p) => p.step === "field_completed")?.tone === "done";
        case "today_incomplete":
          return (
            c.scheduledDate === today &&
            primaryFp?.fieldStatus !== "completed" &&
            c.status !== "已完成" &&
            c.status !== "已結案"
          );
        case "process_violation":
          return fps.some((f) => isProcessViolation(f));
        default:
          return false;
      }
    }

    if (opts.department === "admin") {
      const inAdminScope =
        !!sub ||
        c.progress.find((p) => p.step === "field_completed")?.tone === "done" ||
        !!c.adminWorkflowStatus;
      if (!inAdminScope) return false;
      switch (opts.bucket as AdminBucket) {
        case "l_folder_pending":
          return !c.lFolderCreated;
        case "l_folder_done":
          return c.lFolderCreated;
        case "awaiting_customer_upload":
          return (
            !!sub &&
            normalizeSubsidyType(sub.subsidyType) === "company_assisted" &&
            !c.subsidyDone &&
            !c.docsComplete
          );
        case "docs_complete":
          return (
            !!sub &&
            normalizeSubsidyType(sub.subsidyType) === "company_assisted" &&
            !c.subsidyDone &&
            c.docsComplete
          );
        case "mof_pending":
          return (
            !!sub &&
            normalizeSubsidyType(sub.subsidyType) === "company_assisted" &&
            !c.subsidyDone &&
            c.docsComplete &&
            !c.mofCompleted
          );
        case "moea_pending":
          return c.moeaRequired && !c.moeaCompleted && !c.subsidyDone;
        case "subsidy_pending_confirm":
          return (
            !!sub &&
            !c.subsidyDone &&
            c.docsComplete &&
            c.mofCompleted &&
            (!c.moeaRequired || c.moeaCompleted)
          );
        case "subsidy_done":
          return c.subsidyDone;
        default:
          return false;
      }
    }

    // sales
    const adminClosed = normalizeAdminWorkflowStatus(c.adminWorkflowStatus) === "closed";
    if (opts.bucket === "closed") return adminClosed;
    if (!recv) return false;
    const total = num(recv.totalAmount);
    const received = num(recv.receivedAmount);
    const unpaid = Math.max(0, total - received);
    const isPaid = recv.paymentStatus === "paid" || unpaid <= 0.009;
    switch (opts.bucket as SalesBucket) {
      case "pending_billing":
        return !isPaid && received <= 0.009;
      case "billed":
        return !isPaid && received > 0.009;
      case "paid":
        return isPaid;
      case "overdue_unbilled": {
        const completedAt = primaryFp?.completedAt ?? null;
        return !isPaid && !!completedAt && completedAt < overdueCutoff;
      }
      default:
        return false;
    }
  });

  return {
    department: opts.department,
    bucket: opts.bucket,
    label:
      opts.department === "engineering"
        ? ENGINEERING_BUCKET_LABELS[opts.bucket as EngineeringBucket] ?? opts.bucket
        : opts.department === "admin"
          ? ADMIN_BUCKET_LABELS[opts.bucket as AdminBucket] ?? opts.bucket
          : opts.bucket === "overdue_unbilled"
            ? `超過 ${OVERDUE_UNBILLED_DAYS} 天未請款案件`
            : SALES_BUCKET_LABELS[opts.bucket as SalesBucket] ?? opts.bucket,
    items: filtered.slice(0, 200),
  };
}

export async function getCaseProgressAndTimeline(workOrderId: number) {
  const { woRows, fpByWo, subByWo, recvByWo, docsByWo } = await loadCaseContext([workOrderId]);
  const wo = woRows[0];
  if (!wo) throw new Error("找不到派工單");
  const caseRow = toCaseRow(
    wo,
    fpByWo.get(workOrderId) ?? [],
    subByWo.get(workOrderId),
    recvByWo.get(workOrderId),
    docsByWo.get(workOrderId) ?? [],
  );

  const events = await db
    .select()
    .from(fieldProgressEventsTable)
    .where(eq(fieldProgressEventsTable.workOrderId, workOrderId))
    .orderBy(desc(fieldProgressEventsTable.actedAt));

  const audits = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(eq(auditLogsTable.entityType, "work_order"), eq(auditLogsTable.entityId, workOrderId)),
    )
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);

  const timeline = [
    ...events.map((e) => ({
      at: e.actedAt.toISOString(),
      operator: e.engineerName,
      action: e.actionLabel || e.action,
      fromStatus: null as string | null,
      toStatus: e.action,
      source: "field_progress" as const,
    })),
    ...audits.map((a) => {
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      return {
        at: a.createdAt.toISOString(),
        operator: a.userDisplayName || "系統",
        action: humanizeAuditAction(a.action, meta),
        fromStatus: meta.fromStatus != null ? String(meta.fromStatus) : null,
        toStatus: meta.toStatus != null ? String(meta.toStatus) : null,
        source: "audit" as const,
      };
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const sub = subByWo.get(workOrderId);
  return {
    case: caseRow,
    progress: caseRow.progress,
    timeline,
    acceptance: {
      moeaRequired: !!sub?.moeaRequired,
      checklist: (sub?.acceptanceChecklist as SubsidyAcceptanceChecklist | null) ?? null,
      flags: sub
        ? {
            lFolderCreated: !!sub.lFolderCreated,
            mofCompleted: !!sub.mofCompleted,
            moeaCompleted: !!sub.moeaCompleted,
            adminLineAlbumCreated: !!sub.adminLineAlbumCreated,
            mofScreenshotSaved: !!sub.mofScreenshotSaved,
            moeaScreenshotSaved: !!sub.moeaScreenshotSaved,
            arAmountConfirmed: !!sub.arAmountConfirmed,
          }
        : null,
      appliedAt: sub?.appliedAt?.toISOString() ?? null,
      appliedBy: sub?.appliedBy ?? null,
    },
  };
}

function humanizeAuditAction(action: string, meta: Record<string, unknown>): string {
  const map: Record<string, string> = {
    "admin_workflow.subsidy_pipeline": "補助流程更新",
    "admin_workflow.subsidy_acceptance": "確認完成補助",
    "admin_workflow.subsidy_unmark_applied": "取消補助完成",
    "admin_workflow.subsidy_manual_confirm": "人工確認補助資料",
    "admin_workflow.subsidy_process_flags": "更新行政流程旗標",
    "admin_workflow.handoff": "交由行政處理",
    "admin_workflow.mark_paid": "標記已收款",
    "admin_workflow.cancel_paid": "取消已收款",
    "admin_workflow.close": "結案",
    "admin_workflow.reopen": "重新開啟",
    "receivable.payment": "登錄收款",
    "receivable.payment_reversal": "沖銷收款",
  };
  const base = map[action] ?? action;
  if (meta.checklist) return `${base}（驗收清單）`;
  return base;
}

export async function updateSubsidyProcessFlags(
  workOrderId: number,
  user: JwtPayload,
  patch: {
    lFolderCreated?: boolean;
    mofCompleted?: boolean;
    moeaRequired?: boolean;
    moeaCompleted?: boolean;
    adminLineAlbumCreated?: boolean;
    mofScreenshotSaved?: boolean;
    moeaScreenshotSaved?: boolean;
    arAmountConfirmed?: boolean;
  },
) {
  await ensureSubsidyApplication(workOrderId, null, user);
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub) throw new Error("找不到補助申請");

  const now = new Date();
  const set: Partial<typeof subsidyApplicationsTable.$inferInsert> = { updatedAt: now };

  if (patch.lFolderCreated != null) {
    set.lFolderCreated = patch.lFolderCreated;
    set.lFolderCreatedAt = patch.lFolderCreated ? now : null;
    set.lFolderCreatedBy = patch.lFolderCreated ? user.id : null;
  }
  if (patch.mofCompleted != null) {
    set.mofCompleted = patch.mofCompleted;
    set.mofCompletedAt = patch.mofCompleted ? now : null;
    set.mofCompletedBy = patch.mofCompleted ? user.id : null;
  }
  if (patch.moeaRequired != null) {
    set.moeaRequired = patch.moeaRequired;
    if (!patch.moeaRequired) {
      set.moeaCompleted = false;
      set.moeaCompletedAt = null;
      set.moeaCompletedBy = null;
      set.moeaScreenshotSaved = false;
    }
  }
  if (patch.moeaCompleted != null) {
    set.moeaCompleted = patch.moeaCompleted;
    set.moeaCompletedAt = patch.moeaCompleted ? now : null;
    set.moeaCompletedBy = patch.moeaCompleted ? user.id : null;
  }
  if (patch.adminLineAlbumCreated != null) {
    set.adminLineAlbumCreated = patch.adminLineAlbumCreated;
    set.adminLineAlbumCreatedAt = patch.adminLineAlbumCreated ? now : null;
  }
  if (patch.mofScreenshotSaved != null) set.mofScreenshotSaved = patch.mofScreenshotSaved;
  if (patch.moeaScreenshotSaved != null) set.moeaScreenshotSaved = patch.moeaScreenshotSaved;
  if (patch.arAmountConfirmed != null) {
    set.arAmountConfirmed = patch.arAmountConfirmed;
    set.arAmountConfirmedAt = patch.arAmountConfirmed ? now : null;
  }

  await db
    .update(subsidyApplicationsTable)
    .set(set)
    .where(eq(subsidyApplicationsTable.id, sub.id));

  await writeAuditLog({
    action: "admin_workflow.subsidy_process_flags",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    metadata: { patch, from: {
      lFolderCreated: sub.lFolderCreated,
      mofCompleted: sub.mofCompleted,
      moeaRequired: sub.moeaRequired,
      moeaCompleted: sub.moeaCompleted,
    } },
  });

  return { ok: true };
}

/**
 * 補助完成驗收：Checklist 全勾後才可標記 applied。
 * 已收款仍走既有 auto-close（不動既有結案）。
 */
export async function completeSubsidyWithAcceptance(
  workOrderId: number,
  user: JwtPayload,
  checklist: SubsidyAcceptanceChecklist,
  note?: string,
) {
  await ensureSubsidyApplication(workOrderId, null, user);
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  if (!sub || normalizeSubsidyType(sub.subsidyType) !== "company_assisted") {
    throw new Error("此案件非公司協助補助");
  }
  if (sub.pipelineStatus === "applied") {
    throw new Error("補助已完成，無需重覆確認");
  }

  const moeaRequired = !!sub.moeaRequired;
  const missing = missingSubsidyAcceptanceKeys(checklist, moeaRequired);
  if (missing.length > 0) {
    throw new Error(
      `請勾選：${missing.map((k) => SUBSIDY_ACCEPTANCE_LABELS[k]).join("、")}`,
    );
  }

  // 應收／請款金額確認
  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);
  if (!recv) {
    throw new Error("尚無應收帳款，請先確認案件金額後再完成補助");
  }

  const now = new Date();
  await db
    .update(subsidyApplicationsTable)
    .set({
      lFolderCreated: true,
      lFolderCreatedAt: sub.lFolderCreatedAt ?? now,
      lFolderCreatedBy: sub.lFolderCreatedBy ?? user.id,
      mofCompleted: true,
      mofCompletedAt: sub.mofCompletedAt ?? now,
      mofCompletedBy: sub.mofCompletedBy ?? user.id,
      moeaCompleted: moeaRequired ? true : sub.moeaCompleted,
      moeaCompletedAt: moeaRequired ? sub.moeaCompletedAt ?? now : sub.moeaCompletedAt,
      moeaCompletedBy: moeaRequired ? sub.moeaCompletedBy ?? user.id : sub.moeaCompletedBy,
      adminLineAlbumCreated: true,
      adminLineAlbumCreatedAt: sub.adminLineAlbumCreatedAt ?? now,
      mofScreenshotSaved: true,
      moeaScreenshotSaved: moeaRequired ? true : sub.moeaScreenshotSaved,
      arAmountConfirmed: true,
      arAmountConfirmedAt: now,
      acceptanceChecklist: checklist,
      updatedAt: now,
    })
    .where(eq(subsidyApplicationsTable.id, sub.id));

  // 走既有 pipeline → applied（含 docs 檢查 + 自動結案）
  await advanceSubsidyPipeline(workOrderId, user, "applied", note ?? "補助完成確認");

  await writeAuditLog({
    action: "admin_workflow.subsidy_acceptance",
    entityType: "work_order",
    entityId: workOrderId,
    user,
    reason: note,
    metadata: {
      checklist,
      moeaRequired,
      completedBy: user.id,
      completedByName: user.displayName,
      completedAt: now.toISOString(),
      receivableId: recv.id,
      totalAmount: recv.totalAmount,
      fromStatus: sub.pipelineStatus,
      toStatus: "applied",
    },
  });

  // LINE 通知負責業務（primary sales → linked user）
  const lineResult = await notifyPrimarySalesSubsidyDone(workOrderId, user);

  return {
    pipelineStatus: "applied" as SubsidyPipelineStatus,
    completedAt: now.toISOString(),
    completedBy: user.displayName,
    lineNotify: lineResult,
  };
}

async function notifyPrimarySalesSubsidyDone(workOrderId: number, actor: JwtPayload) {
  try {
    const [wo] = await db
      .select()
      .from(workOrdersTable)
      .where(eq(workOrdersTable.id, workOrderId))
      .limit(1);
    if (!wo?.customerId) {
      return { sent: false, reason: "無客戶" as const };
    }
    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, wo.customerId))
      .limit(1);
    if (!customer?.primarySalesRepId) {
      return { sent: false, reason: "未指定負責業務" as const };
    }
    const [salesUser] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.linkedEmployeeId, customer.primarySalesRepId),
          eq(usersTable.isActive, true),
        ),
      )
      .limit(1);
    if (!salesUser?.lineUserId) {
      return { sent: false, reason: "業務未綁定 LINE" as const };
    }

    const [recv] = await db
      .select()
      .from(receivablesTable)
      .where(eq(receivablesTable.workOrderId, workOrderId))
      .limit(1);
    const total = recv ? num(recv.totalAmount) : 0;
    const text = [
      "【補助完成／可請款】",
      `客戶：${wo.customerName || "—"}`,
      `案件：${wo.workOrderNumber || workOrderId}`,
      total > 0 ? `請款金額：NT$${total.toLocaleString("zh-TW")}` : null,
      `確認人：${actor.displayName}`,
      "案件已進入待請款（若尚未收款）。",
    ]
      .filter(Boolean)
      .join("\n");

    await sendLineWorkOrderNotification({
      lineUserId: salesUser.lineUserId,
      text,
      workOrderId,
    });
    await writeAuditLog({
      action: "admin_workflow.subsidy_sales_line_notify",
      entityType: "work_order",
      entityId: workOrderId,
      user: actor,
      metadata: {
        salesUserId: salesUser.id,
        salesDisplayName: salesUser.displayName,
      },
    });
    return { sent: true as const, salesName: salesUser.displayName };
  } catch (err) {
    logger.warn({ err, workOrderId }, "notifyPrimarySalesSubsidyDone failed");
    return { sent: false as const, reason: err instanceof Error ? err.message : "LINE 失敗" };
  }
}
