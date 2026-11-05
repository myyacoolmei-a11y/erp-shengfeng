import type { ParsedVoiceWorkOrder, ParsedVoiceItem } from "../../../../shared/voice/types.ts";
import type { WOForm } from "@/components/work-order-form";
import { makeEmpty, defaultEquipmentItem } from "@/components/work-order-form";

export function applyVoiceToWorkOrderForm(parsed: ParsedVoiceWorkOrder): WOForm {
  const base = makeEmpty();
  const equipmentItems = (parsed.items ?? []).length > 0
    ? (parsed.items ?? []).map((it: ParsedVoiceItem) => ({
        productId: it.productId ?? undefined,
        category: it.category ?? "",
        itemName: it.itemName ?? "",
        brand: it.brand ?? "",
        model: it.model ?? "",
        quantity: it.quantity ?? undefined,
        unit: it.unit ?? "台",
        notes: it.notes ?? "",
        indoorUnits: undefined,
        outdoorUnits: undefined,
        floor: "",
        fromQuote: !!it.matched,
      }))
    : base.equipmentItems;

  return {
    ...base,
    customerName: parsed.customerName ?? "",
    contactPerson: parsed.contactPerson ?? "",
    mobilePhone: parsed.phone ?? "",
    installAddress: parsed.address ?? "",
    title: parsed.title ?? "",
    description: parsed.description ?? "",
    notes: parsed.notes ?? "",
    scheduledDate: parsed.scheduledDate ?? "",
    scheduledTime: parsed.scheduledTime ?? "",
    technicians: parsed.technicians ?? [],
    projectType: parsed.projectType ?? "",
    equipmentItems: equipmentItems.length > 0 ? equipmentItems : [defaultEquipmentItem()],
  };
}
