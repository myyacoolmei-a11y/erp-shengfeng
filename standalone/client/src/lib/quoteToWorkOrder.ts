import { makeEmpty, defaultEquipmentItem, type WOForm } from "@/components/work-order-form";

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

export function canConvertQuoteToWorkOrder(q: {
  status?: string | null;
  dispatchStatus?: string | null;
}): boolean {
  const dispatch = q.dispatchStatus ?? "未派工";
  if (["已派工", "施工中", "已完工"].includes(dispatch)) return false;
  return isQuoteWon(q.status) || dispatch === "待派工";
}

function formatItemLine(item: any, idx: number): string {
  const model = item.model || item.itemName || "—";
  const subtotal = Number(item.subtotal ?? (item.quantity ?? 0) * (item.unitPrice ?? 0));
  return `${idx + 1}. ${item.category}/${item.brand || "—"}/${model} ×${item.quantity}${item.unit} @${Number(item.unitPrice).toLocaleString()} = ${subtotal.toLocaleString()}`;
}

/** Build a pre-filled work order form from a quote — no manual re-entry of quote fields. */
export function buildWorkOrderFormFromQuote(q: any): WOForm {
  const items: any[] = q.items ?? [];
  const firstCategory = items[0]?.category ?? "裝新機";
  const equipmentItems = items.length > 0
    ? items.map((it: any) => ({
        brand: it.brand ?? "",
        model: it.model || it.itemName || "",
        quantity: Number(it.quantity ?? 1),
        indoorUnits: undefined,
        outdoorUnits: undefined,
        floor: "",
      }))
    : [defaultEquipmentItem()];

  const itemLines = items.map(formatItemLine).join("\n");
  const salesLine = q.salesRepName ? `負責業務：${q.salesRepName}` : "";
  const notesParts = [q.notes, salesLine, itemLines ? `報價項目：\n${itemLines}` : ""].filter(Boolean);

  return {
    ...makeEmpty(),
    quoteId: q.id,
    customerId: q.customerId ?? 0,
    customerName: q.customerId ? "" : (q.customerName ?? ""),
    title: q.title ?? "",
    contactPerson: q.contactPerson ?? "",
    mobilePhone: q.customerPhone ?? "",
    installAddress: q.address ?? "",
    projectType: categoryToProjectType(firstCategory),
    description: q.description ?? "",
    notes: notesParts.join("\n\n"),
    equipmentItems,
  };
}
