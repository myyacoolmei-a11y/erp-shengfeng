import { useState } from "react";
import {
  useListWholesaleCustomers, useCreateWholesaleCustomer,
  useUpdateWholesaleCustomer, useDeleteWholesaleCustomer,
  getListWholesaleCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Search, Building2, Phone, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const WRITE_ROLES = ["super_admin", "owner", "admin", "sales"] as const;

function makeEmpty() {
  return {
    companyName: "", contactPerson: "", mobile: "", telephone: "",
    taxId: "", address: "", email: "", paymentTerms: "", creditLimit: "", notes: "",
  };
}
type CForm = ReturnType<typeof makeEmpty>;

function fromRow(r: any): CForm {
  return {
    companyName: r.companyName ?? "",
    contactPerson: r.contactPerson ?? "",
    mobile: r.mobile ?? "",
    telephone: r.telephone ?? "",
    taxId: r.taxId ?? "",
    address: r.address ?? "",
    email: r.email ?? "",
    paymentTerms: r.paymentTerms ?? "",
    creditLimit: r.creditLimit != null ? String(r.creditLimit) : "",
    notes: r.notes ?? "",
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

export default function WholesaleCustomers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user && WRITE_ROLES.includes(user.role as any);

  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<CForm>(makeEmpty());

  const { data: customers, isLoading } = useListWholesaleCustomers(search ? { search } : {});
  const inv = () => qc.invalidateQueries({ queryKey: getListWholesaleCustomersQueryKey() });
  const createMut = useCreateWholesaleCustomer({ mutation: { onSuccess: () => { inv(); close_(); toast({ title: "批發客戶已新增" }); } } });
  const updateMut = useUpdateWholesaleCustomer({ mutation: { onSuccess: () => { inv(); close_(); toast({ title: "已更新" }); } } });
  const deleteMut = useDeleteWholesaleCustomer({ mutation: { onSuccess: () => { inv(); setDeleteId(null); toast({ title: "已刪除" }); } } });

  function close_() { setShowDialog(false); setEditItem(null); }

  function openCreate() { setForm(makeEmpty()); setEditItem(null); setShowDialog(true); }
  function openEdit(r: any) { setForm(fromRow(r)); setEditItem(r); setShowDialog(true); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim()) { toast({ title: "請填寫公司名稱", variant: "destructive" }); return; }
    const payload: any = {
      companyName: form.companyName,
      contactPerson: form.contactPerson || undefined,
      mobile: form.mobile || undefined,
      telephone: form.telephone || undefined,
      taxId: form.taxId || undefined,
      address: form.address || undefined,
      email: form.email || undefined,
      paymentTerms: form.paymentTerms || undefined,
      creditLimit: form.creditLimit !== "" ? parseFloat(form.creditLimit) : null,
      notes: form.notes || undefined,
    };
    if (editItem) updateMut.mutate({ id: editItem.id, data: payload });
    else createMut.mutate({ data: payload });
  }

  const list = customers ?? [];
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發客戶</h1>
          <p className="text-sm text-muted-foreground">共 {list.length} 筆</p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="shrink-0"><Plus className="h-4 w-4 mr-1" />新增批發客戶</Button>
        )}
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8 h-9" placeholder="搜尋公司名稱、聯絡人…" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-14 text-center">
          <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">尚無批發客戶資料</p>
          {canWrite && <Button className="mt-3" size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新增</Button>}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex gap-3 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-base">{c.companyName}</p>
                      {c.taxId && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">統一編號：{c.taxId}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-muted-foreground">
                      {c.contactPerson && <span>聯絡人：{c.contactPerson}</span>}
                      {c.mobile && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.mobile}</span>}
                      {c.telephone && <span>電話：{c.telephone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                    </div>
                    {(c.address || c.paymentTerms || c.creditLimit) && (
                      <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                        {c.address && <span>地址：{c.address}</span>}
                        {c.paymentTerms && <span>付款條件：{c.paymentTerms}</span>}
                        {c.creditLimit && <span>信用額度：NT$ {parseFloat(c.creditLimit).toLocaleString()}</span>}
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={open => !open && close_()}>
        <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? `編輯 ${editItem.companyName}` : "新增批發客戶"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">
            <SectionHeading>基本資料</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>公司名稱 *</Label>
                <Input required value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="例：晟風貿易股份有限公司" />
              </div>
              <div className="space-y-1">
                <Label>聯絡人</Label>
                <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>統一編號</Label>
                <Input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} placeholder="12345678" />
              </div>
              <div className="space-y-1">
                <Label>手機</Label>
                <Input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>電話</Label>
                <Input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>付款條件</Label>
                <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="例：月結30天" />
              </div>
              <div className="space-y-1">
                <Label>信用額度</Label>
                <Input type="number" min="0" step="1000" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>地址</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>備註</Label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close_}>取消</Button>
              <Button type="submit" disabled={isPending}>{editItem ? "儲存" : "新增"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除這筆批發客戶資料嗎？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
