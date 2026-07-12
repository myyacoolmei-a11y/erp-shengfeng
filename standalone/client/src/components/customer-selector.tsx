import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ChevronsUpDown, Check, Plus, User, X, RefreshCw, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useListCustomers,
  useCreateCustomer,
  useCheckCustomerDuplicate,
  useListCustomerAddresses,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// ── Public types ──────────────────────────────────────────────────────────────

export interface CustomerSelectorValue {
  type: "linked" | "temp"
  customerId: number | null  // null when temp
  name: string
  contactPerson: string
  phone: string
  mobile: string
  address: string
  taxId: string
}

export interface CustomerSelectorProps {
  value: CustomerSelectorValue | null
  onChange: (v: CustomerSelectorValue | null) => void
  /** Lock the selector (e.g. when customer comes from a quote) */
  disabled?: boolean
  /** Radix Popover modal — set false when inside Dialog (mobile PWA) */
  modal?: boolean
  /** Called when user enters existing search vs temporary customer flow */
  onCustomerModeChange?: (mode: "existing" | "temporary" | null) => void
  /** Show the "臨時客戶" option (default true). Set false for payments/warranties/maintenance. */
  allowTemp?: boolean
  /** When provided, shows a "轉成正式客戶" button for temp-type values */
  onConvertToFormal?: (newCustomer: { id: number; name: string }) => void
  /** 報價單負責業務，轉正式客戶時帶入 */
  convertPrimarySalesRepId?: number
  /** When provided, show an address picker below the selector for the linked customer */
  showAddressPicker?: boolean
  selectedAddressId?: number | null
  onAddressSelect?: (addressId: number | null, address: string) => void
}

// ── Empty create form ─────────────────────────────────────────────────────────

function emptyCreate() {
  return { name: "", contactPerson: "", phone: "", mobile: "", address: "", taxId: "", source: "手動", status: "詢價中", notes: "" };
}
type CreateForm = ReturnType<typeof emptyCreate>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function customerToValue(c: any): CustomerSelectorValue {
  return {
    type: "linked",
    customerId: c.id,
    name: c.name ?? "",
    contactPerson: c.contactPerson ?? "",
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
    address: c.address ?? "",
    taxId: c.taxId ?? "",
  };
}

function CustomerCard({ v }: { v: CustomerSelectorValue }) {
  const isPrimary = (s: string | undefined) => s && s.trim();
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{v.name}</span>
        {v.type === "temp" && <Badge variant="outline" className="text-[10px] h-4 px-1">臨時</Badge>}
        {v.taxId && <span className="text-xs text-muted-foreground">統編 {v.taxId}</span>}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {isPrimary(v.contactPerson) && <span>聯絡人：{v.contactPerson}</span>}
        {isPrimary(v.phone) && <span>市話：{v.phone}</span>}
        {isPrimary(v.mobile) && <span>手機：{v.mobile}</span>}
        {isPrimary(v.address) && <span className="truncate max-w-[220px]">地址：{v.address}</span>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomerSelector({
  value,
  onChange,
  disabled = false,
  modal = true,
  onCustomerModeChange,
  allowTemp = true,
  onConvertToFormal,
  convertPrimarySalesRepId,
  showAddressPicker = false,
  selectedAddressId,
  onAddressSelect,
}: CustomerSelectorProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Search popover
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDupDialog, setShowDupDialog] = useState(false);

  // Temp customer inline input
  const [tempOpen, setTempOpen] = useState(false);
  const [tempForm, setTempForm] = useState({ name: "", contactPerson: "", phone: "", mobile: "", address: "" });

  // Convert-to-formal
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState<CreateForm>(emptyCreate);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Search results
  const { data: searchResults = [], isFetching: searchFetching, isError: searchError } = useListCustomers(
    debouncedQuery ? { search: debouncedQuery, includeOld: "true" } : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: open && debouncedQuery.length >= 1 } as any }
  );

  function selectCustomer(c: {
    id: number;
    name?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
    mobile?: string | null;
    address?: string | null;
    taxId?: string | null;
  }) {
    onCustomerModeChange?.("existing");
    onChange(customerToValue(c));
    setOpen(false);
    setQuery("");
    setTempOpen(false);
  }

  // Customer addresses (for showAddressPicker)
  const { data: addresses = [] } = useListCustomerAddresses(
    value?.customerId ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: showAddressPicker && !!value?.customerId } as any }
  );

  // Mutations
  const createMut = useCreateCustomer({
    mutation: {
      onSuccess: (c) => {
        qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        onChange(customerToValue(c));
        setCreateOpen(false);
        setCreateForm(emptyCreate());
        toast({ title: "客戶已建立並選取" });
      },
      onError: (err: any) => {
        toast({ title: "建立失敗", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
      },
    },
  });

  const checkDupMut = useCheckCustomerDuplicate();

  // ── Create new customer ───────────────────────────────────────────────────

  async function handleCheckDuplicate() {
    if (!createForm.phone && !createForm.mobile && !createForm.taxId) return;
    try {
      const result = await checkDupMut.mutateAsync({
        data: {
          phone: createForm.phone || undefined,
          mobile: createForm.mobile || undefined,
          taxId: createForm.taxId || undefined,
        },
      });
      if (result && result.length > 0) {
        setDuplicates(result);
        setShowDupDialog(true);
      }
    } catch { /* ignore */ }
  }

  function handleConfirmCreate() {
    if (!createForm.name.trim()) return;
    createMut.mutate({ data: createForm as any });
  }

  function handleSelectDuplicate(c: any) {
    onChange(customerToValue(c));
    setShowDupDialog(false);
    setCreateOpen(false);
    setCreateForm(emptyCreate());
  }

  // ── Temp customer ─────────────────────────────────────────────────────────

  function handleConfirmTemp() {
    if (!tempForm.name.trim()) return;
    onCustomerModeChange?.("temporary");
    onChange({
      type: "temp",
      customerId: null,
      name: tempForm.name.trim(),
      contactPerson: tempForm.contactPerson.trim(),
      phone: tempForm.phone.trim(),
      mobile: tempForm.mobile.trim(),
      address: tempForm.address.trim(),
      taxId: "",
    });
    setTempOpen(false);
    setOpen(false);
    setTempForm({ name: "", contactPerson: "", phone: "", mobile: "", address: "" });
  }

  // ── Convert temp → formal ────────────────────────────────────────────────

  useEffect(() => {
    if (value?.type === "temp") {
      setConvertForm({
        name: value.name,
        contactPerson: value.contactPerson,
        phone: value.phone,
        mobile: value.mobile,
        address: value.address,
        taxId: value.taxId,
        source: "手動",
        status: "詢價中",
        notes: "",
      });
    }
  }, [value]);

  const convertMut = useCreateCustomer({
    mutation: {
      onSuccess: (c) => {
        qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        onChange(customerToValue(c));
        if (onConvertToFormal) onConvertToFormal({ id: c.id, name: c.name });
        setConvertOpen(false);
        toast({ title: "已建立正式客戶並關聯" });
      },
      onError: (err: any) => {
        toast({ title: "建立失敗", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
      },
    },
  });

  function handleConfirmConvert() {
    if (!convertForm.name.trim()) return;
    const payload = {
      ...convertForm,
      ...(convertPrimarySalesRepId && convertPrimarySalesRepId > 0
        ? { primarySalesRepId: convertPrimarySalesRepId }
        : {}),
    };
    convertMut.mutate({ data: payload as any });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (disabled && value) {
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <CustomerCard v={value} />
        <p className="text-xs text-muted-foreground mt-1">來自報價單（不可更改）</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* ── Selected state ── */}
      {value ? (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <CustomerCard v={value} />
            <div className="flex gap-1 shrink-0">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { onChange(null); setQuery(""); }}>
                <X className="h-3 w-3 mr-0.5" />更換
              </Button>
            </div>
          </div>
          {/* Convert to formal */}
          {value.type === "temp" && onConvertToFormal && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={() => setConvertOpen(true)}
            >
              <RefreshCw className="h-3 w-3 mr-1" />轉成正式客戶
            </Button>
          )}
        </div>
      ) : (
        /* ── Empty state — search combobox ── */
        <Popover open={open} modal={modal} onOpenChange={(o) => {
          setOpen(o);
          if (o) onCustomerModeChange?.("existing");
          if (!o) { setQuery(""); setTempOpen(false); }
        }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5" />搜尋客戶…
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(380px,calc(100vw-2rem))] p-0 z-[200]" align="start" collisionPadding={12}>
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="輸入名稱、聯絡人、手機、市話、統編…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className="max-h-72 overflow-y-auto">
                {debouncedQuery.length >= 1 && (
                  <>
                    {searchFetching && (
                      <div className="py-3 text-center text-xs text-muted-foreground">搜尋中…</div>
                    )}
                    {searchError && (
                      <div className="py-3 px-3 text-center text-xs text-destructive">無法搜尋客戶，請確認登入權限</div>
                    )}
                    {!searchFetching && !searchError && searchResults.length === 0 ? (
                      <CommandEmpty>找不到符合的客戶</CommandEmpty>
                    ) : (
                      <CommandGroup heading="搜尋結果">
                        {searchResults.map((c: any) => (
                          <CommandItem
                            key={c.id}
                            value={String(c.id)}
                            onSelect={() => selectCustomer(c)}
                            onPointerDown={(e) => e.preventDefault()}
                            className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 w-full">
                              <Check className="h-3.5 w-3.5 shrink-0 opacity-0" />
                              <span className="font-medium">{c.name}</span>
                              {c.taxId && <span className="text-xs text-muted-foreground ml-auto">統編 {c.taxId}</span>}
                            </div>
                            <div className="pl-5 flex flex-wrap gap-x-2 gap-y-0 text-xs text-muted-foreground">
                              {c.contactPerson && <span>聯絡人：{c.contactPerson}</span>}
                              {c.mobile && <span>手機：{c.mobile}</span>}
                              {c.phone && <span>市話：{c.phone}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </>
                )}
                {debouncedQuery.length < 1 && (
                  <div className="py-4 text-center text-xs text-muted-foreground">輸入關鍵字搜尋客戶</div>
                )}
                <Separator />
                <CommandGroup>
                  {/* Temp customer inline */}
                  {allowTemp && (
                    <CommandItem
                      value="__temp__"
                      onSelect={() => {
                        onCustomerModeChange?.("temporary");
                        setOpen(false);
                        setTempOpen(false);
                      }}
                      className="text-muted-foreground"
                    >
                      <Plus className="h-3.5 w-3.5 mr-2" />輸入臨時客戶資料（無需建立正式資料）
                    </CommandItem>
                  )}
                  <CommandItem value="__create__" onSelect={() => { setOpen(false); setCreateOpen(true); onCustomerModeChange?.(null); }}>
                    <Plus className="h-3.5 w-3.5 mr-2 text-primary" />
                    <span className="text-primary font-medium">建立正式客戶</span>
                  </CommandItem>
                </CommandGroup>

                {/* Temp inline form */}
                {tempOpen && (
                  <div className="p-3 border-t space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">臨時客戶資料（不建立正式記錄）</p>
                    <Input
                      autoFocus
                      placeholder="客戶名稱 *"
                      value={tempForm.name}
                      onChange={e => setTempForm(f => ({ ...f, name: e.target.value }))}
                    />
                    <Input
                      placeholder="聯絡人"
                      value={tempForm.contactPerson}
                      onChange={e => setTempForm(f => ({ ...f, contactPerson: e.target.value }))}
                    />
                    <Input
                      placeholder="手機"
                      type="tel"
                      value={tempForm.mobile}
                      onChange={e => setTempForm(f => ({ ...f, mobile: e.target.value }))}
                    />
                    <Input
                      placeholder="市話（選填）"
                      type="tel"
                      value={tempForm.phone}
                      onChange={e => setTempForm(f => ({ ...f, phone: e.target.value }))}
                    />
                    <Input
                      placeholder="地址"
                      value={tempForm.address}
                      onChange={e => setTempForm(f => ({ ...f, address: e.target.value }))}
                    />
                    <div className="flex gap-2 pt-1">
                      <Button type="button" size="sm" className="flex-1" disabled={!tempForm.name.trim()} onClick={handleConfirmTemp}>確認</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setTempOpen(false)}>取消</Button>
                    </div>
                  </div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* ── Address picker ── */}
      {showAddressPicker && value?.type === "linked" && value.customerId && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />施工地址（從客戶地址選擇）</Label>
          <div className="flex flex-wrap gap-2">
            {addresses.map((a: any) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onAddressSelect?.(a.id, a.address)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded border transition-colors",
                  selectedAddressId === a.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                )}
              >
                {a.label}：{a.address}
              </button>
            ))}
            {addresses.length === 0 && (
              <span className="text-xs text-muted-foreground">（尚無儲存地址）</span>
            )}
          </div>
        </div>
      )}

      {/* ── Create formal customer dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>建立正式客戶</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>客戶名稱 *</Label>
                <Input
                  autoFocus
                  placeholder="姓名或公司名稱"
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>聯絡人</Label>
                <Input
                  placeholder="負責人 / 聯絡人"
                  value={createForm.contactPerson}
                  onChange={e => setCreateForm(f => ({ ...f, contactPerson: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>統一編號</Label>
                <Input
                  placeholder="統編（選填）"
                  value={createForm.taxId}
                  onChange={e => setCreateForm(f => ({ ...f, taxId: e.target.value }))}
                  onBlur={handleCheckDuplicate}
                />
              </div>
              <div className="space-y-1">
                <Label>市話</Label>
                <Input
                  type="tel"
                  placeholder="(02) 1234-5678"
                  value={createForm.phone}
                  onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                  onBlur={handleCheckDuplicate}
                />
              </div>
              <div className="space-y-1">
                <Label>手機</Label>
                <Input
                  type="tel"
                  placeholder="0912-345-678"
                  value={createForm.mobile}
                  onChange={e => setCreateForm(f => ({ ...f, mobile: e.target.value }))}
                  onBlur={handleCheckDuplicate}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>地址</Label>
                <Input
                  placeholder="客戶地址"
                  value={createForm.address}
                  onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>來源</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={createForm.source}
                  onChange={e => setCreateForm(f => ({ ...f, source: e.target.value }))}
                >
                  {["手動", "報價", "派工", "匯入"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>狀態</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={createForm.status}
                  onChange={e => setCreateForm(f => ({ ...f, status: e.target.value }))}
                >
                  {["詢價中", "已成交", "固定客戶", "停用"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="button" disabled={!createForm.name.trim() || createMut.isPending} onClick={handleConfirmCreate}>
              {createMut.isPending ? "建立中…" : "建立並選取"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Duplicate warning dialog ── */}
      <AlertDialog open={showDupDialog} onOpenChange={setShowDupDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>此客戶可能已存在</AlertDialogTitle>
            <AlertDialogDescription>找到以下電話、手機或統編相符的客戶，是否直接使用？</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {duplicates.map((c: any) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectDuplicate(c)}
                className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted transition-colors text-sm"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                  {c.phone && <span>{c.phone}</span>}
                  {c.mobile && <span>{c.mobile}</span>}
                  {c.taxId && <span>統編 {c.taxId}</span>}
                  {c.address && <span className="truncate">{c.address}</span>}
                </div>
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDupDialog(false)}>忽略，繼續建立新客戶</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Convert temp → formal dialog ── */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>轉成正式客戶</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>客戶名稱 *</Label>
              <Input value={convertForm.name} onChange={e => setConvertForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>聯絡人</Label>
              <Input value={convertForm.contactPerson} onChange={e => setConvertForm(f => ({ ...f, contactPerson: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>統編</Label>
              <Input value={convertForm.taxId} onChange={e => setConvertForm(f => ({ ...f, taxId: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>市話</Label>
              <Input value={convertForm.phone} onChange={e => setConvertForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>手機</Label>
              <Input value={convertForm.mobile} onChange={e => setConvertForm(f => ({ ...f, mobile: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>地址</Label>
              <Input value={convertForm.address} onChange={e => setConvertForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>來源</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={convertForm.source} onChange={e => setConvertForm(f => ({ ...f, source: e.target.value }))}>
                {["手動", "報價", "派工", "匯入"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>狀態</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={convertForm.status} onChange={e => setConvertForm(f => ({ ...f, status: e.target.value }))}>
                {["詢價中", "已成交", "固定客戶", "停用"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">建立後，所有關聯記錄（報價單、派工單）將自動更新為正式客戶。</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConvertOpen(false)}>取消</Button>
            <Button type="button" disabled={!convertForm.name.trim() || convertMut.isPending} onClick={handleConfirmConvert}>
              {convertMut.isPending ? "建立中…" : "建立正式客戶"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
