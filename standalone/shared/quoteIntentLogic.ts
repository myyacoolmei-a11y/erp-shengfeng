import { computeQuoteAmounts } from "../client/src/components/pdf/quote-amounts";
import { isQuoteLost, isQuoteWon } from "./quoteStatus";
import type { QuoteIntentGroupConfig } from "./db/schema/quotes";

export const QUOTE_DOCUMENT_TYPES = ["formal", "intent"] as const;
export type QuoteDocumentType = (typeof QUOTE_DOCUMENT_TYPES)[number];

export function normalizeQuoteDocumentType(raw: unknown): QuoteDocumentType {
  return raw === "intent" ? "intent" : "formal";
}

export function quoteDocumentTypeLabel(raw: unknown): string {
  return normalizeQuoteDocumentType(raw) === "intent" ? "意向選擇單" : "正式報價單";
}

export const QUOTE_WORKFLOW_STAGES = [
  "草稿",
  "已傳送",
  "待客戶選擇",
  "待客戶確認",
  "已確認",
  "待安排派工",
  "已派工",
  "已取消",
] as const;

export type QuoteWorkflowStage = (typeof QUOTE_WORKFLOW_STAGES)[number];

export interface IntentCandidateItem {
  id: number;
  productId?: number | null;
  category: string;
  itemName: string;
  brand?: string | null;
  model?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  installFee?: number;
  subtotal?: number;
  notes?: string | null;
  workContent?: string | null;
  optionGroupId?: string | null;
  optionGroupName?: string | null;
  isRequiredGroup?: boolean;
  selectionMode?: "single" | "multiple" | "fixed" | string | null;
  isSelected?: boolean | null;
  sortOrder?: number;
}

export interface NormalizedIntentGroup {
  groupId: string;
  groupName: string;
  selectionMode: "single" | "multiple" | "fixed";
  required: boolean;
  items: IntentCandidateItem[];
}

export function groupIntentQuoteItems(
  items: IntentCandidateItem[],
  groupConfigs?: QuoteIntentGroupConfig[] | null,
): {
  candidateGroups: NormalizedIntentGroup[];
  fixedItems: IntentCandidateItem[];
} {
  const configById = new Map<string, QuoteIntentGroupConfig>();
  for (const cfg of groupConfigs ?? []) {
    if (cfg?.id) configById.set(cfg.id, cfg);
  }

  const groupsMap = new Map<string, NormalizedIntentGroup>();
  const fixedItems: IntentCandidateItem[] = [];

  for (const item of items) {
    const mode = (item.selectionMode ?? "single").trim();
    const rawGroupName = (item.optionGroupName ?? "").trim();
    const rawGroupId = (item.optionGroupId ?? "").trim();

    if (mode === "fixed" || (!rawGroupId && !rawGroupName && mode !== "single" && mode !== "multiple")) {
      fixedItems.push(item);
      continue;
    }

    const groupId = rawGroupId || rawGroupName || "default-group";
    const cfg = configById.get(groupId);
    const groupName = rawGroupName || cfg?.name || "方案選擇";
    const selectionMode: "single" | "multiple" =
      (cfg?.selectionType || mode) === "multiple" ? "multiple" : "single";
    const required = cfg?.required ?? (item.isRequiredGroup !== false);

    const existing = groupsMap.get(groupId) ?? {
      groupId,
      groupName,
      selectionMode,
      required,
      items: [],
    };
    existing.items.push(item);
    groupsMap.set(groupId, existing);
  }

  return {
    candidateGroups: [...groupsMap.values()],
    fixedItems,
  };
}

export interface ValidatedIntentSelectionResult {
  ok: true;
  selectedOptionIds: number[];
  selectedCandidateItems: IntentCandidateItem[];
  formalQuoteItems: Array<{
    productId: number | null;
    category: string;
    itemName: string;
    brand: string | null;
    model: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    installFee: number;
    subtotal: number;
    notes: string | null;
    workContent: string | null;
    optionGroupId: string | null;
    optionGroupName: string | null;
    isRequiredGroup: boolean;
    selectionMode: string;
    isSelected: boolean;
    sortOrder: number;
  }>;
  combinedDescription: string;
  rawSubtotal: number;
  discountAmount: number;
  preTax: number;
  taxAmt: number;
  totalWithTax: number;
  finalAmountBeforeTax: number;
  groupSummary: Array<{
    groupId: string;
    groupName: string;
    selectedItemIds: number[];
  }>;
}

export function validateAndComputeIntentSelection(opts: {
  items: IntentCandidateItem[];
  intentGroups?: QuoteIntentGroupConfig[] | null;
  selectedItemIds: number[];
  discountAmount?: number | null;
  taxType?: string | null;
  baseDescription?: string | null;
}): { ok: false; error: string } | ValidatedIntentSelectionResult {
  const { candidateGroups, fixedItems } = groupIntentQuoteItems(opts.items, opts.intentGroups);
  if (candidateGroups.length === 0 && fixedItems.length === 0) {
    return { ok: false, error: "此意向選擇單尚無可選擇的方案" };
  }

  const selectedSet = new Set(
    (opts.selectedItemIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
  );

  const selectedCandidateItems: IntentCandidateItem[] = [];
  const groupSummary: Array<{ groupId: string; groupName: string; selectedItemIds: number[] }> = [];

  for (const grp of candidateGroups) {
    const picked = grp.items.filter((it) => selectedSet.has(Number(it.id)));
    if (grp.required && picked.length === 0) {
      return {
        ok: false,
        error: `請先完成必選項目：「${grp.groupName}」`,
      };
    }
    if (grp.selectionMode === "single" && picked.length > 1) {
      return {
        ok: false,
        error: `「${grp.groupName}」為單選方案，請只選擇一項`,
      };
    }
    for (const p of picked) {
      selectedCandidateItems.push(p);
    }
    groupSummary.push({
      groupId: grp.groupId,
      groupName: grp.groupName,
      selectedItemIds: picked.map((p) => Number(p.id)),
    });
  }

  if (candidateGroups.length > 0 && selectedCandidateItems.length === 0) {
    return { ok: false, error: "請至少選擇一項方案後再送出" };
  }

  // Only selected candidate items + fixed items enter the formal quotation!
  // Unselected candidates are strictly excluded.
  const formalQuoteItems: ValidatedIntentSelectionResult["formalQuoteItems"] = [];
  const workContentLines: string[] = [];
  if (opts.baseDescription && opts.baseDescription.trim()) {
    workContentLines.push(opts.baseDescription.trim());
  }

  let sortIdx = 0;
  for (const item of [...selectedCandidateItems, ...fixedItems]) {
    const qty = Math.max(0.01, Number(item.quantity) || 1);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const installFee = Math.max(0, Number(item.installFee) || 0);
    const equipSub = Math.round(qty * unitPrice);
    const groupPrefix = item.optionGroupName ? `【${item.optionGroupName}】` : "";
    const fullItemName =
      groupPrefix && !item.itemName.startsWith(`【${item.optionGroupName}】`)
        ? `${groupPrefix}${item.itemName}`
        : item.itemName;

    const noteParts = [item.notes?.trim() || "", item.workContent?.trim() || ""].filter(Boolean);

    formalQuoteItems.push({
      productId: item.productId ?? null,
      category: item.category || "裝新機",
      itemName: fullItemName,
      brand: item.brand ?? null,
      model: item.model ?? null,
      quantity: qty,
      unit: item.unit || "台",
      unitPrice,
      installFee: 0,
      subtotal: equipSub,
      notes: noteParts.join("；") || null,
      workContent: item.workContent ?? null,
      optionGroupId: item.optionGroupId ?? null,
      optionGroupName: item.optionGroupName ?? null,
      isRequiredGroup: item.isRequiredGroup !== false,
      selectionMode: "fixed",
      isSelected: true,
      sortOrder: sortIdx++,
    });

    if (installFee > 0) {
      formalQuoteItems.push({
        productId: null,
        category: "裝新機",
        itemName: `${groupPrefix}${item.brand ? `${item.brand} ` : ""}${item.model || item.itemName} 基本安裝／施工費`,
        brand: item.brand ?? null,
        model: item.model ?? null,
        quantity: 1,
        unit: "式",
        unitPrice: installFee,
        installFee: 0,
        subtotal: Math.round(installFee),
        notes: item.workContent?.trim() || "基本安裝與標準施工",
        workContent: item.workContent ?? null,
        optionGroupId: item.optionGroupId ?? null,
        optionGroupName: item.optionGroupName ?? null,
        isRequiredGroup: true,
        selectionMode: "fixed",
        isSelected: true,
        sortOrder: sortIdx++,
      });
    }

    if (item.workContent && item.workContent.trim()) {
      const line = `${groupPrefix}${item.brand || ""}${item.model ? ` (${item.model})` : ""}：${item.workContent.trim()}`;
      if (!workContentLines.includes(line)) workContentLines.push(line);
    }
  }

  const rawSubtotal = formalQuoteItems.reduce((sum, it) => sum + it.subtotal, 0);
  const discountAmount = Math.max(0, Number(opts.discountAmount ?? 0));
  const taxType = opts.taxType || "未稅";
  const { preTax, taxAmt, total } = computeQuoteAmounts(rawSubtotal, discountAmount, taxType);

  return {
    ok: true,
    selectedOptionIds: selectedCandidateItems.map((it) => Number(it.id)),
    selectedCandidateItems,
    formalQuoteItems,
    combinedDescription: workContentLines.join("\n"),
    rawSubtotal,
    discountAmount,
    preTax,
    taxAmt,
    totalWithTax: total,
    finalAmountBeforeTax: Math.max(0, rawSubtotal - discountAmount),
    groupSummary,
  };
}

export function deriveQuoteWorkflowStage(
  quote: {
    status?: string | null;
    workflowStage?: string | null;
    documentType?: string | null;
    customerSelectedAt?: string | Date | null;
    customerConfirmedAt?: string | Date | null;
    convertedFormalQuoteId?: number | null;
    workOrderId?: number | null;
    dispatchStatus?: string | null;
  },
  workOrder?: {
    id?: number | null;
    status?: string | null;
    scheduledDate?: string | null;
    assignedTo?: string | null;
  } | null,
): QuoteWorkflowStage {
  if (isQuoteLost(quote.status) || quote.workflowStage === "已取消") {
    return "已取消";
  }

  const docType = normalizeQuoteDocumentType(quote.documentType);

  if (docType === "intent") {
    if (quote.customerSelectedAt || quote.convertedFormalQuoteId) {
      return "已確認";
    }
    if (quote.workflowStage === "草稿") return "草稿";
    if (quote.workflowStage === "已傳送") return "已傳送";
    return "待客戶選擇";
  }

  const hasWo = Boolean(workOrder?.id || (quote.workOrderId && Number(quote.workOrderId) > 0));
  if (hasWo) {
    const woScheduled = Boolean(workOrder?.scheduledDate || workOrder?.assignedTo);
    const woStatus = (workOrder?.status ?? "").trim();
    if (
      woScheduled ||
      woStatus === "施工中" ||
      woStatus === "進行中" ||
      woStatus === "已完成" ||
      woStatus === "已結案"
    ) {
      return "已派工";
    }
    return "待安排派工";
  }

  if (quote.customerConfirmedAt || isQuoteWon(quote.status)) {
    return "已確認";
  }

  if (quote.workflowStage === "草稿") return "草稿";
  if (quote.workflowStage === "已傳送") return "已傳送";
  return "待客戶確認";
}
