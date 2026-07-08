import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MapPin, Plus, X } from "lucide-react";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";

export const WO_STATUSES = ["待施工", "已完成"];
export const WO_PROJECT_TYPES = ["新裝", "維修", "保養", "遷機", "清洗", "保固服務"];
export const WO_ELEVATOR_OPTIONS = ["有電梯", "無電梯"];

export interface EquipmentItemForm {
  productId?: number;
  quoteItemId?: number;
  category: string;
  itemName: string;
  brand: string;
  model: string;
  quantity: number | undefined;
  unit: string;
  unitPrice: number | undefined;
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
    unitPrice: undefined,
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
    unitPrice?: number | null;
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
      unitPrice: it.unitPrice ?? undefined,
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
      unitPrice: undefined,
      notes: "",
      indoorUnits: o.indoorUnits ?? undefined,
      outdoorUnits: o.outdoorUnits ?? undefined,
      floor: o.floorLevel ?? "",
    }];
  }

  return [defaultEquipmentItem()];
}

export function makeEmpty() {
  return {
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
    projectType: "",
    equipmentItems: [defaultEquipmentItem()] as EquipmentItemForm[],
    hasElevator: "",
    description: "",
    notes: "",
  };
}

export type WOForm = ReturnType<typeof makeEmpty>;

export function hasWorkOrderCustomer(f: WOForm): boolean {
  return f.customerId > 0 || f.customerName.trim().length > 0;
}

export function buildPayload(f: WOForm) {
  const title = f.title.trim() || `${f.projectType || "派工"} 派工單`;
  const hasLinkedCustomer = f.customerId > 0;
  return {
    customerId: hasLinkedCustomer ? f.customerId : null,
    customerName: hasLinkedCustomer ? undefined : (f.customerName.trim() || undefined),
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
    technicians: f.technicians.length > 0 ? JSON.stringify(f.technicians) : undefined,
    projectType: f.projectType || undefined,
    hasElevator: f.hasElevator || undefined,
    description: f.description || undefined,
    notes: f.notes || undefined,
    equipmentItems: f.equipmentItems.map((item, idx) => ({
      productId: item.productId,
      quoteItemId: item.quoteItemId,
      category: item.category || undefined,
      itemName: item.itemName || undefined,
      brand: item.brand || undefined,
      model: item.model || undefined,
      quantity: item.quantity,
      unit: item.unit || undefined,
      unitPrice: item.unitPrice,
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
  onChange,
  onDelete,
  canDelete,
}: {
  item: EquipmentItemForm;
  index: number;
  onChange: (updated: EquipmentItemForm) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
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
          <p><span className="text-muted-foreground">類別：</span>{item.category || "—"}</p>
          <p><span className="text-muted-foreground">品項：</span>{item.itemName} {item.brand ? `· ${item.brand}` : ""} {item.model ? `· ${item.model}` : ""}</p>
          <p><span className="text-muted-foreground">數量：</span>{item.quantity ?? "—"} {item.unit}</p>
          {item.unitPrice != null && <p><span className="text-muted-foreground">單價：</span>NT${item.unitPrice.toLocaleString()}</p>}
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
            onChange={e => onChange({ ...item, brand: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">型號</Label>
          <Input
            className="h-8 text-sm"
            placeholder="型號"
            value={item.model}
            onChange={e => onChange({ ...item, model: e.target.value })}
          />
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
}

export function WorkOrderFormFields({
  form,
  setForm,
  customers = [],
  technicianOptions,
  quotes = [],
  showQuoteSelector = true,
  customerDisabled = false,
}: WorkOrderFormFieldsProps) {

  const selectedQuote = form.quoteId ? quotes.find(q => q.id === form.quoteId) : undefined;

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

  const customerLockedFromQuote = !!(form.quoteId && selectorValue);

  function handleSelectorChange(v: CustomerSelectorValue | null) {
    if (!v) {
      setForm(f => ({ ...f, customerId: 0, customerName: "" }));
      return;
    }
    setForm(f => ({
      ...f,
      customerId: v.customerId ?? 0,
      customerName: v.type === "temp" ? v.name : "",
      contactPerson: f.contactPerson || v.contactPerson || "",
      mobilePhone: f.mobilePhone || v.mobile || "",
      telephone: f.telephone || v.phone || "",
      installAddress: f.installAddress || v.address || "",
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
    const linkedId = quote.customerId != null && quote.customerId > 0 ? quote.customerId : 0;
    const cust = linkedId > 0 ? customers.find((c: any) => c.id === linkedId) : undefined;
    setForm(f => ({
      ...f,
      quoteId: qid,
      customerId: linkedId,
      customerName: linkedId > 0 ? "" : (quote.customerName ?? ""),
      contactPerson: quote.contactPerson || cust?.contactPerson || f.contactPerson || "",
      mobilePhone: quote.customerPhone || cust?.mobile || f.mobilePhone || "",
      telephone: f.telephone || cust?.phone || "",
      installAddress: quote.address || cust?.address || f.installAddress || "",
      description: quote.description || f.description || "",
    }));
  }

  function toggleTechnician(name: string) {
    setForm(f => ({
      ...f,
      technicians: f.technicians.includes(name)
        ? f.technicians.filter(n => n !== name)
        : [...f.technicians, name],
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

      {/* ── 對應報價單 ── */}
      {showQuoteSelector && (
        <>
          <SectionHeading>對應報價單（選填）</SectionHeading>
          <div className="space-y-1">
            <Label>報價單</Label>
            <Select
              value={form.quoteId ? String(form.quoteId) : "__none__"}
              onValueChange={handleQuoteChange}
            >
              <SelectTrigger><SelectValue placeholder="選擇報價單（可不填）" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">（不連結報價單）</SelectItem>
                {quotes.map(q => (
                  <SelectItem key={q.id} value={String(q.id)}>
                    {q.title}{q.customerName ? ` — ${q.customerName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.quoteId && (
              <p className="text-xs text-muted-foreground">已自動帶入報價單客戶資料{customerLockedFromQuote ? "（不可更改）" : "，可修改"}</p>
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
          disabled={customerDisabled || customerLockedFromQuote}
          allowTemp={!customerLockedFromQuote}
          showAddressPicker={true}
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
        </div>
        <div className="space-y-1">
          <Label>施工時間</Label>
          <Input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>完成日期</Label>
          <Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>工程類型</Label>
          <Select value={form.projectType} onValueChange={v => setForm(f => ({ ...f, projectType: v }))}>
            <SelectTrigger><SelectValue placeholder="選擇類型" /></SelectTrigger>
            <SelectContent>{WO_PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>工程標題</Label>
          <Input
            placeholder={`${form.projectType || "派工"} 派工單`}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </div>
      </div>

      {/* ── 施工技師 ── */}
      <div className="space-y-1">
        <Label>施工技師</Label>
        {technicianOptions.length > 0 ? (
          <div className="border rounded-md p-2 max-h-36 overflow-y-auto space-y-1.5">
            {technicianOptions.map(emp => (
              <div key={emp.id} className="flex items-center gap-2">
                <Checkbox
                  id={`tech-${emp.id}`}
                  checked={form.technicians.includes(emp.name)}
                  onCheckedChange={() => toggleTechnician(emp.name)}
                />
                <label htmlFor={`tech-${emp.id}`} className="text-sm cursor-pointer">{emp.name}</label>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground border rounded-md p-2">尚無在職技師資料（請至員工管理新增職位為「師傅技師」的員工）</p>
        )}
        {form.technicians.length > 0 && (
          <p className="text-xs text-muted-foreground">已選：{form.technicians.join("、")}</p>
        )}
      </div>

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

    </div>
  );
}
