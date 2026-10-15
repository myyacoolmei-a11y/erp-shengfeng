import { getQuote } from "@workspace/api-client-react";
import type { Quote } from "@workspace/api-client-react";
import { buildQuotationHtml } from "@/components/pdf/templates/QuotationTemplate";
import { handlePdfAction } from "@/components/pdf/pdf-service";
import { formatQuoteNumber } from "@/lib/quoteToWorkOrder";

const AUTH_TOKEN_KEY = "erp_auth_token";

function authHeaders(): HeadersInit {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || data?.message || fallback;
  } catch {
    return fallback;
  }
}

/** 報價單 PDF／查看：一律依 quotation id 回查 quotes + quote_items，不用列表快取。 */
export async function loadQuoteForDocument(quoteId: number | null | undefined): Promise<Quote> {
  const id = Number(quoteId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("找不到來源報價單");
  }
  return getQuote(id);
}

/**
 * 派工單 → 來源報價單：依 work_orders.quote_id 由伺服器回查原始報價單。
 * 不會把施工內容／材料設備組成報價單。
 */
export async function loadSourceQuoteFromWorkOrder(workOrderId: number | null | undefined): Promise<Quote> {
  const id = Number(workOrderId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("找不到派工單");
  }
  const res = await fetch(`/api/work-orders/${id}/source-quote`, {
    headers: authHeaders(),
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `無法載入來源報價單（HTTP ${res.status}）`));
  }
  return res.json();
}

export function getQuoteNo(quote: { id: number; createdAt?: string | null }): string {
  return formatQuoteNumber(quote);
}

type PdfToast = { (opts: { title: string; description?: string; variant?: string }): void };

export async function printQuoteDocument(
  quote: Quote,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: PdfToast,
) {
  const quoteNo = getQuoteNo(quote);
  const html = buildQuotationHtml(quote);
  await handlePdfAction({
    html,
    docNo: quoteNo,
    filename: `報價單_${quoteNo}.pdf`,
    title: "晟風工程報價單",
    action: "print",
    setPdfPreview,
    toast,
    pageFormat: "a4",
  });
}

export async function downloadQuoteDocument(
  quote: Quote,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: PdfToast,
) {
  const quoteNo = getQuoteNo(quote);
  const html = buildQuotationHtml(quote);
  await handlePdfAction({
    html,
    docNo: quoteNo,
    filename: `報價單_${quoteNo}.pdf`,
    title: "晟風工程報價單",
    action: "download",
    setPdfPreview,
    toast,
    pageFormat: "a4",
  });
}

export async function previewQuoteDocument(
  quote: Quote,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: PdfToast,
) {
  const quoteNo = getQuoteNo(quote);
  const html = buildQuotationHtml(quote);
  return handlePdfAction({
    html,
    docNo: quoteNo,
    filename: `報價單_${quoteNo}.pdf`,
    title: "晟風工程報價單",
    action: "preview",
    setPdfPreview,
    toast,
    pageFormat: "a4",
  });
}

export async function printSourceQuoteFromWorkOrder(
  workOrder: { id: number; quoteId?: number | null },
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: PdfToast,
) {
  const quote = await loadSourceQuoteFromWorkOrder(workOrder.id);
  await printQuoteDocument(quote, setPdfPreview, toast);
}
