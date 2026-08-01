import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  subsidyApplicationsTable,
  customerDocumentsTable,
  workOrdersTable,
  receivablesTable,
} from "@workspace/db";
import {
  ALLOWED_SUBSIDY_UPLOAD_MIME,
  SUBSIDY_DOC_TYPE_LABELS,
  SUBSIDY_UPLOAD_TOKEN_TTL_DAYS,
  missingRequiredDocs,
  parseSubsidyMeta,
  requiredDocTypesForInvoiceKind,
  type SubsidyDocType,
} from "../../shared/subsidyDocs.ts";
import {
  normalizeSubsidyInvoiceKind,
  SUBSIDY_INVOICE_KIND_LABELS,
} from "../../shared/adminWorkflowConstants.ts";
import {
  mergeMetaAfterCheck,
  runSubsidyCompletenessCheck,
} from "../lib/subsidy/subsidyCheckService.ts";
import { escHtml } from "../lib/subsidy/subsidyPublicHtml.ts";

const router: IRouter = Router();

function tokenExpired(sentAt: Date | null | undefined, createdAt: Date): boolean {
  const base = sentAt ?? createdAt;
  const ms = SUBSIDY_UPLOAD_TOKEN_TTL_DAYS * 86400000;
  return Date.now() - base.getTime() > ms;
}

async function loadByToken(token: string) {
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.uploadLinkToken, token))
    .limit(1);
  if (!sub || sub.subsidyType !== "company_assisted") return null;
  if (tokenExpired(sub.uploadLinkSentAt, sub.createdAt)) {
    return { expired: true as const, sub };
  }
  const [wo] = await db
    .select({
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      customerName: workOrdersTable.customerName,
      installAddress: workOrdersTable.installAddress,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, sub.workOrderId))
    .limit(1);
  if (!wo) return null;
  const docs = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.subsidyApplicationId, sub.id));
  const [recv] = await db
    .select({
      id: receivablesTable.id,
      invoiceTitle: receivablesTable.invoiceTitle,
      taxId: receivablesTable.taxId,
      invoiceType: receivablesTable.invoiceType,
    })
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, sub.workOrderId))
    .limit(1);
  return { expired: false as const, sub, wo, docs, recv: recv ?? null };
}

async function recomputeAndSave(subId: number, workOrderId: number) {
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.id, subId))
    .limit(1);
  if (!sub || sub.pipelineStatus === "applied") return null;

  const docs = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.subsidyApplicationId, subId));

  const { meta, freeNote } = parseSubsidyMeta(sub.note);
  const check = await runSubsidyCompletenessCheck({
    subsidyType: "company_assisted",
    invoiceKind: normalizeSubsidyInvoiceKind(sub.invoiceKind),
    docs,
    prevMeta: meta,
  });

  const note = mergeMetaAfterCheck(freeNote, meta, check);
  // Don't downgrade past awaiting_upload if still no docs
  let nextPipeline = check.suggestedPipeline;
  if (docs.filter((d) => d.fileUrl).length === 0 && sub.pipelineStatus === "awaiting_upload") {
    nextPipeline = "awaiting_upload";
  } else if (docs.filter((d) => d.fileUrl).length === 0 && sub.pipelineStatus === "link_not_sent") {
    nextPipeline = "link_not_sent";
  }

  await db
    .update(subsidyApplicationsTable)
    .set({
      pipelineStatus: nextPipeline,
      note,
      updatedAt: new Date(),
    })
    .where(eq(subsidyApplicationsTable.id, subId));

  return check;
}

/**
 * Legacy API HTML entry → redirect to SPA customer page.
 * Token validation still happens on SPA via /status + POST upload.
 */
router.get("/public/subsidy-upload/:token", async (req, res): Promise<void> => {
  try {
    const token = String(Array.isArray(req.params.token) ? req.params.token[0] : req.params.token || "");
    const accept = String(req.get("accept") || "");
    // JSON clients (or ?format=json) keep machine-readable payload via /status
    if (accept.includes("application/json") || req.query.format === "json") {
      res.redirect(302, `/api/public/subsidy-upload/${encodeURIComponent(token)}/status`);
      return;
    }
    const loaded = await loadByToken(token);
    if (!loaded) {
      res.status(404).type("html").send(errorPage("連結無效", "此補助上傳連結無效。"));
      return;
    }
    if (loaded.expired) {
      res.status(410).type("html").send(errorPage("連結已過期", "請聯絡晟風工程重新取得上傳連結。"));
      return;
    }
    res.redirect(302, `/subsidy-upload/${encodeURIComponent(token)}`);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "載入失敗" });
  }
});

/** JSON summary for the token (optional clients). */
router.get("/public/subsidy-upload/:token/status", async (req, res): Promise<void> => {
  try {
    const token = String(Array.isArray(req.params.token) ? req.params.token[0] : req.params.token || "");
    const loaded = await loadByToken(token);
    if (!loaded) {
      res.status(404).json({ success: false, message: "連結無效" });
      return;
    }
    if (loaded.expired) {
      res.status(410).json({ success: false, message: "連結已過期" });
      return;
    }
    const { sub, wo, docs, recv } = loaded;
    const { meta } = parseSubsidyMeta(sub.note);
    const invoiceKind = normalizeSubsidyInvoiceKind(sub.invoiceKind);
    const required = requiredDocTypesForInvoiceKind(invoiceKind);
    const activeDocs = docs.filter((d) => d.status !== "rejected");
    const missing = missingRequiredDocs(
      invoiceKind,
      activeDocs.map((d) => d.docType),
    );
    const byType = new Map(activeDocs.map((d) => [d.docType, d]));
    const companyName = (recv?.invoiceTitle ?? "").trim();
    const taxId = (recv?.taxId ?? "").trim();
    const buyerComplete =
      invoiceKind !== "triple" || (companyName.length > 0 && taxId.length > 0);
    res.json({
      success: true,
      brandName: "晟風工程",
      caseNo: wo.workOrderNumber,
      customerName: wo.customerName,
      pipelineStatus: sub.pipelineStatus,
      invoiceKind,
      invoiceKindLabel: invoiceKind ? SUBSIDY_INVOICE_KIND_LABELS[invoiceKind] : null,
      requiresBuyerInfo: invoiceKind === "triple",
      companyName,
      taxId,
      requiredDocs: required.map((t) => {
        const d = byType.get(t);
        const fileUrl = d?.fileUrl ?? null;
        const isImage = !!fileUrl && fileUrl.startsWith("data:image/");
        const previewUrl =
          isImage && fileUrl && fileUrl.length < 400_000 ? fileUrl : null;
        return {
          type: t,
          label: SUBSIDY_DOC_TYPE_LABELS[t],
          uploaded: !!d?.fileUrl,
          fileName: d?.fileName ?? null,
          uploadedAt: d?.uploadedAt ?? null,
          previewUrl,
          isPdf: !!fileUrl?.startsWith("data:application/pdf"),
        };
      }),
      missingDocs: missing,
      missingLabels: missing.map((t) => SUBSIDY_DOC_TYPE_LABELS[t]),
      uploaded: activeDocs.map((d) => ({
        id: d.id,
        docType: d.docType,
        fileName: d.fileName,
        status: d.status,
        uploadedAt: d.uploadedAt,
      })),
      aiTips: meta.aiTips ?? [],
      needsManualReview: !!meta.needsManualReview,
      canSubmitComplete: missing.length === 0 && buyerComplete,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "載入失敗" });
  }
});

/** Save 三聯式 company name + tax ID → receivables.invoice_title / tax_id */
router.post("/public/subsidy-upload/:token/buyer", async (req, res): Promise<void> => {
  try {
    const token = String(Array.isArray(req.params.token) ? req.params.token[0] : req.params.token || "");
    const loaded = await loadByToken(token);
    if (!loaded) {
      res.status(404).json({ success: false, message: "連結無效" });
      return;
    }
    if (loaded.expired) {
      res.status(410).json({ success: false, message: "連結已過期" });
      return;
    }
    if (loaded.sub.pipelineStatus === "applied") {
      res.status(400).json({ success: false, message: "補助已完成，無法再修改" });
      return;
    }
    const invoiceKind = normalizeSubsidyInvoiceKind(loaded.sub.invoiceKind);
    if (invoiceKind !== "triple") {
      res.status(400).json({ success: false, message: "此案件非三聯式，無需填寫公司資料" });
      return;
    }
    const companyName = String(req.body?.companyName ?? "").trim().slice(0, 200);
    const taxId = String(req.body?.taxId ?? "").trim().replace(/\s+/g, "").slice(0, 20);
    if (!companyName) {
      res.status(400).json({ success: false, message: "請填寫公司名稱" });
      return;
    }
    if (!/^\d{8}$/.test(taxId)) {
      res.status(400).json({ success: false, message: "統一編號須為 8 位數字" });
      return;
    }
    if (!loaded.recv) {
      res.status(400).json({ success: false, message: "尚無應收帳款，請聯絡晟風工程" });
      return;
    }
    const now = new Date();
    await db
      .update(receivablesTable)
      .set({
        invoiceTitle: companyName,
        taxId,
        invoiceType: "三聯式發票",
        updatedAt: now,
      })
      .where(eq(receivablesTable.id, loaded.recv.id));
    res.json({ success: true, companyName, taxId });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "儲存失敗" });
  }
});

/** Upload one document (JSON base64 data URL). */
router.post("/public/subsidy-upload/:token", async (req, res): Promise<void> => {
  try {
    const token = String(Array.isArray(req.params.token) ? req.params.token[0] : req.params.token || "");
    const loaded = await loadByToken(token);
    if (!loaded) {
      res.status(404).json({ success: false, message: "連結無效" });
      return;
    }
    if (loaded.expired) {
      res.status(410).json({ success: false, message: "連結已過期" });
      return;
    }
    if (loaded.sub.pipelineStatus === "applied") {
      res.status(400).json({ success: false, message: "補助已完成，無法再上傳" });
      return;
    }

    const docType = String(req.body?.docType ?? "").trim() as SubsidyDocType;
    const fileName = String(req.body?.fileName ?? "upload").slice(0, 200);
    const dataUrl = String(req.body?.dataUrl ?? "");

    if (docType === "invoice" || docType === "warranty") {
      res.status(400).json({ success: false, message: "此案件不需上傳發票或保固書" });
      return;
    }
    const invoiceKind = normalizeSubsidyInvoiceKind(loaded.sub.invoiceKind);
    const allowed = requiredDocTypesForInvoiceKind(invoiceKind);
    if (allowed.length === 0) {
      res.status(400).json({
        success: false,
        message: "行政尚未選定發票類型，暫無法上傳",
      });
      return;
    }
    if (!(allowed as readonly string[]).includes(docType)) {
      res.status(400).json({ success: false, message: "此案件不需要此文件類型" });
      return;
    }
    if (!dataUrl.startsWith("data:") || !dataUrl.includes(",")) {
      res.status(400).json({ success: false, message: "請上傳有效檔案" });
      return;
    }
    const mime = dataUrl.slice(5, dataUrl.indexOf(";")).toLowerCase();
    if (!(ALLOWED_SUBSIDY_UPLOAD_MIME as readonly string[]).includes(mime)) {
      res.status(400).json({ success: false, message: `不支援的格式：${mime}` });
      return;
    }
    const b64 = dataUrl.split(",")[1] ?? "";
    if (b64.length < 32) {
      res.status(400).json({ success: false, message: "檔案為空" });
      return;
    }
    // ~10MB base64 guard
    if (b64.length > 14_000_000) {
      res.status(413).json({ success: false, message: "檔案過大（請小於約 10MB）" });
      return;
    }

    const now = new Date();
    // Replace previous file of same docType for this subsidy app
    const existing = loaded.docs.filter((d) => d.docType === docType);
    for (const old of existing) {
      await db.delete(customerDocumentsTable).where(eq(customerDocumentsTable.id, old.id));
    }

    const [created] = await db
      .insert(customerDocumentsTable)
      .values({
        workOrderId: loaded.sub.workOrderId,
        customerId: loaded.sub.customerId,
        subsidyApplicationId: loaded.sub.id,
        docType,
        fileName,
        fileUrl: dataUrl,
        status: "uploaded",
        uploadedAt: now,
        note: "客戶上傳",
      })
      .returning();

    // Move out of link_not_sent once first upload arrives
    if (
      loaded.sub.pipelineStatus === "link_not_sent" ||
      loaded.sub.pipelineStatus === "awaiting_upload"
    ) {
      await db
        .update(subsidyApplicationsTable)
        .set({ pipelineStatus: "awaiting_upload", updatedAt: now })
        .where(eq(subsidyApplicationsTable.id, loaded.sub.id));
    }

    const check = await recomputeAndSave(loaded.sub.id, loaded.sub.workOrderId);

    res.status(201).json({
      success: true,
      documentId: created.id,
      check: check
        ? {
            missingDocs: check.missingDocs,
            missingLabels: check.missingLabels,
            fileIssues: check.fileIssues,
            aiTips: check.aiTips,
            needsManualReview: check.needsManualReview,
            displayStatus: check.displayStatus,
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "上傳失敗" });
  }
});

function errorPage(title: string, msg: string) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#222}h1{font-size:1.25rem}</style></head>
<body><h1>${escHtml(title)}</h1><p>${escHtml(msg)}</p></body></html>`;
}

export default router;
