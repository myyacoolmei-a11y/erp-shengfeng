import React, { useEffect, useMemo, useRef, useState } from "react";
import { useListProducts } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, MapPin, Plus, X } from "lucide-react";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { stripQuotePricingFromNotes, categoryToProjectType, deriveQuoteCustomer } from "../../../shared/workOrderNotes.ts";
import { DEFAULT_AI_REMINDER_SCENARIO_IDS, type AiReminderRuleSource } from "@/lib/aiWorkReminderSettings";
import { WorkOrderAiReminderSection } from "@/components/work-orders/WorkOrderAiReminderSection";
import {
  WO_JOB_TYPE_OPTIONS,
  WO_PAYMENT_METHOD_OPTIONS,
  WO_INVOICE_STATUSES,
  deriveProjectTypeFromJobTypes,
  deriveWoPaymentStatus,
  remainingBalance,
  resolveJobTypes,
  buildTechniciansPayload,
} from "../../../shared/workOrderDispatch.ts";

export const WO_STATUSES = ["待派工", "待施工", "施工中", "異常／暫停", "已完成", "已結案"];
export const WO_PROJECT_TYPES = ["新裝", "維修", "保養", "遷機", "清洗", "保固服務"];
export const WO_ELEVATOR_OPTIONS = ["有電梯", "無電梯"];
/** Default status for new work orders */
export const WO_DEFAULT_STATUS = "待施工";

export interface EquipmentItemForm {
  productId?: number;
  quoteItemId?: number;
  category: string;
  itemName: string;
  brand: string;
  model: string;
  quantity: number | undefined;
  unit: string;
  notes: string;
  indoorUnits: number | undefined;
  outdoorUnits: number | undefined;
  floor: string;
  fromQuote?: boolean;
}

export function defaultEquipmentItem(): EquipmentItemForm {
  return {
    category: "",
    itemName: "",
    brand: "",
    model: "",
    quantity: undefined,
    unit: "台",
    notes: "",
    indoorUnits: undefined,
    outdoorUnits: undefined,
    floor: "",
  };
}

/** Map API work order (with equipmentItems or legacy flat fields) to form equipment list */
export function equipmentItemsFromOrder(o: {
  equipmentItems?: Array<{
    productId?: number | null;
    quoteItemId?: number | null;
    category?: string | null;
    itemName?: string | null;
    brand?: string | null;
    model?: string | null;
    quantity?: number | null;
    unit?: string | null;
    notes?: string | null;
    indoorUnits?: number | null;
    outdoorUnits?: number | null;
    floor?: string | null;
  }>;
  acBrand?: string | null;
  modelNumber?: string | null;
  quantity?: number | null;
  indoorUnits?: number | null;
  outdoorUnits?: number | null;
  floorLevel?: string | null;
}): EquipmentItemForm[] {
  const items = o.equipmentItems ?? [];
  if (items.length > 0) {
    return items.map(it => ({
      productId: it.productId ?? undefined,
      quoteItemId: it.quoteItemId ?? undefined,
      category: it.category ?? "",
      itemName: it.itemName ?? "",
      brand: it.brand ?? "",
      model: it.model ?? "",
      quantity: it.quantity ?? undefined,
      unit: it.unit ?? "台",
      notes: it.notes ?? "",
      indoorUnits: it.indoorUnits ?? undefined,
      outdoorUnits: it.outdoorUnits ?? undefined,
      floor: it.floor ?? "",
      fromQuote: !!(it.category || it.itemName),
    }));
  }

  const hasLegacy = !!(
    o.acBrand ||
    o.modelNumber ||
    o.quantity != null ||
    o.indoorUnits != null ||
    o.outdoorUnits != null ||
    o.floorLevel
  );
  if (hasLegacy) {
    return [{
      category: "",
      itemName: o.modelNumber ?? "",
      brand: o.acBrand ?? "",
      model: o.modelNumber ?? "",
      quantity: o.quantity ?? undefined,
      unit: "台",
      notes: "",
      indoorUnits: o.indoorUnits ?? undefined,
      outdoorUnits: o.outdoorUnits ?? undefined,
      floor: o.floorLevel ?? "",
    }];
  }

  return [defaultEquipmentItem()];
}

export type CustomerMode = "existing" | "temporary" | null;

export function makeEmpty() {
  return {
    customerMode: null as CustomerMode,
    quoteId: undefined as number | undefined,
    customerId: 0,
    customerName: "",
    title: "",
    status: "待施工",
    contactPerson: "",
    mobilePhone: "",
    telephone: "",
    installAddress: "",
    scheduledDate: "",
    scheduledTime: "",
    completedDate: "",
    technicians: [] as string[],
    primaryTechnician: "",
    extraTechnician: "",
    jobTypes: [] as string[],
    jobTypeOther: "",
    projectType: "",
    paymentMethods: [] as string[],
    paymentMethodOther: "",
    invoiceStatus: "",
    billingTotalAmount: "" as string,
    billingNotes: "",
    noCharge: false,
    currentPaymentAmount: "",
    currentPaymentDate: new Date().toISOString().slice(0, 10),
    currentPaymentMethod: "",
    currentPaymentNotes: "",
    receivedAmount: 0,
    wholesaleOrderId: undefined as number | undefined,
    parentWorkOrderId: undefined as number | undefined,
    equipmentItems: [defaultEquipmentItem()] as EquipmentItemForm[],
    hasElevator: "",
    description: "",
    notes: "",
    estimatedWorkMinutes: 60 as number | undefined,
    aiReminderEnabled: false,
    aiReminderScenarioIds: [...DEFAULT_AI_REMINDER_SCENARIO_IDS],
    aiNotifySupervisorOnDelay: false,
    aiReminderRuleSource: "company_default" as AiReminderRuleSource,
    aiReminderCustomConfig: { scenarios: {} },
  };
}

export type WOForm = ReturnType<typeof makeEmpty>;

export function hasWorkOrderCustomer(f: WOForm): boolean {
  // Work orders require a formal customer binding for AR / billing.
  if (f.customerMode === "existing" || f.customerId > 0) return f.customerId > 0;
  if (f.customerMode === "temporary") {
    return f.customerName.trim().length > 0 && f.mobilePhone.trim().length > 0;
  }
  return f.customerId > 0 || (f.customerName.trim().length > 0 && f.mobilePhone.trim().length > 0);
}

export function hasJobTypeSelection(f: WOForm): boolean {
  if (f.jobTypes.length > 0) {
    if (f.jobTypes.includes("其他") && !f.jobTypeOther.trim()) return false;
    return true;
  }
  return !!f.projectType;
}

export function buildPayload(f: WOForm) {
  const projectType = deriveProjectTypeFromJobTypes(f.jobTypes, f.jobTypeOther, f.projectType) || f.projectType || undefined;
  const title = f.title.trim() || `${projectType || "派工"} 派工單`;
  const isLinked = (f.customerMode === "existing" || f.customerMode == null) && f.customerId > 0;
  // Snapshot name/phone/address even when linked — display + repair orphans.
  const snapshotName = (f.customerName || "").trim();
  const techPayload = buildTechniciansPayload(f.technicians, f.extraTechnician);
  const primary = f.primaryTechnician.trim() || techPayload.assignedTo;
  const billingTotal = f.noCharge ? 0 : (f.billingTotalAmount.trim() === "" ? undefined : parseFloat(f.billingTotalAmount));
  const currentPay = f.currentPaymentAmount.trim() === "" ? undefined : parseFloat(f.currentPaymentAmount);
  return {
    customerId: isLinked ? f.customerId : null,
    customerName: isLinked
      ? (snapshotName || undefined)
      : (snapshotName || undefined),
    quoteId: f.quoteId,
    title,
    status: f.status,
    contactPerson: f.contactPerson || undefined,
    mobilePhone: f.mobilePhone || undefined,
    telephone: f.telephone || undefined,
    installAddress: f.installAddress || undefined,
    scheduledDate: f.scheduledDate || undefined,
    scheduledTime: f.scheduledTime || undefined,
    completedDate: f.completedDate || undefined,
    assignedTo: primary || techPayload.assignedTo,
    assistantTo: techPayload.assistantTo,
    technicians: techPayload.technicians,
    primaryTechnician: primary || undefined,
    extraTechnician: f.extraTechnician.trim() || undefined,
    jobTypes: f.jobTypes.length > 0 ? f.jobTypes : undefined,
    jobTypeOther: f.jobTypes.includes("其他") ? (f.jobTypeOther.trim() || undefined) : undefined,
    projectType,
    paymentMethods: f.paymentMethods.length > 0 ? f.paymentMethods : undefined,
    paymentMethodOther: f.paymentMethods.includes("其他") ? (f.paymentMethodOther.trim() || undefined) : undefined,
    invoiceStatus: f.invoiceStatus || undefined,
    billingTotalAmount: billingTotal != null && Number.isFinite(billingTotal) ? billingTotal : undefined,
    billingNotes: f.billingNotes.trim() || undefined,
    noCharge: f.noCharge,
    currentPaymentAmount: currentPay != null && Number.isFinite(currentPay) && currentPay > 0 ? currentPay : undefined,
    currentPaymentMethod: f.currentPaymentMethod || undefined,
    currentPaymentDate: f.currentPaymentDate || undefined,
    currentPaymentNotes: f.currentPaymentNotes.trim() || undefined,
    wholesaleOrderId: f.wholesaleOrderId,
    parentWorkOrderId: f.parentWorkOrderId,
    hasElevator: f.hasElevator || undefined,
    description: f.description || undefined,
    notes: f.notes || undefined,
    estimatedWorkMinutes: f.estimatedWorkMinutes,
    aiReminderEnabled: f.aiReminderEnabled,
    aiReminderScenarioIds: f.aiReminderScenarioIds,
    aiNotifySupervisorOnDelay: f.aiNotifySupervisorOnDelay,
    aiReminderRuleSource: f.aiReminderRuleSource,
    aiReminderCustomConfig: f.aiReminderRuleSource === "custom" ? f.aiReminderCustomConfig : undefined,
    equipmentItems: f.equipmentItems.map((item, idx) => ({
      productId: item.productId,
      quoteItemId: item.quoteItemId,
      category: item.category || undefined,
      itemName: item.itemName || undefined,
      brand: item.brand || undefined,
      model: item.model || undefined,
      quantity: item.quantity,
      unit: item.unit || undefined,
      notes: item.notes || undefined,
      indoorUnits: item.indoorUnits,
      outdoorUnits: item.outdoorUnits,
      floor: item.floor || undefined,
      sortOrder: idx,
    })),
  };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 pb-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</p>
      <Separator className="mt-1" />
    </div>
  );
}

function EquipmentItemCard({
  item,
  index,
  products,
  onChange,
  onDelete,
  canDelete,
}: {
  item: EquipmentItemForm;
  index: number;
  products: any[];
  onChange: (updated: EquipmentItemForm) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelPickerOpen) return;
    function onDocDown(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setModelPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [modelPickerOpen]);

  const filteredProducts = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    const list = products ?? [];
    if (!q) return list.slice(0, 40);
    return list
      .filter((p: any) => {
        const hay = [p.brand, p.name, p.model, p.category, p.productNumber]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [products, modelQuery]);

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">設備 {index + 1}</span>
        {canDelete && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onDelete}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {item.fromQuote && item.itemName ? (
        <div className="text-sm space-y-1 bg-muted/30 rounded-md p-2">
          {item.brand && <p><span className="text-muted-foreground">品牌：</span>{item.brand}</p>}
          <p><span className="text-muted-foreground">品項：</span>{item.itemName}</p>
          {item.model && <p><span className="text-muted-foreground">型號：</span>{item.model}</p>}
          <p><span className="text-muted-foreground">數量：</span>{item.quantity ?? "—"} {item.unit}</p>
          {item.notes && <p><span className="text-muted-foreground">備註：</span>{item.notes}</p>}
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">冷氣品牌</Label>
          <Input
            className="h-8 text-sm"
            placeholder="大金、日立…"
            value={item.brand}
            onChange={e => onChange({ ...item, brand: e.target.value, productId: undefined })}
          />
        </div>
        <div className="space-y-1 relative" ref={pickerRef}>
          <Label className="text-xs">型號</Label>
          <Input
            className="h-8 text-sm"
            placeholder="搜尋或輸入型號"
            value={item.model}
            onFocus={() => {
              setModelQuery(item.model || "");
              setModelPickerOpen(true);
            }}
            onChange={e => {
              const v = e.target.value;
              setModelQuery(v);
              setModelPickerOpen(true);
              onChange({ ...item, model: v, productId: undefined });
            }}
            autoComplete="off"
          />
          {modelPickerOpen && (
            <div
              className="absolute z-[200] left-0 right-0 top-full mt-1 max-h-[min(40vh,280px)] overflow-y-auto overscroll-contain touch-pan-y rounded-md border bg-popover text-popover-foreground shadow-md"
              onWheel={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  無符合商品，可直接手動輸入型號
                </p>
              ) : (
                filteredProducts.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors border-b last:border-b-0"
                    onClick={() => {
                      onChange({
                        ...item,
                        productId: p.id,
                        brand: p.brand ?? "",
                        model: p.model ?? "",
                      });
                      setModelQuery(p.model ?? "");
                      setModelPickerOpen(false);
                    }}
                  >
                    <span className="font-medium">
                      {[p.brand, p.model].filter(Boolean).join("｜") || p.name || `#${p.id}`}
                    </span>
                    {p.name && (
                      <span className="text-muted-foreground ml-1">（{p.name}）</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">數量（台）</Label>
          <Input
            className="h-8 text-sm"
            type="number"
            min="0"
            placeholder="0"
            value={item.quantity ?? ""}
            onChange={e => onChange({ ...item, quantity: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">室內機（台）</Label>
          <Input
            className="h-8 text-sm"
            type="number"
            min="0"
            placeholder="0"
            value={item.indoorUnits ?? ""}
            onChange={e => onChange({ ...item, indoorUnits: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">室外機（台）</Label>
          <Input
            className="h-8 text-sm"
            type="number"
            min="0"
            placeholder="0"
            value={item.outdoorUnits ?? ""}
            onChange={e => onChange({ ...item, outdoorUnits: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">樓層</Label>
          <Input
            className="h-8 text-sm"
            placeholder="例：3樓"
            value={item.floor}
            onChange={e => onChange({ ...item, floor: e.target.value })}
          />
        </div>
      </div>
      )}
    </div>
  );
}

interface WorkOrderFormFieldsProps {
  form: WOForm;
  setForm: React.Dispatch<React.SetStateAction<WOForm>>;
  customers?: any[];
  technicianOptions: any[];
  quotes?: any[];
  showQuoteSelector?: boolean;
  customerDisabled?: boolean;
  workOrderNumber?: string | null;
  customerDisplayName?: string;
}

export function WorkOrderFormFields({
  form,
  setForm,
  customers = [],
  technicianOptions,
  quotes = [],
  showQuoteSelector = true,
  customerDisabled = false,
  workOrderNumber,
  customerDisplayName,
}: WorkOrderFormFieldsProps) {
  const [quotePickerOpen, setQuotePickerOpen] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState("");

  const { data: catalogProducts } = useListProducts({
    usageType: "engineering_quote",
    isActive: "true",
  });
  const products = catalogProducts ?? [];

  const selectedQuote = form.quoteId ? quotes.find(q => q.id === form.quoteId) : undefined;

  const filteredQuotes = useMemo(() => {
    const q = quoteSearch.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((item: any) => {
      const hay = [item.title, item.customerName, item.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [quotes, quoteSearch]);

  const linkedCustomer = form.customerId > 0
    ? customers.find((x: any) => x.id === form.customerId)
    : undefined;

  const selectorValue: CustomerSelectorValue | null = useMemo(() => {
    if (form.customerId > 0) {
      return {
        type: "linked",
        customerId: form.customerId,
        name: linkedCustomer?.name ?? selectedQuote?.customerName ?? `客戶 #${form.customerId}`,
        contactPerson: form.contactPerson || linkedCustomer?.contactPerson || selectedQuote?.contactPerson || "",
        phone: form.telephone || linkedCustomer?.phone || selectedQuote?.customerPhone || "",
        mobile: linkedCustomer?.mobile || form.mobilePhone || "",
        address: form.installAddress || linkedCustomer?.address || selectedQuote?.address || "",
        taxId: linkedCustomer?.taxId || "",
      };
    }
    const tempName = form.customerName || selectedQuote?.customerName || "";
    if (tempName) {
      return {
        type: "temp",
        customerId: null,
        name: tempName,
        contactPerson: form.contactPerson || selectedQuote?.contactPerson || "",
        phone: form.telephone || selectedQuote?.customerPhone || "",
        mobile: form.mobilePhone || "",
        address: form.installAddress || selectedQuote?.address || "",
        taxId: "",
      };
    }
    return null;
  }, [form, linkedCustomer, selectedQuote]);

  /** Bound from quote with formal customer — show card + 更換客戶 (not fully locked). */
  const boundFromQuote = !!(form.quoteId && form.customerId > 0 && !customerDisabled);

  function handleSelectorChange(v: CustomerSelectorValue | null) {
    if (!v) {
      setForm(f => ({ ...f, customerMode: null, customerId: 0, customerName: "" }));
      return;
    }
    if (v.type === "temp") {
      setForm(f => ({
        ...f,
        customerMode: "temporary",
        customerId: 0,
        customerName: v.name,
        contactPerson: v.contactPerson || f.contactPerson || "",
        mobilePhone: v.mobile || f.mobilePhone || "",
        telephone: v.phone || f.telephone || "",
        installAddress: v.address || f.installAddress || "",
      }));
      return;
    }
    setForm(f => ({
      ...f,
      customerMode: "existing",
      customerId: v.customerId ?? 0,
      // Keep snapshot fields for display / AR binding
      customerName: v.name || f.customerName || "",
      contactPerson: v.contactPerson || f.contactPerson || "",
      mobilePhone: v.mobile || f.mobilePhone || "",
      telephone: v.phone || f.telephone || "",
      installAddress: v.address || f.installAddress || "",
    }));
  }

  function handleCustomerModeChange(mode: "existing" | "temporary" | null) {
    setForm(f => ({
      ...f,
      customerMode: mode,
      ...(mode === "temporary"
        ? { customerId: 0 }
        : mode === "existing"
          ? { customerName: "" }
          : { customerId: 0, customerName: "" }),
    }));
  }

  function handleQuoteChange(v: string) {
    if (!v || v === "__none__") {
      setForm(f => ({ ...f, quoteId: undefined }));
      return;
    }
    const qid = parseInt(v, 10);
    const quote = quotes.find(q => q.id === qid);
    if (!quote) return;
    // Same resolution rules as buildWorkOrderFormFromQuote(): an official
    // customerId on the quote must be preserved, and customerMode has to be
    // set explicitly, otherwise buildPayload() treats the linked customer as
    // unlinked and sends customerId: null + customerName: "" (HTTP 400).
    const { customerId: quoteCustomerId, customerName: quoteCustomerName, customerPhone: quoteCustomerPhone } =
      deriveQuoteCustomer(quote);
    const linkedId = quoteCustomerId ?? 0;
    const cust = linkedId > 0 ? customers.find((c: any) => c.id === linkedId) : undefined;
    const salesLine = quote.salesRepName ? `負責業務：${quote.salesRepName}` : "";
    const notesParts = [quote.notes, salesLine].filter(Boolean);
    setForm(f => ({
      ...f,
      quoteId: qid,
      customerMode: linkedId > 0 ? "existing" : f.customerMode,
      customerId: linkedId,
      customerName: quoteCustomerName || cust?.name || f.customerName || "",
      title: quote.title || f.title,
      contactPerson: quote.contactPerson || cust?.contactPerson || f.contactPerson || "",
      mobilePhone: quoteCustomerPhone || cust?.mobile || f.mobilePhone || "",
      telephone: f.telephone || cust?.phone || "",
      installAddress: quote.address || cust?.address || f.installAddress || "",
      projectType: quote.items?.[0]?.category
        ? categoryToProjectType(quote.items[0].category)
        : f.projectType,
      jobTypes: (() => {
        const pt = quote.items?.[0]?.category
          ? categoryToProjectType(quote.items[0].category)
          : f.projectType;
        return resolveJobTypes({ projectType: pt, jobTypes: f.jobTypes }).types;
      })(),
      jobTypeOther: (() => {
        const pt = quote.items?.[0]?.category
          ? categoryToProjectType(quote.items[0].category)
          : f.projectType;
        return resolveJobTypes({ projectType: pt, jobTypes: f.jobTypes }).otherLabel || f.jobTypeOther;
      })(),
      description: quote.description || f.description || "",
      notes: stripQuotePricingFromNotes(notesParts.join("\n\n")) || f.notes,
      equipmentItems: (quote.items ?? []).length > 0
        ? (quote.items as any[]).map((it: any) => ({
            productId: it.productId ?? undefined,
            quoteItemId: it.id ?? undefined,
            category: it.category ?? "",
            itemName: it.itemName ?? "",
            brand: it.brand ?? "",
            model: it.model ?? "",
            quantity: Number(it.quantity ?? 1),
            unit: it.unit ?? "台",
            notes: it.notes ?? "",
            indoorUnits: undefined,
            outdoorUnits: undefined,
            floor: "",
            fromQuote: true,
          }))
        : f.equipmentItems,
    }));
  }

  function toggleTechnician(name: string) {
    setForm(f => {
      const next = f.technicians.includes(name)
        ? f.technicians.filter(n => n !== name)
        : [...f.technicians, name];
      const primary = next.includes(f.primaryTechnician) ? f.primaryTechnician : (next[0] ?? "");
      return { ...f, technicians: next, primaryTechnician: primary };
    });
  }

  function toggleJobType(type: string) {
    setForm(f => {
      const next = f.jobTypes.includes(type)
        ? f.jobTypes.filter(t => t !== type)
        : [...f.jobTypes, type];
      const jobTypeOther = type === "其他" && !next.includes("其他") ? "" : f.jobTypeOther;
      return {
        ...f,
        jobTypes: next,
        jobTypeOther,
        projectType: deriveProjectTypeFromJobTypes(next, jobTypeOther, f.projectType) || f.projectType,
      };
    });
  }

  function togglePaymentMethod(method: string) {
    setForm(f => ({
      ...f,
      paymentMethods: f.paymentMethods.includes(method)
        ? f.paymentMethods.filter(m => m !== method)
        : [...f.paymentMethods, method],
    }));
  }

  function addEquipmentItem() {
    setForm(f => ({ ...f, equipmentItems: [...f.equipmentItems, defaultEquipmentItem()] }));
  }

  function updateEquipmentItem(idx: number, updated: EquipmentItemForm) {
    setForm(f => ({
      ...f,
      equipmentItems: f.equipmentItems.map((item, i) => (i === idx ? updated : item)),
    }));
  }

  function removeEquipmentItem(idx: number) {
    setForm(f => ({
      ...f,
      equipmentItems: f.equipmentItems.filter((_, i) => i !== idx),
    }));
  }

  return (
    <div className="space-y-4">

      {/* ── 對應報價單（Popover 獨立捲動，避免 Modal 搶滾輪）── */}
      {showQuoteSelector && (
        <>
          <SectionHeading>對應報價單（選填）</SectionHeading>
          <div className="space-y-1">
            <Label>報價單</Label>
            <Popover open={quotePickerOpen} onOpenChange={setQuotePickerOpen} modal>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={quotePickerOpen}
                  className="h-9 w-full justify-between font-normal"
                >
                  <span className="truncate text-left">
                    {selectedQuote
                      ? `${selectedQuote.title}${selectedQuote.customerName ? ` — ${selectedQuote.customerName}` : ""}`
                      : "選擇報價單（可不填）"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="z-[200] w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
                onOpenAutoFocus={e => e.preventDefault()}
                onWheel={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
              >
                <div className="border-b p-2">
                  <Input
                    className="h-8 text-sm"
                    placeholder="搜尋報價單…"
                    value={quoteSearch}
                    onChange={e => setQuoteSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div
                  className="max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain touch-pan-y"
                  onWheel={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/60 border-b"
                    onClick={() => {
                      handleQuoteChange("__none__");
                      setQuotePickerOpen(false);
                      setQuoteSearch("");
                    }}
                  >
                    （不連結報價單）
                  </button>
                  {filteredQuotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">找不到符合的報價單</p>
                  ) : (
                    filteredQuotes.map((q: any) => (
                      <button
                        key={q.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-muted/60 border-b last:border-b-0 ${
                          form.quoteId === q.id ? "bg-muted/40 font-medium" : ""
                        }`}
                        onClick={() => {
                          handleQuoteChange(String(q.id));
                          setQuotePickerOpen(false);
                          setQuoteSearch("");
                        }}
                      >
                        {q.title}{q.customerName ? ` — ${q.customerName}` : ""}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {form.quoteId && form.customerId > 0 && (
              <p className="text-xs text-muted-foreground">已自動帶入報價單客戶（可更換）</p>
            )}
          </div>
        </>
      )}

      {/* ── 客戶資訊 ── */}
      <SectionHeading>客戶資訊</SectionHeading>

      <div className="space-y-1.5">
        <Label>
          客戶{!customerDisabled && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <CustomerSelector
          value={selectorValue}
          onChange={handleSelectorChange}
          onCustomerModeChange={handleCustomerModeChange}
          modal={false}
          disabled={customerDisabled}
          boundLabel={boundFromQuote ? "來自報價單" : undefined}
          allowTemp={false}
          showAddressPicker
          onAddressSelect={(_, address) => setForm(f => ({ ...f, installAddress: address }))}
          selectedAddressId={null}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {linkedCustomer && (
          <div className="space-y-1">
            <Label>客戶手機</Label>
            <Input
              readOnly
              disabled
              className="bg-muted/50"
              value={linkedCustomer.mobile || "—"}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label>現場聯絡人</Label>
          <Input placeholder="現場聯絡人姓名" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>現場聯絡人電話</Label>
          <Input type="tel" placeholder="0912-345-678" value={form.mobilePhone} onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>公司電話<span className="text-muted-foreground font-normal">（選填）</span></Label>
          <Input type="tel" placeholder="(02) 1234-5678" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>施工地址</Label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="施工地址"
              value={form.installAddress}
              onChange={e => setForm(f => ({ ...f, installAddress: e.target.value }))}
            />
            {form.installAddress && (
              <Button type="button" variant="outline" size="icon" asChild title="Google Maps 導航">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.installAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── 施工資訊 ── */}
      <SectionHeading>施工資訊</SectionHeading>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>狀態</Label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{WO_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>施工日期</Label>
          <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
          {!form.scheduledDate && (
            <p className="text-xs text-amber-700">目前：待安排</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>施工時間</Label>
          <Input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>完成日期</Label>
          <Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label>工單類型 <span className="text-destructive">*</span></Label>
          <div className="border rounded-md p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {WO_JOB_TYPE_OPTIONS.map(type => (
              <div key={type} className="flex items-center gap-2">
                <Checkbox
                  id={`job-${type}`}
                  checked={form.jobTypes.includes(type)}
                  onCheckedChange={() => toggleJobType(type)}
                />
                <label htmlFor={`job-${type}`} className="text-sm cursor-pointer">{type}</label>
              </div>
            ))}
          </div>
          {form.jobTypes.includes("其他") && (
            <Input
              className="mt-1"
              placeholder="其他類型名稱，例如：遷機"
              value={form.jobTypeOther}
              onChange={e => setForm(f => ({
                ...f,
                jobTypeOther: e.target.value,
                projectType: deriveProjectTypeFromJobTypes(f.jobTypes, e.target.value, f.projectType) || f.projectType,
              }))}
            />
          )}
          <p className="text-xs text-muted-foreground">可複選。舊工單若僅有工程類型也會自動對應顯示。</p>
        </div>
        <div className="space-y-1">
          <Label>工程名稱</Label>
          <Input
            placeholder={`${form.projectType || "派工"} 派工單`}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </div>
      </div>

      {/* ── 施工師傅 ── */}
      <div className="space-y-1">
        <Label>施工師傅</Label>
        {technicianOptions.length > 0 ? (
          <div className="border rounded-md p-2 max-h-44 overflow-y-auto space-y-1.5">
            {technicianOptions.map(emp => (
              <div key={emp.id} className="flex items-center gap-2">
                <Checkbox
                  id={`tech-${emp.id}`}
                  checked={form.technicians.includes(emp.name)}
                  onCheckedChange={() => toggleTechnician(emp.name)}
                />
                <label htmlFor={`tech-${emp.id}`} className="text-sm cursor-pointer flex-1">{emp.name}</label>
                {form.technicians.includes(emp.name) && (
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <input
                      type="radio"
                      name="primary-tech"
                      checked={form.primaryTechnician === emp.name}
                      onChange={() => setForm(f => ({ ...f, primaryTechnician: emp.name }))}
                    />
                    主要負責
                  </label>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground border rounded-md p-2">尚無在職技師資料（請至員工管理新增職位為「師傅技師」的員工）</p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="extra-tech"
            checked={!!form.extraTechnician}
            onCheckedChange={(v) => setForm(f => ({ ...f, extraTechnician: v ? (f.extraTechnician || " ") : "" }))}
          />
          <Label htmlFor="extra-tech" className="text-sm font-normal">其他外包師傅</Label>
          <Input
            className="h-8 flex-1"
            placeholder="手動輸入姓名"
            value={form.extraTechnician}
            onChange={e => setForm(f => ({ ...f, extraTechnician: e.target.value }))}
          />
        </div>
        {(form.technicians.length > 0 || form.extraTechnician.trim()) && (
          <p className="text-xs text-muted-foreground">
            已選：{[...form.technicians, form.extraTechnician.trim()].filter(Boolean).join("、")}
            {form.primaryTechnician ? `　主要負責人：${form.primaryTechnician}` : ""}
          </p>
        )}
      </div>

      <WorkOrderAiReminderSection
        form={form}
        setForm={setForm}
        workOrderNumber={workOrderNumber}
        customerDisplayName={customerDisplayName}
      />

      {/* ── 冷氣設備 ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b pb-1">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">冷氣設備</h3>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={addEquipmentItem}>
            <Plus className="h-3.5 w-3.5 mr-1" />新增設備
          </Button>
        </div>
        <div className="space-y-2">
          {form.equipmentItems.map((item, idx) => (
            <EquipmentItemCard
              key={idx}
              item={item}
              index={idx}
              products={products}
              canDelete={form.equipmentItems.length > 1}
              onChange={updated => updateEquipmentItem(idx, updated)}
              onDelete={() => removeEquipmentItem(idx)}
            />
          ))}
        </div>
        <div className="space-y-1">
          <Label>電梯</Label>
          <Select value={form.hasElevator} onValueChange={v => setForm(f => ({ ...f, hasElevator: v }))}>
            <SelectTrigger className="max-w-xs"><SelectValue placeholder="選擇" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">（未填）</SelectItem>
              {WO_ELEVATOR_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── 施工說明 ── */}
      <SectionHeading>施工說明</SectionHeading>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>施工內容</Label>
          <Textarea
            rows={3}
            placeholder="描述施工內容、要求…"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>施工備註</Label>
          <Textarea
            rows={2}
            placeholder="停車、進出限制、注意事項…"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>

      {/* ── 工程收費／收款 ── */}
      <SectionHeading>工程收費與收款</SectionHeading>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="no-charge"
            checked={form.noCharge}
            onCheckedChange={(v) => setForm(f => ({ ...f, noCharge: Boolean(v) }))}
          />
          <Label htmlFor="no-charge" className="text-sm font-normal">無須收款</Label>
        </div>
        <div className="space-y-1">
          <Label>收款方式（可複選）</Label>
          <div className="border rounded-md p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {WO_PAYMENT_METHOD_OPTIONS.map(method => (
              <div key={method} className="flex items-center gap-2">
                <Checkbox
                  id={`pay-${method}`}
                  checked={form.paymentMethods.includes(method)}
                  onCheckedChange={() => togglePaymentMethod(method)}
                  disabled={form.noCharge}
                />
                <label htmlFor={`pay-${method}`} className="text-sm cursor-pointer">{method}</label>
              </div>
            ))}
          </div>
          {form.paymentMethods.includes("其他") && (
            <Input
              placeholder="其他收款方式"
              value={form.paymentMethodOther}
              onChange={e => setForm(f => ({ ...f, paymentMethodOther: e.target.value }))}
            />
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>應收總金額</Label>
            <Input
              type="number"
              min={0}
              disabled={form.noCharge}
              value={form.billingTotalAmount}
              onChange={e => setForm(f => ({ ...f, billingTotalAmount: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>累計已收</Label>
            <Input readOnly value={form.receivedAmount ? String(form.receivedAmount) : "0"} />
          </div>
          <div className="space-y-1">
            <Label>未收餘額</Label>
            <Input
              readOnly
              value={String(remainingBalance(parseFloat(form.billingTotalAmount || "0") || 0, form.receivedAmount || 0))}
            />
          </div>
          <div className="space-y-1">
            <Label>本次收款金額</Label>
            <Input
              type="number"
              min={0}
              disabled={form.noCharge}
              value={form.currentPaymentAmount}
              onChange={e => setForm(f => ({ ...f, currentPaymentAmount: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>收款日期</Label>
            <Input
              type="date"
              disabled={form.noCharge}
              value={form.currentPaymentDate}
              onChange={e => setForm(f => ({ ...f, currentPaymentDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>本次收款方式</Label>
            <Select
              value={form.currentPaymentMethod}
              onValueChange={v => setForm(f => ({ ...f, currentPaymentMethod: v }))}
              disabled={form.noCharge}
            >
              <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
              <SelectContent>
                {WO_PAYMENT_METHOD_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>收款備註／客戶備註</Label>
          <Textarea
            rows={2}
            value={form.billingNotes}
            onChange={e => setForm(f => ({ ...f, billingNotes: e.target.value }))}
            placeholder="訂金／尾款說明…"
          />
        </div>
        <div className="space-y-1">
          <Label>發票狀態（與支票付款分開）</Label>
          <div className="flex flex-wrap gap-3">
            {WO_INVOICE_STATUSES.map(s => (
              <label key={s} className="text-sm flex items-center gap-1.5">
                <input
                  type="radio"
                  name="invoice-status"
                  checked={form.invoiceStatus === s}
                  onChange={() => setForm(f => ({ ...f, invoiceStatus: s }))}
                />
                {s}
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          收款狀態：{deriveWoPaymentStatus({
            noCharge: form.noCharge,
            totalAmount: parseFloat(form.billingTotalAmount || "0") || 0,
            receivedAmount: form.receivedAmount || 0,
          })}
          （依實際收款紀錄計算，勾選付款方式不會自動變成已收款）
        </p>
      </div>

    </div>
  );
}
