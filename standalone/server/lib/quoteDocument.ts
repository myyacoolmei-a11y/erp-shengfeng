import { eq } from "drizzle-orm";
import { db, quotesTable, customersTable, employeesTable, quoteItemsTable } from "@workspace/db";
import { syncQuoteDispatchStatus } from "./quoteWorkflow";
import { normalizeQuoteStatus } from "./quoteStatus";

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
  notes: quotesTable.notes,
  address: quotesTable.address,
  customerPhone: quotesTable.customerPhone,
  taxType: quotesTable.taxType,
  salesRepId: quotesTable.salesRepId,
  salesRepName: employeesTable.name,
  createdAt: quotesTable.createdAt,
  updatedAt: quotesTable.updatedAt,
};

export function serializeQuoteItem(item: typeof quoteItemsTable.$inferSelect) {
  return {
    id: item.id,
    quoteId: item.quoteId,
    productId: item.productId ?? null,
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
  };
}

export function serializeQuoteDocument(
  q: any,
  items: ReturnType<typeof serializeQuoteItem>[] = [],
  workflow?: { dispatchStatus: string; workOrderId: number | null; workOrderNumber: string | null },
) {
  return {
    id: q.id,
    customerId: q.customerId ?? null,
    customerName: q.customerName ?? q.joinedCustomerName ?? null,
    contactPerson: q.contactPerson ?? null,
    title: q.title,
    description: q.description ?? null,
    amount: parseFloat(q.amount as string),
    discountAmount: q.discountAmount != null ? parseFloat(q.discountAmount as string) : null,
    finalAmount: q.finalAmount != null ? parseFloat(q.finalAmount as string) : null,
    status: normalizeQuoteStatus(q.status),
    lostReason: q.lostReason ?? null,
    dispatchStatus: workflow?.dispatchStatus ?? q.dispatchStatus ?? "未派工",
    workOrderId: workflow?.workOrderId ?? null,
    workOrderNumber: workflow?.workOrderNumber ?? null,
    notes: q.notes ?? null,
    address: q.address ?? null,
    customerPhone: q.customerPhone ?? null,
    taxType: q.taxType ?? "未稅",
    salesRepId: q.salesRepId ?? null,
    salesRepName: q.salesRepName ?? null,
    items,
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
    updatedAt: q.updatedAt instanceof Date ? q.updatedAt.toISOString() : q.updatedAt,
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
