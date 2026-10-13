/**
 * 派工單系統升級：工單類型、師傅、收款方式、發票狀態。
 * 純資料轉換，不依賴 DOM／Express；前後端與列印共用。
 * 舊資料沒有新欄位時由 projectType / technicians / receivables 推導，不得丟資料。
 */

export const WO_JOB_TYPE_OPTIONS = ["安裝", "保養", "維修", "送貨／出貨", "其他"] as const;
export type WoJobType = (typeof WO_JOB_TYPE_OPTIONS)[number];

export const WO_PAYMENT_METHOD_OPTIONS = ["現金", "銀行匯款", "支票", "LINE Pay", "其他"] as const;
export type WoPaymentMethod = (typeof WO_PAYMENT_METHOD_OPTIONS)[number];

export const WO_PAYMENT_STATUSES = ["未收款", "部分收款", "已收款", "無須收款"] as const;
export type WoPaymentStatus = (typeof WO_PAYMENT_STATUSES)[number];

export const WO_INVOICE_STATUSES = ["不需開立", "待開立", "已開立"] as const;
export type WoInvoiceStatus = (typeof WO_INVOICE_STATUSES)[number];

const LEGACY_PROJECT_TO_JOB: Record<string, { types: WoJobType[]; other?: string }> = {
  新裝: { types: ["安裝"] },
  安裝: { types: ["安裝"] },
  保養: { types: ["保養"] },
  維修: { types: ["維修"] },
  遷機: { types: ["其他"], other: "遷機" },
  清洗: { types: ["其他"], other: "清洗" },
  保固服務: { types: ["其他"], other: "保固服務" },
  "送貨／出貨": { types: ["送貨／出貨"] },
  "送貨/出貨": { types: ["送貨／出貨"] },
};

const JOB_TO_PROJECT: Record<string, string> = {
  安裝: "新裝",
  保養: "保養",
  維修: "維修",
  "送貨／出貨": "送貨／出貨",
};

const PAYMENT_METHOD_ALIASES: Record<string, WoPaymentMethod> = {
  現金: "現金",
  匯款: "銀行匯款",
  銀行匯款: "銀行匯款",
  銀行轉帳: "銀行匯款",
  轉帳: "銀行匯款",
  支票: "支票",
  "LINE Pay": "LINE Pay",
  LINEPay: "LINE Pay",
  LinePay: "LINE Pay",
  其他: "其他",
};

export function isWoJobType(value: string): value is WoJobType {
  return (WO_JOB_TYPE_OPTIONS as readonly string[]).includes(value);
}

export function normalizePaymentMethod(value: string | null | undefined): WoPaymentMethod | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return PAYMENT_METHOD_ALIASES[trimmed] ?? (trimmed === "其他" ? "其他" : "其他");
}

export function canonicalPaymentMethod(value: string | null | undefined): string {
  const n = normalizePaymentMethod(value);
  return n ?? (value ?? "").trim();
}

export interface ResolvedJobTypes {
  types: WoJobType[];
  otherLabel: string;
  /** true when derived from legacy projectType because job_types is empty */
  fromLegacy: boolean;
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v ?? "").trim()).filter(Boolean);
      }
    } catch {
      return s.split(/[,，、]/).map((p) => p.trim()).filter(Boolean);
    }
  }
  return [];
}

export function resolveJobTypes(input: {
  jobTypes?: unknown;
  jobTypeOther?: string | null;
  projectType?: string | null;
}): ResolvedJobTypes {
  const raw = asStringArray(input.jobTypes);
  const types = raw.filter(isWoJobType);
  const otherLabel = (input.jobTypeOther ?? "").trim();
  if (types.length > 0) {
    return { types, otherLabel, fromLegacy: false };
  }

  const pt = (input.projectType ?? "").trim();
  if (!pt) return { types: [], otherLabel: "", fromLegacy: true };
  const mapped = LEGACY_PROJECT_TO_JOB[pt];
  if (mapped) {
    return { types: [...mapped.types], otherLabel: mapped.other ?? "", fromLegacy: true };
  }
  // 無法對應的舊類型：列印／畫面不猜測勾選
  return { types: [], otherLabel: "", fromLegacy: true };
}

export function jobTypeLabels(resolved: ResolvedJobTypes): string[] {
  return resolved.types.map((t) => (t === "其他" && resolved.otherLabel ? `其他：${resolved.otherLabel}` : t));
}

/**
 * Keep projectType for subsidy / stats / old screens.
 * Multi-select priority: 保養-only stays 保養; mixed with 安裝/維修 uses those;
 * 送貨／出貨 only when that is the sole type (or with 其他).
 */
export function deriveProjectTypeFromJobTypes(
  types: string[],
  otherLabel?: string | null,
  fallbackProjectType?: string | null,
): string | undefined {
  const set = new Set(types.filter(isWoJobType));
  if (set.size === 0) return fallbackProjectType || undefined;

  if (set.has("安裝")) return "新裝";
  if (set.has("維修")) return "維修";
  if (set.has("保養") && !set.has("安裝") && !set.has("維修")) return "保養";
  if (set.has("送貨／出貨")) return "送貨／出貨";
  if (set.has("其他")) return (otherLabel || "").trim() || fallbackProjectType || "其他";
  return fallbackProjectType || undefined;
}

export function parseTechnicianNames(technicians: string | null | undefined): string[] {
  if (!technicians) return [];
  try {
    const parsed = JSON.parse(technicians);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v ?? "").trim()).filter(Boolean);
    }
  } catch {
    /* plain string */
  }
  return String(technicians).split(/[,，、/／]/).map((s) => s.trim()).filter(Boolean);
}

export interface ResolvedTechnicians {
  names: string[];
  primary: string;
  extra: string;
}

export function resolveTechnicians(input: {
  technicians?: string | null;
  assignedTo?: string | null;
  assistantTo?: string | null;
  primaryTechnician?: string | null;
  extraTechnician?: string | null;
}): ResolvedTechnicians {
  const fromJson = parseTechnicianNames(input.technicians);
  const extra = (input.extraTechnician ?? "").trim();
  const names: string[] = [];
  const push = (n: string) => {
    const t = n.trim();
    if (t && !names.includes(t)) names.push(t);
  };
  for (const n of fromJson) push(n);
  push(input.assignedTo ?? "");
  push(input.assistantTo ?? "");
  push(extra);

  const primaryCandidate = (input.primaryTechnician ?? "").trim() || (input.assignedTo ?? "").trim();
  const primary = primaryCandidate && names.includes(primaryCandidate)
    ? primaryCandidate
    : (names[0] ?? "");

  return { names, primary, extra };
}

export function buildTechniciansPayload(names: string[], extraTechnician?: string | null): {
  technicians: string | undefined;
  assignedTo: string | undefined;
  assistantTo: string | undefined;
} {
  const extra = (extraTechnician ?? "").trim();
  const all = [...names.map((n) => n.trim()).filter(Boolean)];
  if (extra && !all.includes(extra)) all.push(extra);
  return {
    technicians: all.length > 0 ? JSON.stringify(all) : undefined,
    assignedTo: all[0] || undefined,
    assistantTo: all[1] || undefined,
  };
}

export function resolvePaymentMethods(input: {
  paymentMethods?: unknown;
  paymentMethodOther?: string | null;
  receivablePaymentMethod?: string | null;
  paymentRecordMethods?: Array<string | null | undefined>;
}): { methods: WoPaymentMethod[]; otherLabel: string } {
  const raw = asStringArray(input.paymentMethods);
  const methods: WoPaymentMethod[] = [];
  const push = (m: WoPaymentMethod | null) => {
    if (m && !methods.includes(m)) methods.push(m);
  };
  for (const r of raw) push(normalizePaymentMethod(r));
  const otherLabel = (input.paymentMethodOther ?? "").trim();
  if (methods.length > 0) return { methods, otherLabel };

  push(normalizePaymentMethod(input.receivablePaymentMethod));
  for (const m of input.paymentRecordMethods ?? []) push(normalizePaymentMethod(m));
  return { methods, otherLabel };
}

export function deriveWoPaymentStatus(opts: {
  noCharge?: boolean | null;
  totalAmount: number;
  receivedAmount: number;
  storedStatus?: string | null;
}): WoPaymentStatus {
  if (opts.noCharge) return "無須收款";
  const total = Number.isFinite(opts.totalAmount) ? opts.totalAmount : 0;
  const received = Number.isFinite(opts.receivedAmount) ? opts.receivedAmount : 0;
  if (total <= 0 && received <= 0) {
    const stored = (opts.storedStatus ?? "").trim();
    if (stored === "無須收款") return "無須收款";
    return "未收款";
  }
  if (received <= 0) return "未收款";
  if (received + 0.0001 >= total) return "已收款";
  return "部分收款";
}

export function normalizeInvoiceStatus(value: string | null | undefined): WoInvoiceStatus | "" {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (v === "未開立") return "待開立";
  if ((WO_INVOICE_STATUSES as readonly string[]).includes(v)) return v as WoInvoiceStatus;
  return "";
}

export function remainingBalance(totalAmount: number, receivedAmount: number): number {
  return Math.max(0, Math.round((totalAmount - receivedAmount) * 100) / 100);
}

export function jobTypeHas(resolved: ResolvedJobTypes, type: WoJobType): boolean {
  return resolved.types.includes(type);
}

export const WO_JOB_TYPE_BADGE_COLORS: Record<string, string> = {
  安裝: "bg-purple-100 text-purple-700",
  新裝: "bg-purple-100 text-purple-700",
  保養: "bg-teal-100 text-teal-700",
  維修: "bg-red-100 text-red-700",
  "送貨／出貨": "bg-indigo-100 text-indigo-700",
  其他: "bg-gray-100 text-gray-700",
  遷機: "bg-orange-100 text-orange-700",
  清洗: "bg-sky-100 text-sky-700",
  保固服務: "bg-green-100 text-green-700",
};
