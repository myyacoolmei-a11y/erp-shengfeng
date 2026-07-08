import { useState } from "react";
import {
  useListRepairCases,
  useCreateRepairCase,
  useGetRepairCase,
  useUpdateRepairCase,
  useDeleteRepairCase,
  useListEmployees,
  getListRepairCasesQueryKey,
  getGetRepairCaseQueryKey,
} from "@workspace/api-client-react";
import type { RepairCase, RepairCaseDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateStatistics } from "@/lib/invalidateStatistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CustomerSelector, type CustomerSelectorValue } from "@/components/customer-selector";
import { Plus, Search, Eye, Trash2, FileText, CreditCard, Receipt, ShieldCheck, Bell, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VoiceAssistantButton } from "@/components/voice-assistant/VoiceAssistantDialog";
import { applyVoiceToRepairCaseForm, customerFromVoiceRepair } from "@/lib/voice/applyVoiceToRepairCase";
import type { VoiceAssistantApplyPayload } from "@/components/voice-assistant/types";

const STATUSES = ["待派工", "已派工", "診斷中", "等待客戶確認", "等待零件", "維修中", "已完工", "已取消"] as const;
const SOURCES = ["客戶報修", "原廠派案"] as const;
const PRIORITIES = ["普通", "急件", "VIP"] as const;

const STATUS_COLORS: Record<string, string> = {
  "待派工": "bg-slate-100 text-slate-700",
  "已派工": "bg-blue-100 text-blue-700",
  "診斷中": "bg-purple-100 text-purple-700",
  "等待客戶確認": "bg-amber-100 text-amber-700",
  "等待零件": "bg-orange-100 text-orange-700",
  "維修中": "bg-cyan-100 text-cyan-700",
  "已完工": "bg-green-100 text-green-700",
  "已取消": "bg-gray-100 text-gray-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  "普通": "bg-slate-100 text-slate-600",
  "急件": "bg-red-100 text-red-700",
  "VIP": "bg-amber-100 text-amber-800",
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function emptyForm() {
  return {
    source: "客戶報修" as string,
    contactName: "",
    phone: "",
    address: "",
    siteAddress: "",
    brand: "",
    model: "",
    quantity: 1,
    problemDescription: "",
    status: "待派工",
    priority: "普通",
    appointmentDate: "",
    appointmentTime: "",
    employeeId: null as number | null,
    notes: "",
    photos: [] as string[],
  };
}

function buildPayload(form: ReturnType<typeof emptyForm>, customer: CustomerSelectorValue | null) {
  return {
    source: form.source,
    customerId: customer?.type === "linked" ? customer.customerId : null,
    tempCustomerName: customer?.type === "temp" ? customer.name : null,
    contactName: form.contactName || customer?.contactPerson || null,
    phone: form.phone || customer?.mobile || customer?.phone || null,
    address: form.address || customer?.address || null,
    siteAddress: form.siteAddress || null,
    brand: form.brand || null,
    model: form.model || null,
    quantity: form.quantity || null,
    problemDescription: form.problemDescription || null,
    status: form.status,
    priority: form.priority,
    appointmentDate: form.appointmentDate || null,
    appointmentTime: form.appointmentTime || null,
    employeeId: form.employeeId,
    notes: form.notes || null,
    photos: form.photos.filter(Boolean),
  };
}

function displayAddress(c: RepairCase) {
  return c.siteAddress || c.address || "—";
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function PlaceholderActions({ onToast }: { onToast: (msg: string) => void }) {
  const actions = [
    { label: "建立報價單", icon: FileText },
    { label: "建立應收帳款", icon: Receipt },
    { label: "建立收款", icon: CreditCard },
    { label: "建立保固", icon: ShieldCheck },
    { label: "建立保養提醒", icon: Bell },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ label, icon: Icon }) => (
        <Button
          key={label}
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onToast(`${label}（功能預留，尚未串接）`)}
        >
          <Icon className="h-3.5 w-3.5 mr-1" />
          {label}
        </Button>
      ))}
    </div>
  );
}

function RepairCaseDetailView({
  detail,
  onClose,
  onStatusChange,
}: {
  detail: RepairCaseDetail;
  onClose: () => void;
  onStatusChange: (status: string) => void;
}) {
  const { toast } = useToast();

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">{detail.repairNo ?? `#${detail.id}`}</p>
          <p className="text-xs text-muted-foreground">建立：{detail.createdAt?.slice(0, 10)}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end">
          <Badge className={STATUS_COLORS[detail.status] ?? ""}>{detail.status}</Badge>
          <Badge variant="outline" className={PRIORITY_COLORS[detail.priority] ?? ""}>{detail.priority}</Badge>
          <Badge variant="secondary">{detail.source}</Badge>
        </div>
      </div>

      <Separator />

      <DetailSection title="基本資料">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><span className="text-muted-foreground">客戶：</span>{detail.customerName ?? "—"}</div>
          <div><span className="text-muted-foreground">聯絡人：</span>{detail.contactName ?? "—"}</div>
          <div><span className="text-muted-foreground">電話：</span>{detail.phone ?? "—"}</div>
          <div><span className="text-muted-foreground">技師：</span>{detail.employeeName ?? "—"}</div>
          <div className="col-span-2"><span className="text-muted-foreground">地址：</span>{detail.address ?? "—"}</div>
          <div className="col-span-2"><span className="text-muted-foreground">案件地址：</span>{detail.siteAddress ?? "—"}</div>
          <div><span className="text-muted-foreground">品牌：</span>{detail.brand ?? "—"}</div>
          <div><span className="text-muted-foreground">型號：</span>{detail.model ?? "—"}</div>
          <div><span className="text-muted-foreground">數量：</span>{detail.quantity ?? "—"}</div>
          <div><span className="text-muted-foreground">預約：</span>{detail.appointmentDate ?? "—"} {detail.appointmentTime ?? ""}</div>
        </div>
      </DetailSection>

      <DetailSection title="故障描述">
        <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3 min-h-[60px]">
          {detail.problemDescription || "—"}
        </p>
      </DetailSection>

      {detail.photos && detail.photos.length > 0 && (
        <DetailSection title="照片">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {detail.photos.map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-video rounded-md overflow-hidden border bg-muted">
                <img src={p.url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </a>
            ))}
          </div>
        </DetailSection>
      )}

      <DetailSection title="現場診斷">
        <p className="text-sm text-muted-foreground italic">（之後可擴充）</p>
      </DetailSection>

      <DetailSection title="零件 / 工資 / 總金額">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border p-2 text-center text-muted-foreground">零件 —</div>
          <div className="rounded-md border p-2 text-center text-muted-foreground">工資 —</div>
          <div className="rounded-md border p-2 text-center text-muted-foreground">總金額 —</div>
        </div>
      </DetailSection>

      <DetailSection title="維修紀錄">
        <p className="text-sm text-muted-foreground italic">（之後可擴充）</p>
      </DetailSection>

      {detail.notes && (
        <DetailSection title="備註">
          <p className="text-sm whitespace-pre-wrap">{detail.notes}</p>
        </DetailSection>
      )}

      <DetailSection title="後續操作">
        <PlaceholderActions onToast={msg => toast({ title: msg })} />
      </DetailSection>

      <DetailSection title="更新狀態">
        <Select value={detail.status} onValueChange={onStatusChange}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </DetailSection>

      <DialogFooter className="pt-2">
        <Button variant="outline" onClick={onClose}>關閉</Button>
      </DialogFooter>
    </div>
  );
}

export default function RepairCases() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [formCustomer, setFormCustomer] = useState<CustomerSelectorValue | null>(null);
  const [photoInput, setPhotoInput] = useState("");

  const params: Record<string, string> = {};
  if (search.trim()) params.search = search.trim();
  if (statusFilter !== "全部") params.status = statusFilter;

  const { data: cases, isLoading } = useListRepairCases(params);
  const { data: employees } = useListEmployees({});
  const { data: detail } = useGetRepairCase(detailId ?? 0, {
    query: { enabled: detailId !== null, queryKey: getGetRepairCaseQueryKey(detailId ?? 0) },
  });

  const invalidate = () => {
    invalidateStatistics(queryClient);
    queryClient.invalidateQueries({ queryKey: getListRepairCasesQueryKey() });
  };

  const createMutation = useCreateRepairCase({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowCreate(false);
        setForm(emptyForm());
        setFormCustomer(null);
        setPhotoInput("");
        toast({ title: "維修案件已建立" });
      },
      onError: (err: unknown) => {
        toast({ title: "建立失敗", description: String(err), variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateRepairCase({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "案件已更新" });
      },
    },
  });

  const deleteMutation = useDeleteRepairCase({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeleteId(null);
        if (detailId) setDetailId(null);
        toast({ title: "案件已刪除" });
      },
    },
  });

  const techEmployees = (employees ?? []).filter(e => e.status === "在職");

  function addPhotoUrl() {
    const url = photoInput.trim();
    if (!url) return;
    setForm(f => ({ ...f, photos: [...f.photos, url] }));
    setPhotoInput("");
  }

  function handleVoiceApply({ parsed }: VoiceAssistantApplyPayload) {
    if (parsed.formType !== "repair_case") return;
    setForm(applyVoiceToRepairCaseForm(emptyForm, parsed));
    setFormCustomer(customerFromVoiceRepair(parsed));
    setShowCreate(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">維修案件</h1>
          <p className="text-sm text-muted-foreground mt-0.5">客戶報修與原廠派案獨立流程</p>
        </div>
        <div className="flex items-center gap-2">
          <VoiceAssistantButton formType="repair_case" onApply={handleVoiceApply} />
          <Button size="sm" onClick={() => { setForm(emptyForm()); setFormCustomer(null); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" />建立案件
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜尋案件編號、客戶、電話、技師、狀態…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["全部", ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : cases && cases.length > 0 ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">案件編號</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">建立日期</th>
                  <th className="px-3 py-2 font-medium">客戶</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">電話</th>
                  <th className="px-3 py-2 font-medium hidden lg:table-cell">地址</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">技師</th>
                  <th className="px-3 py-2 font-medium">狀態</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">來源</th>
                  <th className="px-3 py-2 font-medium hidden lg:table-cell">預約日期</th>
                  <th className="px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cases.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{c.repairNo ?? `#${c.id}`}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground">{c.createdAt?.slice(0, 10)}</td>
                    <td className="px-3 py-2.5">{c.customerName ?? "—"}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">{c.phone ?? "—"}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell max-w-[160px] truncate">{displayAddress(c)}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">{c.employeeName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={`text-[10px] ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-xs">{c.source}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">{c.appointmentDate ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailId(c.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無維修案件</p></CardContent></Card>
      )}

      <Dialog open={showCreate} onOpenChange={open => { setShowCreate(open); if (!open) { setFormCustomer(null); setForm(emptyForm()); setPhotoInput(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>建立維修案件</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!formCustomer?.name && !form.contactName) {
                toast({ title: "請選擇或輸入客戶", variant: "destructive" });
                return;
              }
              createMutation.mutate({ data: buildPayload(form, formCustomer) });
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>來源</Label>
              <div className="flex gap-4">
                {SOURCES.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="source" checked={form.source === s} onChange={() => setForm(f => ({ ...f, source: s }))} />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>客戶 *</Label>
              <CustomerSelector
                value={formCustomer}
                onChange={v => {
                  setFormCustomer(v);
                  if (v) {
                    setForm(f => ({
                      ...f,
                      contactName: f.contactName || v.contactPerson,
                      phone: f.phone || v.mobile || v.phone,
                      address: f.address || v.address,
                    }));
                  }
                }}
                allowTemp
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>聯絡人</Label><Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>電話</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>

            <div className="space-y-1.5"><Label>地址</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>案件地址</Label><Input value={form.siteAddress} onChange={e => setForm(f => ({ ...f, siteAddress: e.target.value }))} placeholder="可與客戶地址不同" /></div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>設備品牌</Label><Input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>設備型號</Label><Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>數量</Label><Input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value, 10) || 1 }))} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>故障現象</Label>
              <Textarea rows={4} value={form.problemDescription} onChange={e => setForm(f => ({ ...f, problemDescription: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>照片（URL）</Label>
              <div className="flex gap-2">
                <Input value={photoInput} onChange={e => setPhotoInput(e.target.value)} placeholder="貼上圖片網址" />
                <Button type="button" variant="outline" onClick={addPhotoUrl}>新增</Button>
              </div>
              {form.photos.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.photos.map((url, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1 max-w-full">
                      <span className="truncate max-w-[180px]">{url}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>優先等級</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>負責技師</Label>
                <Select
                  value={form.employeeId ? String(form.employeeId) : "none"}
                  onValueChange={v => setForm(f => ({ ...f, employeeId: v === "none" ? null : parseInt(v, 10) }))}
                >
                  <SelectTrigger><SelectValue placeholder="選擇技師" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未指派</SelectItem>
                    {techEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>預約日期</Label><Input type="date" value={form.appointmentDate} onChange={e => setForm(f => ({ ...f, appointmentDate: e.target.value }))} min={todayStr()} /></div>
              <div className="space-y-1.5"><Label>預約時間</Label><Input type="time" value={form.appointmentTime} onChange={e => setForm(f => ({ ...f, appointmentTime: e.target.value }))} /></div>
            </div>

            <div className="space-y-1.5"><Label>備註</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending}>建立</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailId !== null} onOpenChange={open => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>案件詳情</DialogTitle></DialogHeader>
          {detail ? (
            <RepairCaseDetailView
              detail={detail}
              onClose={() => setDetailId(null)}
              onStatusChange={status => detailId && updateMutation.mutate({ id: detailId, data: { status } })}
            />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除此維修案件嗎？此操作無法復原。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
