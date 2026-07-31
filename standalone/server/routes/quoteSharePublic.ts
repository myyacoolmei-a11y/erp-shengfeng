import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, quotesTable, customersTable, employeesTable, quoteItemsTable } from "@workspace/db";
import { verifyQuoteShareToken } from "../lib/quoteShareToken";
import { buildQuotationHtml } from "../../client/src/components/pdf/templates/QuotationTemplate.ts";
import { normalizeQuoteStatus } from "../lib/quoteStatus";

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

    const [quote] = await db
      .select({
        id: quotesTable.id,
        customerId: quotesTable.customerId,
        customerName: quotesTable.customerName,
        joinedCustomerName: customersTable.name,
        contactPerson: quotesTable.contactPerson,
        title: quotesTable.title,
        description: quotesTable.description,
        amount: quotesTable.amount,
        discountAmount: quotesTable.discountAmount,
        finalAmount: quotesTable.finalAmount,
        status: quotesTable.status,
        notes: quotesTable.notes,
        address: quotesTable.address,
        customerPhone: quotesTable.customerPhone,
        taxType: quotesTable.taxType,
        salesRepId: quotesTable.salesRepId,
        salesRepName: employeesTable.name,
        createdAt: quotesTable.createdAt,
        updatedAt: quotesTable.updatedAt,
      })
      .from(quotesTable)
      .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
      .leftJoin(employeesTable, eq(quotesTable.salesRepId, employeesTable.id))
      .where(eq(quotesTable.id, verified.quoteId))
      .limit(1);

    if (!quote) {
      res.status(404).type("text/html; charset=utf-8").send(
        "<!doctype html><meta charset=utf-8><title>找不到報價單</title><p>找不到此報價單。</p>",
      );
      return;
    }

    const items = await db
      .select()
      .from(quoteItemsTable)
      .where(eq(quoteItemsTable.quoteId, verified.quoteId))
      .orderBy(quoteItemsTable.sortOrder);

    const payload = {
      id: quote.id,
      customerName: quote.customerName ?? quote.joinedCustomerName ?? null,
      contactPerson: quote.contactPerson ?? null,
      title: quote.title,
      description: quote.description ?? null,
      amount: parseFloat(quote.amount as string),
      discountAmount: quote.discountAmount != null ? parseFloat(quote.discountAmount as string) : null,
      finalAmount: quote.finalAmount != null ? parseFloat(quote.finalAmount as string) : null,
      status: normalizeQuoteStatus(quote.status),
      notes: quote.notes ?? null,
      address: quote.address ?? null,
      customerPhone: quote.customerPhone ?? null,
      taxType: quote.taxType ?? "未稅",
      salesRepName: quote.salesRepName ?? null,
      createdAt: quote.createdAt instanceof Date ? quote.createdAt.toISOString() : quote.createdAt,
      items: items.map((item) => ({
        id: item.id,
        category: item.category,
        itemName: item.itemName,
        brand: item.brand ?? null,
        model: item.model ?? null,
        quantity: parseFloat(item.quantity as string),
        unit: item.unit,
        unitPrice: parseFloat(item.unitPrice as string),
        subtotal: parseFloat(item.subtotal as string),
        notes: item.notes ?? null,
        sortOrder: item.sortOrder,
      })),
    };

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
