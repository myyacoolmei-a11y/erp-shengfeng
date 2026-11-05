import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, quotesTable } from "@workspace/db";
import { signQuoteShareToken, verifyQuoteShareToken } from "../lib/quoteShareToken";
import { loadQuoteDocument } from "../lib/quoteDocument";
import { formatQuoteNumber } from "../lib/quoteStatus";
import {
  confirmPublicFormalQuoteAndDispatch,
  submitPublicIntentSelection,
} from "../lib/quoteWinDispatch";
import { buildQuotationHtml } from "../../client/src/components/pdf/templates/QuotationTemplate.ts";
import { buildPublicQuoteInteractiveHtml } from "../../client/src/components/pdf/templates/PublicQuoteInteractiveTemplate.ts";

const router: IRouter = Router();

function requestOrigin(req: { protocol: string; get: (h: string) => string | undefined }): string {
  const env = process.env["PUBLIC_APP_URL"] || process.env["APP_URL"];
  if (env) return env.replace(/\/$/, "");
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  return `${proto}://${host}`;
}

/**
 * Public quotation view — no login required.
 * GET /api/public/quotes/:token
 * Renders either:
 * - Intent choice slip interactive selector (when documentType === "intent")
 * - Formal quotation A4 + online confirmation & e-signature pad (when documentType === "formal")
 * - Pure A4 print view when ?print=1 is passed
 */
router.get("/public/quotes/:token", async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const token = String(raw || "");
    const verified = verifyQuoteShareToken(token);
    if (!verified) {
      res.status(404).type("text/html; charset=utf-8").send(
        "<!doctype html><meta charset=utf-8><title>連結無效</title><p>此報價單分享連結無效或已過期。</p>",
      );
      return;
    }

    const payload = await loadQuoteDocument(verified.quoteId);
    if (!payload) {
      res.status(404).type("text/html; charset=utf-8").send(
        "<!doctype html><meta charset=utf-8><title>找不到報價單</title><p>找不到此報價單。</p>",
      );
      return;
    }

    const origin = requestOrigin(req);
    const isPurePrint = req.query.print === "1" || req.query.mode === "print";
    if (isPurePrint && payload.documentType !== "intent") {
      const html = buildQuotationHtml(payload, origin);
      res.status(200).type("text/html; charset=utf-8").send(html);
      return;
    }

    let formalShareUrl: string | null = null;
    if (payload.documentType === "intent" && payload.convertedFormalQuoteId) {
      const formalToken = signQuoteShareToken(payload.convertedFormalQuoteId);
      formalShareUrl = `${origin}/api/public/quotes/${formalToken}`;
    }

    let sourceIntentNumber: string | null = null;
    if (payload.sourceIntentQuoteId) {
      const [srcQuote] = await db
        .select({ id: quotesTable.id, createdAt: quotesTable.createdAt })
        .from(quotesTable)
        .where(eq(quotesTable.id, payload.sourceIntentQuoteId))
        .limit(1);
      if (srcQuote) {
        sourceIntentNumber = formatQuoteNumber(srcQuote.id, srcQuote.createdAt);
      }
    }

    const html = buildPublicQuoteInteractiveHtml(payload, token, origin, {
      formalShareUrl,
      sourceIntentNumber,
    });
    res.status(200).type("text/html; charset=utf-8").send(html);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message || "公開報價單載入失敗",
    });
  }
});

/**
 * GET /api/public/quotes/:token/data
 * Safe JSON representation of the single quote scoped to this token.
 */
router.get("/public/quotes/:token/data", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const verified = verifyQuoteShareToken(String(raw || ""));
  if (!verified) {
    res.status(404).json({ error: "此報價單分享連結無效或已過期" });
    return;
  }
  const payload = await loadQuoteDocument(verified.quoteId);
  if (!payload) {
    res.status(404).json({ error: "找不到此報價單" });
    return;
  }
  res.json({
    id: payload.id,
    quoteNumber: formatQuoteNumber(payload.id, payload.createdAt),
    documentType: payload.documentType,
    workflowStage: payload.workflowStage,
    status: payload.status,
    confirmedVersion: payload.confirmedVersion,
    customerName: payload.customerName,
    title: payload.title,
    description: payload.description,
    notes: payload.notes,
    taxType: payload.taxType,
    amount: payload.amount,
    discountAmount: payload.discountAmount,
    finalAmount: payload.finalAmount,
    intentGroups: payload.intentGroups,
    customerSelectedAt: payload.customerSelectedAt,
    customerConfirmedAt: payload.customerConfirmedAt,
    convertedFormalQuoteId: payload.convertedFormalQuoteId,
    sourceIntentQuoteId: payload.sourceIntentQuoteId,
    workOrderId: payload.workOrderId,
    workOrderNumber: payload.workOrderNumber,
    items: payload.items,
  });
});

/**
 * POST /api/public/quotes/:token/select
 * Customer submits selected candidate options on an intent choice slip.
 * Server recalculates totals from DB prices and generates the linked formal quotation.
 */
router.post("/public/quotes/:token/select", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const verified = verifyQuoteShareToken(String(raw || ""));
  if (!verified) {
    res.status(404).json({ success: false, error: "此意向選擇單連結無效或已過期" });
    return;
  }

  const selectedItemIds = Array.isArray(req.body?.selectedItemIds)
    ? req.body.selectedItemIds.map((id: unknown) => Number(id)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  const expectedVersion =
    req.body?.expectedVersion != null ? Number(req.body.expectedVersion) : undefined;

  const result = await submitPublicIntentSelection({
    intentQuoteId: verified.quoteId,
    selectedItemIds,
    expectedVersion,
  });

  if (!result.ok) {
    res.status(result.status).json({
      success: false,
      error: result.error,
    });
    return;
  }

  const origin = requestOrigin(req);
  const formalToken = signQuoteShareToken(result.formalQuoteId);
  const formalShareUrl = `${origin}/api/public/quotes/${formalToken}`;

  res.status(200).json({
    success: true,
    intentQuoteId: result.intentQuoteId,
    formalQuoteId: result.formalQuoteId,
    formalQuoteNumber: result.formalQuoteNumber,
    totalWithTax: result.totalWithTax,
    formalToken,
    formalShareUrl,
  });
});

/**
 * POST /api/public/quotes/:token/confirm
 * Customer confirms the formal quotation (with optional handwritten signature).
 * Locks the confirmed version snapshot and automatically creates a pending ("待安排") work order.
 */
router.post("/public/quotes/:token/confirm", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const verified = verifyQuoteShareToken(String(raw || ""));
  if (!verified) {
    res.status(404).json({ ok: false, error: "此報價單連結無效或已過期" });
    return;
  }

  const agreedTerms = req.body?.agreedTerms === true;
  const expectedVersion =
    req.body?.expectedVersion != null ? Number(req.body.expectedVersion) : undefined;
  const signatureDataUrl =
    typeof req.body?.signatureDataUrl === "string" ? req.body.signatureDataUrl : null;
  const confirmationMethod =
    req.body?.confirmationMethod === "electronic_signature"
      ? "electronic_signature"
      : "electronic_check";

  const origin = requestOrigin(req);
  const result = await confirmPublicFormalQuoteAndDispatch({
    quoteId: verified.quoteId,
    expectedVersion,
    agreedTerms,
    signatureDataUrl,
    confirmationMethod,
    baseOrigin: origin,
  });

  if (!result.ok) {
    res.status(result.status).json({
      ok: false,
      error: result.error,
    });
    return;
  }

  res.status(200).json(result);
});

export default router;
