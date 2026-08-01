import { Router, type IRouter } from "express";
import { eq, and, lt, inArray } from "drizzle-orm";
import {
  db,
  receivablesTable,
  customersTable,
  workOrdersTable,
  subsidyApplicationsTable,
  customerDocumentsTable,
} from "@workspace/db";
import { requireFeature } from "../lib/auth";
import { z } from "zod/v4";
import {
  recordReceivablePayment,
  reverseReceivablePayment,
} from "../lib/receivables/receivablePaymentService.ts";
import {
  SUBSIDY_DISPLAY_COLORS,
  SUBSIDY_DOC_TYPE_LABELS,
  missingRequiredDocs,
  parseSubsidyMeta,
  resolveSubsidyDisplayStatus,
  subsidyCombinedStatusLabel,
  type SubsidyDocType,
  type SubsidyDisplayStatus,
} from "../../shared/subsidyDocs.ts";
import type {
  AssistedProgram,
  SubsidyPipelineStatus,
  SubsidyType,
} from "../../shared/adminWorkflowConstants.ts";
import { normalizeSubsidyInvoiceKind } from "../../shared/adminWorkflowConstants.ts";
import {
  advanceSubsidyPipeline,
  unmarkSubsidyApplied,
} from "../lib/workOrders/adminWorkbenchService.ts";
import { subsidyPublicUploadPath } from "../lib/subsidy/subsidyPublicHtml.ts";

const router: IRouter = Router();
router.use("/receivables", requireFeature("receivables"));


function parseId(raw: unknown): number | null {
  const id = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return isNaN(id) ? null : id;
}

function fmt(r: Record<string, unknown>) {
  return {
    ...r,
    totalAmount: parseFloat(String(r.totalAmount ?? "0")),
    receivedAmount: parseFloat(String(r.receivedAmount ?? "0")),
    subsidyStatus: (r.subsidyStatus as string) || "未申請補助",
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

function enrichReceivableSubsidy(
  row: Record<string, unknown>,
  sub: typeof subsidyApplicationsTable.$inferSelect | null | undefined,
  docs: Array<typeof customerDocumentsTable.$inferSelect>,
) {
  const subsidyType = (sub?.subsidyType ?? null) as SubsidyType | null;
  const assistedProgram = (sub?.assistedProgram ?? null) as AssistedProgram | null;
  const pipeline = (sub?.pipelineStatus ?? null) as SubsidyPipelineStatus | null;
  const invoiceKind = normalizeSubsidyInvoiceKind(sub?.invoiceKind ?? null);
  const activeDocs = docs.filter((d) => d.status !== "rejected" && d.docType !== "subsidy");
  const missingDocs = missingRequiredDocs(
    invoiceKind,
    activeDocs.map((d) => d.docType),
  );
  const { meta } = parseSubsidyMeta(sub?.note);
  const displayStatus: SubsidyDisplayStatus = resolveSubsidyDisplayStatus({
    subsidyType,
    pipeline,
    missingDocs,
    needsManualReview: !!meta.needsManualReview,
  });
  const subsidyDisplayLabel = subsidyCombinedStatusLabel({
    displayStatus,
    pipeline,
  });
  const legacy = displayStatus === "applied" ? "已申請補助" : "未申請補助";

  const uploadUrl =
    sub?.uploadLinkToken != null &&
    sub.uploadLinkToken !== "" &&
    subsidyType === "company_assisted"
      ? subsidyPublicUploadPath(sub.uploadLinkToken)
      : null;

  return {
    ...fmt(row),
    subsidyStatus: displayStatus === "applied" ? "已申請補助" : (row.subsidyStatus as string) || legacy,
    subsidyType,
    assistedProgram,
    subsidyPipelineStatus: pipeline,
    subsidyDisplayStatus: displayStatus,
    subsidyDisplayLabel,
    subsidyDisplayColor: SUBSIDY_DISPLAY_COLORS[displayStatus],
    missingDocs,
    missingDocLabels: missingDocs.map((t) => SUBSIDY_DOC_TYPE_LABELS[t as SubsidyDocType] ?? t),
    uploadedDocCount: activeDocs.length,
    appliedAt: sub?.appliedAt?.toISOString() ?? null,
    needsManualReview: !!meta.needsManualReview,
    aiTips: meta.aiTips ?? [],
    canMarkSubsidyApplied: displayStatus === "docs_complete",
    uploadUrl,
    uploadLinkToken: subsidyType === "company_assisted" ? sub?.uploadLinkToken ?? null : null,
    customerDocuments: activeDocs.slice(0, 40).map((d) => ({
      id: d.id,
      docType: d.docType,
      docTypeLabel:
        d.docType && d.docType in SUBSIDY_DOC_TYPE_LABELS
          ? SUBSIDY_DOC_TYPE_LABELS[d.docType as SubsidyDocType]
          : d.docType,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      status: d.status,
      uploadedAt: d.uploadedAt?.toISOString() ?? null,
    })),
  };
}

const REC_SELECT = {
  id: receivablesTable.id,
  customerId: receivablesTable.customerId,
  customerName: customersTable.name,
  workOrderId: receivablesTable.workOrderId,
  workOrderNumber: receivablesTable.workOrderNumber,
  projectName: receivablesTable.projectName,
  projectType: receivablesTable.projectType,
  completionDate: receivablesTable.completionDate,
  totalAmount: receivablesTable.totalAmount,
  receivedAmount: receivablesTable.receivedAmount,
  paymentStatus: receivablesTable.paymentStatus,
  expectedPaymentDate: receivablesTable.expectedPaymentDate,
  actualPaymentDate: receivablesTable.actualPaymentDate,
  paymentMethod: receivablesTable.paymentMethod,
  notes: receivablesTable.notes,
  invoiceStatus: receivablesTable.invoiceStatus,
  invoiceType: receivablesTable.invoiceType,
  taxId: receivablesTable.taxId,
  invoiceTitle: receivablesTable.invoiceTitle,
  invoiceNumber: receivablesTable.invoiceNumber,
  invoiceDate: receivablesTable.invoiceDate,
  invoiceNotes: receivablesTable.invoiceNotes,
  subsidyStatus: receivablesTable.subsidyStatus,
  createdAt: receivablesTable.createdAt,
  updatedAt: receivablesTable.updatedAt,
};

router.get("/receivables", async (req, res): Promise<void> => {
  const { customerId, status, workOrderId } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(receivablesTable.customerId, cid));
  }
  if (workOrderId) {
    const wid = parseInt(workOrderId, 10);
    if (!isNaN(wid)) conditions.push(eq(receivablesTable.workOrderId, wid));
  }
  if (status === "逾期") {
    const today = new Date().toISOString().split("T")[0];
    conditions.push(lt(receivablesTable.expectedPaymentDate, today));
    conditions.push(eq(receivablesTable.paymentStatus, "未收款"));
  } else if (status === "發票未開立") {
    conditions.push(eq(receivablesTable.invoiceStatus, "未開立"));
  } else if (status && status !== "全部") {
    conditions.push(eq(receivablesTable.paymentStatus, status));
  }

  const rows = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(receivablesTable.createdAt);

  const woIds = rows
    .map((r) => r.workOrderId)
    .filter((id): id is number => id != null);
  const subsidies =
    woIds.length === 0
      ? []
      : await db
          .select()
          .from(subsidyApplicationsTable)
          .where(inArray(subsidyApplicationsTable.workOrderId, woIds));
  const subByWo = new Map(subsidies.map((s) => [s.workOrderId, s]));
  const subIds = subsidies.map((s) => s.id);
  const docs =
    subIds.length === 0
      ? []
      : await db
          .select()
          .from(customerDocumentsTable)
          .where(inArray(customerDocumentsTable.subsidyApplicationId, subIds));
  const docsBySub = new Map<number, typeof docs>();
  for (const d of docs) {
    if (d.subsidyApplicationId == null) continue;
    const arr = docsBySub.get(d.subsidyApplicationId) ?? [];
    arr.push(d);
    docsBySub.set(d.subsidyApplicationId, arr);
  }

  res.json(
    rows.map((r) => {
      const sub = r.workOrderId != null ? subByWo.get(r.workOrderId) : undefined;
      return enrichReceivableSubsidy(
        r as Record<string, unknown>,
        sub,
        sub ? docsBySub.get(sub.id) ?? [] : [],
      );
    }),
  );
});

router.post("/receivables", async (req, res): Promise<void> => {
  const CreateSchema = z.object({
    customerId: z.number().int(),
    workOrderId: z.number().int().optional(),
    workOrderNumber: z.string().optional(),
    projectName: z.string().optional(),
    projectType: z.string().optional(),
    completionDate: z.string().optional(),
    totalAmount: z.number(),
    expectedPaymentDate: z.string().optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
    invoiceStatus: z.string().optional(),
    invoiceType: z.string().optional(),
    taxId: z.string().optional(),
    invoiceTitle: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.string().optional(),
    invoiceNotes: z.string().optional(),
  });
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(parsed.data.totalAmount > 0)) {
    res.status(400).json({ error: "應收金額必須大於 0" });
    return;
  }

  let customerId = parsed.data.customerId;

  if (parsed.data.workOrderId) {
    const [wo] = await db
      .select({ customerId: workOrdersTable.customerId })
      .from(workOrdersTable)
      .where(eq(workOrdersTable.id, parsed.data.workOrderId));

    if (wo?.customerId == null) {
      res.status(400).json({ error: "派工單未綁定客戶，無法建立應收帳款" });
      return;
    }

    customerId = wo.customerId;

    const existing = await db
      .select({ id: receivablesTable.id })
      .from(receivablesTable)
      .where(eq(receivablesTable.workOrderId, parsed.data.workOrderId));
    if (existing.length > 0) {
      res.status(409).json({ error: "此派工單已有應收帳款紀錄", receivableId: existing[0].id });
      return;
    }
  }

  const data = {
    ...parsed.data,
    customerId,
    totalAmount: String(parsed.data.totalAmount),
    receivedAmount: "0",
    paymentStatus: "未收款",
    invoiceStatus: parsed.data.invoiceStatus ?? "未開立",
  };
  const [row] = await db.insert(receivablesTable).values(data).returning();
  const joined = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, row.id));
  res.status(201).json(fmt(joined[0] as Record<string, unknown>));
});

router.get("/receivables/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, id));
  if (!row) { res.status(404).json({ error: "找不到應收帳款" }); return; }
  const [sub] =
    row.workOrderId != null
      ? await db
          .select()
          .from(subsidyApplicationsTable)
          .where(eq(subsidyApplicationsTable.workOrderId, row.workOrderId))
          .limit(1)
      : [null];
  const docs = sub
    ? await db
        .select()
        .from(customerDocumentsTable)
        .where(eq(customerDocumentsTable.subsidyApplicationId, sub.id))
    : [];
  res.json(enrichReceivableSubsidy(row as Record<string, unknown>, sub, docs));
});

router.patch("/receivables/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const UpdateSchema = z.object({
    totalAmount: z.number().optional(),
    expectedPaymentDate: z.string().nullable().optional(),
    actualPaymentDate: z.string().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    invoiceStatus: z.string().optional(),
    invoiceType: z.string().nullable().optional(),
    taxId: z.string().nullable().optional(),
    invoiceTitle: z.string().nullable().optional(),
    invoiceNumber: z.string().nullable().optional(),
    invoiceDate: z.string().nullable().optional(),
    invoiceNotes: z.string().nullable().optional(),
    subsidyStatus: z.enum(["未申請補助", "已申請補助"]).optional(),
  });
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.totalAmount != null) data["totalAmount"] = String(parsed.data.totalAmount);

  // subsidyStatus toggles must go through shared pipeline (not a second source of truth)
  const subsidyToggle = parsed.data.subsidyStatus;
  delete data["subsidyStatus"];
  data.updatedAt = new Date();

  await db.update(receivablesTable).set(data).where(eq(receivablesTable.id, id));

  const [updated] = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, id));
  if (!updated) { res.status(404).json({ error: "找不到應收帳款" }); return; }

  if (subsidyToggle != null && updated.workOrderId != null && req.user) {
    try {
      if (subsidyToggle === "已申請補助") {
        await advanceSubsidyPipeline(updated.workOrderId, req.user, "applied");
      } else {
        await unmarkSubsidyApplied(updated.workOrderId, req.user);
      }
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "補助狀態更新失敗" });
      return;
    }
  }

  const [sub] =
    updated.workOrderId != null
      ? await db
          .select()
          .from(subsidyApplicationsTable)
          .where(eq(subsidyApplicationsTable.workOrderId, updated.workOrderId))
          .limit(1)
      : [null];
  const docs = sub
    ? await db
        .select()
        .from(customerDocumentsTable)
        .where(eq(customerDocumentsTable.subsidyApplicationId, sub.id))
    : [];

  res.json(enrichReceivableSubsidy(updated as Record<string, unknown>, sub, docs));
});

router.post("/receivables/:id/payment", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!req.user) { res.status(401).json({ error: "請先登入" }); return; }

  const PaymentSchema = z.object({
    amount: z.number().positive(),
    paymentDate: z.string(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = PaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    await recordReceivablePayment({
      receivableId: id,
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      paymentMethod: parsed.data.paymentMethod,
      notes: parsed.data.notes,
      user: req.user,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "收款失敗" });
    return;
  }

  const [updated] = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, id));
  res.json(fmt(updated as Record<string, unknown>));
});

router.post("/receivables/:id/reverse-payment", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!req.user) { res.status(401).json({ error: "請先登入" }); return; }

  const ReverseSchema = z.object({
    reason: z.string().trim().min(1, "請填寫撤銷原因"),
    paymentId: z.number().int().optional(),
  });
  const parsed = ReverseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    await reverseReceivablePayment({
      receivableId: id,
      reason: parsed.data.reason,
      paymentId: parsed.data.paymentId,
      user: req.user,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "撤銷收款失敗" });
    return;
  }

  const [updated] = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, id));
  res.json(fmt(updated as Record<string, unknown>));
});

router.delete("/receivables/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(receivablesTable).where(eq(receivablesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "找不到應收帳款" }); return; }
  res.sendStatus(204);
});

export default router;
