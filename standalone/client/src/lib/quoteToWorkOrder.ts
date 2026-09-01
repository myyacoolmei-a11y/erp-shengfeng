import { makeEmpty, defaultEquipmentItem, type WOForm } from "@/components/work-order-form";
import { stripQuotePricingFromNotes, categoryToProjectType, deriveQuoteCustomer } from "../../../shared/workOrderNotes.ts";
import {
  normalizeQuoteStatus,
  isQuoteWon,
  isQuoteLost,
  quoteListTab,
  quoteStatusLabel,
} from "../../../shared/quoteStatus.ts";

export { stripQuotePricingFromNotes, categoryToProjectType };
export { normalizeQuoteStatus, isQuoteWon, isQuoteLost, quoteListTab, quoteStatusLabel };

export function formatQuoteNumber(quote: { id: number; createdAt?: string | null }): string {
  const d = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `Q-${ymd}-${String(quote.id).padStart(4, "0")}`;
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

/** Show「客戶成交・建立派工單」when this quote does not already have a work order and is not 未成交. */
export function canWinQuoteAndCreateWorkOrder(q: {
  status?: string | null;
  workOrderId?: number | string | null;
  workOrderNumber?: string | null;
}): boolean {
  if (quoteHasLinkedWorkOrder(q)) return false;
  return !isQuoteLost(q.status);
}

/** @deprecated Use canWinQuoteAndCreateWorkOrder — win is the action that creates the work order. */
export function canConvertQuoteToWorkOrder(q: {
  status?: string | null;
  dispatchStatus?: string | null;
  workOrderId?: number | string | null;
  workOrderNumber?: string | null;
}): boolean {
  return canWinQuoteAndCreateWorkOrder(q);
}

/** Build a pre-filled work order form from a quote. */
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

  const { customerId, customerName, customerPhone } = deriveQuoteCustomer(q);
  const hasCustomerId = customerId != null;

  return {
    ...makeEmpty(),
    quoteId: q.id,
    customerMode: hasCustomerId ? "existing" : (customerName ? "temporary" : null),
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
