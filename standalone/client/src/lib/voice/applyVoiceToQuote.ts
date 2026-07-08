import type { ParsedVoiceQuote, ParsedVoiceItem } from "../../../../shared/voice/types.ts";

export interface QuoteItemDraft {
  productId: number | null;
  inputMode: "catalog" | "manual";
  addToCatalog: boolean;
  category: string;
  itemName: string;
  brand: string;
  model: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  notes: string;
  sortOrder: number;
}

export interface QuoteFormDraft {
  customerId: number;
  customerName: string;
  contactPerson: string;
  customerPhone: string;
  address: string;
  title: string;
  description: string;
  taxType: string;
  salesRepId: number;
  status: string;
  notes: string;
  discountAmount: number;
  items: QuoteItemDraft[];
}

export function applyVoiceToQuoteForm(
  emptyForm: () => QuoteFormDraft,
  parsed: ParsedVoiceQuote,
): QuoteFormDraft {
  const base = emptyForm();
  const items: QuoteItemDraft[] = (parsed.items ?? []).map((it: ParsedVoiceItem, idx: number) => ({
    productId: it.productId ?? null,
    inputMode: it.inputMode ?? (it.matched ? "catalog" : "manual"),
    addToCatalog: false,
    category: it.category ?? "裝新機",
    itemName: it.itemName ?? "",
    brand: it.brand ?? "",
    model: it.model ?? "",
    quantity: it.quantity ?? 1,
    unit: it.unit ?? "台",
    unitPrice: it.unitPrice ?? 0,
    notes: it.notes ?? "",
    sortOrder: idx,
  }));

  return {
    ...base,
    customerName: parsed.customerName ?? base.customerName,
    contactPerson: parsed.contactPerson ?? base.contactPerson,
    customerPhone: parsed.phone ?? base.customerPhone,
    address: parsed.address ?? base.address,
    title: parsed.title ?? base.title,
    description: parsed.description ?? base.description,
    notes: parsed.notes ?? base.notes,
    items: items.length > 0 ? items : [{
      productId: null,
      inputMode: "manual" as const,
      addToCatalog: false,
      category: "",
      itemName: "",
      brand: "",
      model: "",
      quantity: 1,
      unit: "台",
      unitPrice: 0,
      notes: "",
      sortOrder: 0,
    }],
  };
}
