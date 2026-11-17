import { eq } from "drizzle-orm";
import { db, quotesTable, customersTable, employeesTable, quoteItemsTable } from "@workspace/db";
import { syncQuoteDispatchStatus } from "./quoteWorkflow";
import { normalizeQuoteStatus } from "./quoteStatus";
import {
  deriveQuoteWorkflowStage,
  normalizeQuoteDocumentType,
} from "../../shared/quoteIntentLogic.ts";

/**
 * Canonical quotation document loader.
 * Always reads `quotes` + `quote_items` (+ customer / sales-rep joins).
 * Never reads work_orders description / equipment — those are a separate document.
 */
export const QUOTE_DOCUMENT_SELECT = {
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
  lostReason: quotesTable.lostReason,
  dispatchStatus: quotesTable.dispatchStatus,
  documentType: quotesTable.documentType,
  workflowStage: quotesTable.workflowStage,
  sourceIntentQuoteId: quotesTable.sourceIntentQuoteId,
  convertedFormalQuoteId: quotesTable.convertedFormalQuoteId,
  intentGroups: quotesTable.intentGroups,
  customerSelectedAt: quotesTable.customerSelectedAt,
  customerSelections: quotesTable.customerSelections,
  customerConfirmedAt: quotesTable.customerConfirmedAt,
  confirmationMethod: quotesTable.confirmationMethod,
  agreedTerms: quotesTable.agreedTerms,
  signatureDataUrl: quotesTable.signatureDataUrl,
  confirmedVersion: quotesTable.confirmedVersion,
  confirmedSnapshot: quotesTable.confirmedSnapshot,
  notes: quotesTable.notes,
  address: quotesTable.address,
  customerPhone: quotesTable.customerPhone,
  taxType: quotesTable.taxType,
  salesRepId: quotesTable.salesRepId,
  salesRepName: employeesTable.name,
  wonAt: quotesTable.wonAt,
  wonBy: quotesTable.wonBy,
  wonByName: quotesTable.wonByName,
  winCanceledAt: quotesTable.winCanceledAt,
  winCanceledBy: quotesTable.winCanceledBy,
  winCanceledByName: quotesTable.winCanceledByName,
  createdAt: quotesTable.createdAt,
  updatedAt: quotesTable.updatedAt,
};

function toIso(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

export function serializeQuoteItem(item: typeof quoteItemsTable.$inferSelect) {
  return {
    id: item.id,
    quoteId: item.quoteId,
    productId: item.productId ?? null,
    category: item.category,
    itemName: item.itemName,
    brand: item.brand ?? null,
    model: item.model ?? null,
    quantity: parseFloat(String(item.quantity ?? 1)),
    unit: item.unit,
    unitPrice: parseFloat(String(item.unitPrice ?? 0)),
    installFee: parseFloat(String(item.installFee ?? 0)),
    subtotal: parseFloat(String(item.subtotal ?? 0)),
    notes: item.notes ?? null,
    workContent: item.workContent ?? null,
    optionGroupId: item.optionGroupId ?? null,
    optionGroupName: item.optionGroupName ?? null,
    isRequiredGroup: item.isRequiredGroup !== false,
    selectionMode: item.selectionMode ?? "single",
    isSelected: item.isSelected ?? null,
    sortOrder: item.sortOrder,
  };
}

export function serializeQuoteDocument(
  q: any,
  items: ReturnType<typeof serializeQuoteItem>[] = [],
  workflow?: {
    dispatchStatus: string;
    workflowStage?: string;
    workOrderId: number | null;
    workOrderNumber: string | null;
  },
) {
  const dispatchStatus = workflow?.dispatchStatus ?? q.dispatchStatus ?? "未派工";
  const workOrderId = workflow?.workOrderId ?? null;
  const workflowStage =
    workflow?.workflowStage ??
    deriveQuoteWorkflowStage({
      ...q,
      dispatchStatus,
      workOrderId,
    });

  return {
    id: q.id,
    customerId: q.customerId ?? null,
    customerName: q.customerName ?? q.joinedCustomerName ?? null,
    contactPerson: q.contactPerson ?? null,
    title: q.title,
    description: q.description ?? null,
    amount: parseFloat(String(q.amount ?? 0)),
    discountAmount: q.discountAmount != null ? parseFloat(String(q.discountAmount)) : null,
    finalAmount: q.finalAmount != null ? parseFloat(String(q.finalAmount)) : null,
    status: normalizeQuoteStatus(q.status),
    lostReason: q.lostReason ?? null,
    dispatchStatus,
    documentType: normalizeQuoteDocumentType(q.documentType),
    workflowStage,
    sourceIntentQuoteId: q.sourceIntentQuoteId ?? null,
    convertedFormalQuoteId: q.convertedFormalQuoteId ?? null,
    intentGroups: q.intentGroups ?? null,
    customerSelectedAt: toIso(q.customerSelectedAt),
    customerSelections: q.customerSelections ?? null,
    customerConfirmedAt: toIso(q.customerConfirmedAt),
    confirmationMethod: q.confirmationMethod ?? null,
    agreedTerms: Boolean(q.agreedTerms),
    signatureDataUrl: q.signatureDataUrl ?? null,
    confirmedVersion: Number(q.confirmedVersion ?? 1),
    confirmedSnapshot: q.confirmedSnapshot ?? null,
    workOrderId,
    workOrderNumber: workflow?.workOrderNumber ?? null,
    notes: q.notes ?? null,
    address: q.address ?? null,
    customerPhone: q.customerPhone ?? null,
    taxType: q.taxType ?? "未稅",
    salesRepId: q.salesRepId ?? null,
    salesRepName: q.salesRepName ?? null,
    wonAt: toIso(q.wonAt),
    wonBy: q.wonBy ?? null,
    wonByName: q.wonByName ?? null,
    winCanceledAt: toIso(q.winCanceledAt),
    winCanceledBy: q.winCanceledBy ?? null,
    winCanceledByName: q.winCanceledByName ?? null,
    items,
    createdAt: toIso(q.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(q.updatedAt) ?? new Date().toISOString(),
  };
}

export async function loadQuoteDocument(quoteId: number) {
  const [quote] = await db
    .select(QUOTE_DOCUMENT_SELECT)
    .from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(quotesTable.salesRepId, employeesTable.id))
    .where(eq(quotesTable.id, quoteId))
    .limit(1);

  if (!quote) return null;

  const workflow = await syncQuoteDispatchStatus(quoteId);

  const items = await db
    .select()
    .from(quoteItemsTable)
    .where(eq(quoteItemsTable.quoteId, quoteId))
    .orderBy(quoteItemsTable.sortOrder);

  return serializeQuoteDocument(quote, items.map(serializeQuoteItem), workflow ?? undefined);
}
