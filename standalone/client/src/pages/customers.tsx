import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer,
  useListQuotes, useListWorkOrders, useListPayments, useListWarranties,
  useListEmployees,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";

import type { Customer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Trash2, Pencil, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

function CustomerDeleteDialog({
  customer,
  onClose,
  onConfirm,
  isPending,
}: {
  customer: Customer;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { data: quotes } = useListQuotes({ customerId: customer.id });
  const { data: workOrders } = useListWorkOrders({ customerId: customer.id });
  const { data: payments } = useListPayments({ customerId: customer.id });
  const { data: warranties } = useListWarranties({ customerId: customer.id });

  const isLoading =
    quotes === undefined ||
    workOrders === undefined ||
    payments === undefined ||
    warranties === undefined;

  const blocks = [
    (quotes?.length ?? 0) > 0 ? `報價單 ${quotes!.length} 筆` : null,
    (workOrders?.length ?? 0) > 0 ? `派工單 ${workOrders!.length} 筆` : null,
    (payments?.length ?? 0) > 0 ? `收款紀錄 ${payments!.length} 筆` : null,
    (warranties?.length ?? 0) > 0 ? `保固資料 ${warranties!.length} 筆` : null,
  ].filter(Boolean) as string[];

  const isBlocked = blocks.length > 0;

  return (
    <AlertDialog open onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>刪除客戶：{customer.name}</AlertDialogTitle>
          <AlertDialogDescription>
            {isLoading
              ? "正在檢查關聯資料..."
              : isBlocked
              ? "此客戶有關聯資料，無法直接刪除。"
              : `此操作無法還原，確定要刪除 ${customer.name} 嗎？`}
          </AlertDialogDescription>
          {!isLoading && isBlocked && (
            <div className="space-y-1 mt-2 text-sm">
              {blocks.map(b => (
                <p key={b} className="font-medium text-destructive">・{b}</p>
              ))}
              <p className="text-xs text-muted-foreground mt-2">請先到各管理頁面刪除相關資料後再試。</p>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>取消</AlertDialogCancel>
          {!isLoading && !isBlocked && (
            <AlertDialogAction
              onClick={onConfirm}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              刪除
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function Customers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === "owner" || user?.role === "admin";
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [includeOld, setIncludeOld] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", email: "", discountScheme: "", notes: "", primarySalesRepId: 0 });

  const { data: customers, isLoading } = useListCustomers({
    search: search || undefined,
    includeOld: includeOld ? "true" : undefined,
  });
  const { data: employees } = useListEmployees({});
  const salesEmployees = employees?.filter(e => e.position === "業務" && e.status !== "離職") ?? [];

  const [createForm, setCreateForm] = useState({ name: "", phone: "", address: "", email: "", discountScheme: "", notes: "", primarySalesRepId: 0 });

  const createMutation = useCreateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setShowCreate(false);
        setCreateForm({ name: "", phone: "", address: "", email: "", discountScheme: "", notes: "", primarySalesRepId: 0 });
        toast({ title: "客戶新增成功" });
      },
    },
  });

  const updateMutation = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setEditCustomer(null);
        toast({ title: "客戶資料已更新" });
      },
    },
  });

  const deleteMutation = useDeleteCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setDeleteCustomer(null);
        toast({ title: "客戶已刪除" });
      },
    },
  });

  function openEdit(c: Customer) {
    setEditForm({
      name: c.name,
      phone: c.phone ?? "",
      address: c.address ?? "",
      email: c.email ?? "",
      discountScheme: c.discountScheme ?? "",
      notes: c.notes ?? "",
      primarySalesRepId: c.primarySalesRepId ?? 0,
    });
    setEditCustomer(c);
  }

  function customerPayload(form: typeof createForm) {
    return {
      ...form,
      ...(form.primarySalesRepId > 0 ? { primarySalesRepId: form.primarySalesRepId } : {}),
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">客戶管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理所有客戶資料</p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />新增客戶
          </Button>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋姓名、電話或地址..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={includeOld} onChange={e => setIncludeOld(e.target.checked)} className="rounded" />
          包含兩年前
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : customers && customers.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {customers.map(c => (
                <div key={c.id} className="px-3 py-2.5 hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    {/* Name + info (clickable to edit) */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => canWrite && openEdit(c)}>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${canWrite ? "hover:text-primary" : ""}`}>{c.name}</span>
                        {c.discountScheme && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded hidden sm:inline">
                            {c.discountScheme}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                        <span>{c.phone}</span>
                        {c.primarySalesRepName && <span>業務：{c.primarySalesRepName}</span>}
                        <span className="truncate max-w-52 hidden sm:inline">{c.address}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {canWrite && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="編輯客戶"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="客戶完整履歷"
                        onClick={() => navigate(`/customers/${c.id}/history`)}
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                      </Button>
                      {user?.role === "owner" && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-50"
                          title="刪除客戶"
                          onClick={() => setDeleteCustomer(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">尚無客戶資料</p>
          </CardContent>
        </Card>
      )}

      {/* Create Customer Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增客戶</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ data: customerPayload(createForm) as any }); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>姓名 *</Label>
                <Input required value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>電話 *</Label>
                <Input required value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>地址 *</Label>
              <Input required value={createForm.address} onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>折扣方案</Label>
                <Input value={createForm.discountScheme} onChange={e => setCreateForm(f => ({ ...f, discountScheme: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>主要負責業務</Label>
              <Select value={String(createForm.primarySalesRepId)} onValueChange={v => setCreateForm(f => ({ ...f, primarySalesRepId: parseInt(v, 10) }))}>
                <SelectTrigger><SelectValue placeholder="選擇業務（選填）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">（不指定）</SelectItem>
                  {salesEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea rows={2} value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={editCustomer !== null} onOpenChange={open => !open && setEditCustomer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>編輯客戶資料</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (editCustomer) updateMutation.mutate({
                id: editCustomer.id,
                data: {
                  ...customerPayload(editForm),
                  primarySalesRepId: editForm.primarySalesRepId > 0 ? editForm.primarySalesRepId : null,
                } as any,
              });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>姓名</Label>
                <Input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>電話</Label>
                <Input required value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>地址</Label>
              <Input required value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>折扣方案</Label>
                <Input value={editForm.discountScheme} onChange={e => setEditForm(f => ({ ...f, discountScheme: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>主要負責業務</Label>
              <Select value={String(editForm.primarySalesRepId)} onValueChange={v => setEditForm(f => ({ ...f, primarySalesRepId: parseInt(v, 10) }))}>
                <SelectTrigger><SelectValue placeholder="選擇業務（選填）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">（不指定）</SelectItem>
                  {salesEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditCustomer(null)}>取消</Button>
              <Button type="submit" disabled={updateMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm with linked-record check */}
      {deleteCustomer && (
        <CustomerDeleteDialog
          customer={deleteCustomer}
          onClose={() => setDeleteCustomer(null)}
          onConfirm={() => deleteMutation.mutate({ id: deleteCustomer.id })}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
