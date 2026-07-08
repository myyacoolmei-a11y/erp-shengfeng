export type VoiceFormType = "quote" | "work_order" | "repair_case";

export interface ParsedVoiceItem {
  brand?: string;
  itemName?: string;
  model?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  category?: string;
  productId?: number | null;
  unitPrice?: number;
  inputMode?: "catalog" | "manual";
  matched?: boolean;
}

export interface ParsedVoiceBase {
  customerName?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  description?: string;
  notes?: string;
  items?: ParsedVoiceItem[];
}

export interface ParsedVoiceQuote extends ParsedVoiceBase {
  formType: "quote";
  title?: string;
}

export interface ParsedVoiceWorkOrder extends ParsedVoiceBase {
  formType: "work_order";
  title?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  technicians?: string[];
  projectType?: string;
}

export interface ParsedVoiceRepairCase extends ParsedVoiceBase {
  formType: "repair_case";
  brand?: string;
  model?: string;
  quantity?: number;
  problemDescription?: string;
  priority?: string;
  appointmentDate?: string;
  appointmentTime?: string;
}

export type ParsedVoiceResult =
  | ParsedVoiceQuote
  | ParsedVoiceWorkOrder
  | ParsedVoiceRepairCase;

export interface VoiceParseResponse {
  transcript: string;
  provider: string;
  parser: string;
  parsed: ParsedVoiceResult;
}

export interface VoiceTranscribeResponse {
  text: string;
  provider: string;
  confidence?: number;
}
