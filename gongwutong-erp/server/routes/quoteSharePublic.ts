import { Router, type IRouter } from "express";
import { verifyQuoteShareToken } from "../lib/quoteShareToken";
import { loadQuoteDocument } from "../lib/quoteDocument";
import { buildQuotationHtml } from "../../client/src/components/pdf/templates/QuotationTemplate.ts";

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
 * Returns text/html of the A4 quotation (not SPA index.html).
 */
router.get("/public/quotes/:token", async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const verified = verifyQuoteShareToken(String(raw || ""));
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
    const html = buildQuotationHtml(payload, origin);
    res.status(200).type("text/html; charset=utf-8").send(html);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message || "公開報價單載入失敗",
    });
  }
});

export default router;
