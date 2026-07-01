import React, { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";

export const WO_STATUSES = ["待施工", "已完成"];
export const WO_PROJECT_TYPES = ["新裝", "維修", "保養", "遷機", "清洗", "保固服務"];
export const WO_ELEVATOR_OPTIONS = ["有電梯", "無電梯"];

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
    acBrand: "",
    modelNumber: "",
    quantity: undefined as number | undefined,
    indoorUnits: undefined as number | undefined,
    outdoorUnits: undefined as number | undefined,
    floorLevel: "",
    hasElevator: "",
    description: "",
    notes: "",
  };
}

export type WOForm = ReturnType<typeof makeEmpty>;

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
    acBrand: f.acBrand || undefined,
    modelNumber: f.modelNumber || undefined,
    quantity: f.quantity,
    indoorUnits: f.indoorUnits,
    outdoorUnits: f.outdoorUnits,
    floorLevel: f.floorLevel || undefined,
    hasElevator: f.hasElevator || undefined,
    description: f.description || undefined,
    notes: f.notes || undefined,
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

  const selectorValue: CustomerSelectorValue | null = useMemo(() => {
    if (form.customerId > 0) {
      const c = customers.find((x: any) => x.id === form.customerId);
      return {
        type: "linked",
        customerId: form.customerId,
        name: c?.name ?? `客戶 #${form.customerId}`,
        contactPerson: form.contactPerson || c?.contactPerson || "",
        phone: form.telephone || c?.phone || "",
        mobile: form.mobilePhone || c?.mobile || "",
        address: form.installAddress || c?.address || "",
        taxId: c?.taxId || "",
      };
    }
    if (form.customerName) {
      return {
        type: "temp",
        customerId: null,
        name: form.customerName,
        contactPerson: form.contactPerson,
        phone: form.telephone,
        mobile: form.mobilePhone,
        address: form.installAddress,
        taxId: "",
      };
    }
    return null;
  }, [form, customers]);

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
    const qid = parseInt(v);
    const quote = quotes.find(q => q.id === qid);
    if (!quote) return;
    const cust = customers.find((c: any) => c.id === (quote.customerId ?? 0));
    setForm(f => ({
      ...f,
      quoteId: qid,
      customerId: quote.customerId ?? f.customerId,
      contactPerson: quote.contactPerson || f.contactPerson || "",
      mobilePhone: quote.customerPhone || cust?.phone || f.mobilePhone || "",
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
              <p className="text-xs text-muted-foreground">已自動帶入報價單客戶資料，可修改</p>
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
          disabled={customerDisabled}
          allowTemp={true}
          showAddressPicker={true}
          onAddressSelect={(_, address) => setForm(f => ({ ...f, installAddress: address }))}
          selectedAddressId={null}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>聯絡人</Label>
          <Input placeholder="聯絡人姓名" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>行動電話</Label>
          <Input type="tel" placeholder="0912-345-678" value={form.mobilePhone} onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>聯絡電話</Label>
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
      <SectionHeading>冷氣設備</SectionHeading>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>冷氣品牌</Label>
          <Input placeholder="大金、日立…" value={form.acBrand} onChange={e => setForm(f => ({ ...f, acBrand: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>型號</Label>
          <Input placeholder="型號" value={form.modelNumber} onChange={e => setForm(f => ({ ...f, modelNumber: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>數量（台）</Label>
          <Input
            type="number" min="0" placeholder="0"
            value={form.quantity ?? ""}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value ? parseInt(e.target.value) : undefined }))}
          />
        </div>
        <div className="space-y-1">
          <Label>室內機（台）</Label>
          <Input
            type="number" min="0" placeholder="0"
            value={form.indoorUnits ?? ""}
            onChange={e => setForm(f => ({ ...f, indoorUnits: e.target.value ? parseInt(e.target.value) : undefined }))}
          />
        </div>
        <div className="space-y-1">
          <Label>室外機（台）</Label>
          <Input
            type="number" min="0" placeholder="0"
            value={form.outdoorUnits ?? ""}
            onChange={e => setForm(f => ({ ...f, outdoorUnits: e.target.value ? parseInt(e.target.value) : undefined }))}
          />
        </div>
        <div className="space-y-1">
          <Label>樓層</Label>
          <Input placeholder="例：3樓" value={form.floorLevel} onChange={e => setForm(f => ({ ...f, floorLevel: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>電梯</Label>
          <Select value={form.hasElevator} onValueChange={v => setForm(f => ({ ...f, hasElevator: v }))}>
            <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
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
