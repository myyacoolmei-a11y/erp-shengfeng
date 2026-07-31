import { makeEmpty, defaultEquipmentItem, type WOForm } from "@/components/work-order-form";
import { stripQuotePricingFromNotes, categoryToProjectType, deriveQuoteCustomer } from "../../../shared/workOrderNotes.ts";

export { stripQuotePricingFromNotes, categoryToProjectType };

export function formatQuoteNumber(quote: { id: number; createdAt?: string | null }): string {
  const d = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `Q-${ymd}-${String(quote.id).padStart(4, "0")}`;
}

export function normalizeQuoteStatus(status: string | null | undefined): string {
  if (status === "已接受" || status === "已完成") return "已成交";
  return status ?? "草稿";
}

export function isQuoteWon(status: string | null | undefined): boolean {
  const s = status ?? "";
  return s === "已成交" || s === "已接受";
}

/** True only when a linked work order id/number exists — not inferred from status alone. */
export function quoteHasLinkedWorkOrder(q: {
  workOrderId?: number | string | null;
  workOrderNumber?: string | null;
}): boolean {
  const id = q.workOrderId != null ? Number(q.workOrderId) : NaN;
  if (Number.isFinite(id) && id > 0) return true;
  return !!(q.workOrderNumber && String(q.workOrderNumber).trim());
}

/** Show「建立／安排派工」only for won quotes that do not yet have a work order. */
export function canConvertQuoteToWorkOrder(q: {
  status?: string | null;
  dispatchStatus?: string | null;
  workOrderId?: number | string | null;
  workOrderNumber?: string | null;
}): boolean {
  if (quoteHasLinkedWorkOrder(q)) return false;
  return isQuoteWon(q.status);
}

/** Build a pre-filled work order form from a quote — construction fields only, no pricing. */
export function buildWorkOrderFormFromQuote(q: any): WOForm {
  const items: any[] = q.items ?? [];
  const firstCategory = items[0]?.category ?? "裝新機";
  const equipmentItems = items.length > 0
    ? items.map((it: any) => ({
        productId: it.productId ?? undefined,
        quoteItemId: it.id ?? undefined,
        category: it.category ?? "",
        itemName: it.itemName ?? "",
        brand: it.brand ?? "",
        model: it.model ?? "",
        quantity: Number(it.quantity ?? 1),
        unit: it.unit ?? "台",
        notes: it.notes ?? "",
        indoorUnits: undefined,
        outdoorUnits: undefined,
        floor: "",
        fromQuote: true,
      }))
    : [defaultEquipmentItem()];

  const salesLine = q.salesRepName ? `負責業務：${q.salesRepName}` : "";
  const notesParts = [q.notes, salesLine].filter(Boolean);

  // Resolve the quote's customer using the same rules as the direct
  // "新增派工單" flow: an official customerId is preserved as-is; otherwise
  // the quote's name/phone are carried over as the work order's temporary
  // customer. `customerMode` MUST be set here — buildPayload() relies on it
  // to decide whether to send customerId or the temporary customer fields,
  // and previously left it unset, which caused customerId to be dropped and
  // customerName to be sent as an empty string (HTTP 400).
  const { customerId, customerName, customerPhone } = deriveQuoteCustomer(q);
  const hasCustomerId = customerId != null;

  return {
    ...makeEmpty(),
    quoteId: q.id,
    // Quote → WO requires formal customer_id; snapshots always kept for display.
    customerMode: hasCustomerId ? "existing" : null,
    customerId: hasCustomerId ? customerId : 0,
    customerName: customerName || "",
    title: q.title ?? "",
    contactPerson: q.contactPerson ?? "",
    mobilePhone: customerPhone,
    installAddress: q.address ?? "",
    projectType: categoryToProjectType(firstCategory),
    description: q.description ?? "",
    notes: stripQuotePricingFromNotes(notesParts.join("\n\n")),
    equipmentItems,
  };
}
