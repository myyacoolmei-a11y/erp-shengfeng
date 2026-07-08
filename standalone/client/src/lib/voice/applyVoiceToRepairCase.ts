import type { ParsedVoiceRepairCase } from "../../../../shared/voice/types.ts";
import type { CustomerSelectorValue } from "@/components/customer-selector";

export interface RepairCaseFormDraft {
  source: string;
  contactName: string;
  phone: string;
  address: string;
  siteAddress: string;
  brand: string;
  model: string;
  quantity: number;
  problemDescription: string;
  status: string;
  priority: string;
  appointmentDate: string;
  appointmentTime: string;
  employeeId: number | null;
  notes: string;
  photos: string[];
}

export function applyVoiceToRepairCaseForm(
  emptyForm: () => RepairCaseFormDraft,
  parsed: ParsedVoiceRepairCase,
): RepairCaseFormDraft {
  const base = emptyForm();
  return {
    ...base,
    contactName: parsed.contactPerson ?? parsed.customerName ?? base.contactName,
    phone: parsed.phone ?? base.phone,
    address: parsed.address ?? base.address,
    siteAddress: parsed.address ?? base.siteAddress,
    brand: parsed.brand ?? base.brand,
    model: parsed.model ?? base.model,
    quantity: parsed.quantity ?? base.quantity,
    problemDescription: parsed.problemDescription ?? base.problemDescription,
    priority: parsed.priority ?? base.priority,
    appointmentDate: parsed.appointmentDate ?? base.appointmentDate,
    appointmentTime: parsed.appointmentTime ?? base.appointmentTime,
    notes: parsed.notes ?? base.notes,
  };
}

export function customerFromVoiceRepair(parsed: ParsedVoiceRepairCase): CustomerSelectorValue | null {
  if (!parsed.customerName) return null;
  return {
    type: "temp",
    customerId: null,
    name: parsed.customerName,
    contactPerson: parsed.contactPerson ?? "",
    phone: parsed.phone ?? "",
    mobile: parsed.phone ?? "",
    address: parsed.address ?? "",
    taxId: "",
  };
}
