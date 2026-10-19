const CATEGORY_TO_PROJECT: Record<string, string> = {
  "裝新機": "新裝",
  "保養": "保養",
  "維修": "維修",
  "移機": "遷機",
  "拆機": "清洗",
  "冷媒工程": "新裝",
  "配管工程": "新裝",
  "其他": "新裝",
};

export function categoryToProjectType(category: string | null | undefined): string {
  return CATEGORY_TO_PROJECT[category ?? ""] ?? "新裝";
}

/**
 * Loosely-typed quote shape accepted by `deriveQuoteCustomer`. The API only
 * ever sends camelCase fields (customerId / customerName / customerPhone),
 * but this also tolerates snake_case or a nested `customer` object so any
 * quote-derived flow resolves the exact same customer identity the quote
 * screen itself displays.
 */
export interface QuoteCustomerLike {
  customerId?: number | string | null;
  customer_id?: number | string | null;
  customerName?: string | null;
  customer_name?: string | null;
  customerPhone?: string | null;
  customer_phone?: string | null;
  contactPerson?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  client_name?: string | null;
  phone?: string | null;
  customer?: { id?: number | string | null; name?: string | null; phone?: string | null } | null;
}

export interface DerivedQuoteCustomer {
  /** Official customer id, or null when the quote only has a temporary/manual customer. */
  customerId: number | null;
  customerName: string;
  customerPhone: string;
}

/**
 * Resolve a quote's customer identity/name/phone regardless of field naming
 * convention, so that "quote → work order" and "link quote to work order"
 * flows always carry the exact same customer data as the quote screen,
 * matching the fields the direct work-order-creation flow already uses
 * (customerId / customerName / mobilePhone).
 */
export function deriveQuoteCustomer(q: QuoteCustomerLike | null | undefined): DerivedQuoteCustomer {
  if (!q) return { customerId: null, customerName: "", customerPhone: "" };

  const rawId = q.customerId ?? q.customer_id ?? q.customer?.id ?? null;
  const numericId = rawId != null ? Number(rawId) : NaN;
  const customerId = Number.isFinite(numericId) && numericId > 0 ? numericId : null;

  const customerName =
    q.customerName ?? q.customer_name ?? q.customer?.name ?? q.client_name ?? q.contact_name ?? "";

  const customerPhone =
    q.customerPhone ?? q.customer_phone ?? q.customer?.phone ?? q.contact_phone ?? q.phone ?? "";

  return {
    customerId,
    customerName: customerName ?? "",
    customerPhone: customerPhone ?? "",
  };
}

/** Remove legacy quote-item price blocks from work order notes (no pricing on WO). */
export function stripQuotePricingFromNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  const marker = "報價項目：";
  const idx = notes.indexOf(marker);
  if (idx >= 0) return notes.slice(0, idx).replace(/\n+$/, "").trim();
  return notes
    .split("\n")
    .filter(line => !/@[\d,]+(\s*=|$)/.test(line))
    .join("\n")
    .trim();
}
