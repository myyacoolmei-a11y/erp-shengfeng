import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Package,
  ArrowLeftRight,
  History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "../../../shared/api-client/custom-fetch.ts";
import {
  INVENTORY_STATUSES,
  INVENTORY_TX_REASONS,
  defaultTxSign,
  type InventoryStatus,
  type InventoryTxReason,
} from "../../../shared/inventoryConstants";
import {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  listInventoryTransactions,
  createInventoryTransaction,
  type InventoryItem,
} from "@/lib/inventoryApi";

const WRITE_ROLES = ["super_admin", "owner", "admin"] as const;
const QUERY_KEY = ["inventory-items"] as const;

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  庫存中: "default",
  待出貨: "secondary",
  已出貨: "outline",
  舊品待維修: "secondary",
  維修中: "secondary",
  報廢: "destructive",
};

function emptyForm() {
  return {
    brand: "",
    category: "",
    itemName: "",
    model: "",
    serialNumber: "",
    unit: "台",
    warehouseLocation: "",
    status: "庫存中" as InventoryStatus,
    costPrice: "",
    notes: "",
  };
}

type ItemForm = ReturnType<typeof emptyForm>;

function formFromItem(item: InventoryItem): ItemForm {
  return {
    brand: item.brand ?? "",
    category: item.category ?? "",
    itemName: item.itemName ?? "",
    model: item.model ?? "",
    serialNumber: item.serialNumber ?? "",
    unit: item.unit ?? "台",
    warehouseLocation: item.warehouseLocation ?? "",
    status: (item.status as InventoryStatus) || "庫存中",
    costPrice: item.costPrice != null ? String(item.costPrice) : "",
    notes: item.notes ?? "",
  };
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    const d = err.data as { error?: string } | undefined;
    if (d?.error) return d.error;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "操作失敗";
}

function fmtMoney(v: string | number | null | undefined) {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isNaN(n) ? "—" : `NT$${n.toLocaleString()}`;
}

function fmtDate(v: string) {
  try {
    return new Date(v).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return v;
  }
}

export default function Inventory() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = !!(user && WRITE_ROLES.includes(user.role as (typeof WRITE_ROLES)[number]));

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<string>("全部");
  const [warehouse, setWarehouse] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);

  const [txItem, setTxItem] = useState<InventoryItem | null>(null);
  const [txReason, setTxReason] = useState<InventoryTxReason>("進貨");
  const [txQtyAbs, setTxQtyAbs] = useState("1");
  const [txSign, setTxSign] = useState<"+" | "-">("+");
  const [txNotes, setTxNotes] = useState("");

  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  const filters = useMemo(
    () => ({
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(status !== "全部" ? { status } : {}),
      ...(warehouse.trim() ? { warehouse: warehouse.trim() } : {}),
    }),
    [brand, model, status, warehouse],
  );

  const { data: items = [], isLoading } = useQuery({
    queryKey: [...QUERY_KEY, filters],
    queryFn: () => listInventoryItems(filters),
  });

  const { data: txHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["inventory-transactions", historyItem?.id],
    queryFn: () => listInventoryTransactions(historyItem!.id),
    enabled: !!historyItem,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const createMut = useMutation({
    mutationFn: createInventoryItem,
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "已新增庫存品項", description: "數量請透過「庫存異動」調整" });
    },
    onError: (e) => toast({ title: "新增失敗", description: errMsg(e), variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ItemForm> }) =>
      updateInventoryItem(id, {
        brand: data.brand,
        category: data.category,
        itemName: data.itemName!,
        model: data.model,
        serialNumber: data.serialNumber,
        unit: data.unit,
        warehouseLocation: data.warehouseLocation,
        status: data.status,
        costPrice: data.costPrice === "" ? null : data.costPrice,
        notes: data.notes,
      }),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "已更新庫存品項" });
    },
    onError: (e) => toast({ title: "更新失敗", description: errMsg(e), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInventoryItem(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast({ title: "已刪除庫存品項" });
    },
    onError: (e) => toast({ title: "刪除失敗", description: errMsg(e), variant: "destructive" }),
  });

  const txMut = useMutation({
    mutationFn: () => {
      if (!txItem) throw new Error("未選擇品項");
      const abs = Math.abs(parseInt(txQtyAbs, 10) || 0);
      if (!abs) throw new Error("異動數量必須大於 0");
      let change = abs;
      if (txReason === "盤點調整") {
        change = txSign === "-" ? -abs : abs;
      } else {
        const sign = defaultTxSign(txReason);
        change = sign === -1 ? -abs : abs;
      }
      return createInventoryTransaction(txItem.id, {
        reason: txReason,
        quantityChange: change,
        notes: txNotes || null,
      });
    },
    onSuccess: (res) => {
      invalidate();
      setTxItem(null);
      toast({
        title: "異動已記錄",
        description: `目前數量：${res.quantity} ${res.item.unit || ""}`.trim(),
      });
    },
    onError: (e) => toast({ title: "異動失敗", description: errMsg(e), variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditing(item);
    setForm(formFromItem(item));
    setDialogOpen(true);
  }

  function openTx(item: InventoryItem) {
    setTxItem(item);
    setTxReason("進貨");
    setTxQtyAbs("1");
    setTxSign("+");
    setTxNotes("");
  }

  function onReasonChange(reason: InventoryTxReason) {
    setTxReason(reason);
    if (reason === "盤點調整") setTxSign("+");
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemName.trim()) {
      toast({ title: "請填寫品項名稱", variant: "destructive" });
      return;
    }
    const payload = {
      brand: form.brand || null,
      category: form.category || null,
      itemName: form.itemName.trim(),
      model: form.model || null,
      serialNumber: form.serialNumber || null,
      unit: form.unit || "台",
      warehouseLocation: form.warehouseLocation || null,
      status: form.status,
      costPrice: form.costPrice === "" ? null : form.costPrice,
      notes: form.notes || null,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: { ...form, ...payload } as any });
    } else {
      createMut.mutate(payload);
    }
  }

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">庫存管理</h1>
          <p className="text-sm text-muted-foreground">
            共 {items.length} 筆・數量僅能透過庫存異動調整
          </p>
        </div>
        {canWrite && (
          <Button className="shrink-0 gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />新增品項
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[140px] max-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="品牌"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>
        <div className="relative flex-1 min-w-[140px] max-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="型號"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
        <div className="relative flex-1 min-w-[140px] max-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="倉庫位置"
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="全部">全部狀態</SelectItem>
            {INVENTORY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left p-3 font-medium">品項</th>
                <th className="text-left p-3 font-medium">品牌</th>
                <th className="text-left p-3 font-medium">類別</th>
                <th className="text-left p-3 font-medium">型號</th>
                <th className="text-left p-3 font-medium">序號</th>
                <th className="text-right p-3 font-medium">數量</th>
                <th className="text-left p-3 font-medium">倉庫</th>
                <th className="text-center p-3 font-medium">狀態</th>
                <th className="text-right p-3 font-medium">進貨成本</th>
                {canWrite && <th className="p-3 w-28" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={canWrite ? 10 : 9} className="p-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 10 : 9} className="text-center py-12 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    尚無庫存品項
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{item.itemName}</div>
                      {item.notes && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{item.notes}</div>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{item.brand || "—"}</td>
                    <td className="p-3 text-muted-foreground">{item.category || "—"}</td>
                    <td className="p-3 text-muted-foreground">{item.model || "—"}</td>
                    <td className="p-3 font-mono text-xs">{item.serialNumber || "—"}</td>
                    <td className="p-3 text-right font-medium">
                      {item.quantity}{" "}
                      <span className="text-muted-foreground font-normal">{item.unit}</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.warehouseLocation || "—"}</td>
                    <td className="p-3 text-center">
                      <Badge variant={STATUS_BADGE[item.status] ?? "secondary"} className="text-xs">
                        {item.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{fmtMoney(item.costPrice)}</td>
                    {canWrite && (
                      <td className="p-3">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="庫存異動"
                            onClick={() => openTx(item)}
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="異動紀錄"
                            onClick={() => setHistoryItem(item)}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="編輯"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            title="刪除"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              尚無庫存品項
            </CardContent>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.itemName}</div>
                    <div className="text-xs text-muted-foreground">
                      {[item.brand, item.category, item.model].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <Badge variant={STATUS_BADGE[item.status] ?? "secondary"} className="text-xs shrink-0">
                    {item.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    序號：<span className="text-foreground font-mono">{item.serialNumber || "—"}</span>
                  </div>
                  <div>
                    數量：
                    <span className="text-foreground font-medium">
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                  <div>
                    倉庫：<span className="text-foreground">{item.warehouseLocation || "—"}</span>
                  </div>
                  <div>
                    成本：<span className="text-foreground">{fmtMoney(item.costPrice)}</span>
                  </div>
                </div>
                {item.notes && <p className="text-xs text-muted-foreground line-clamp-2">{item.notes}</p>}
                {canWrite && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openTx(item)}>
                      <ArrowLeftRight className="h-3.5 w-3.5" />異動
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      onClick={() => setHistoryItem(item)}
                    >
                      <History className="h-3.5 w-3.5" />紀錄
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create / Edit */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯庫存品項" : "新增庫存品項"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
              數量不可直接修改。新增後請使用「庫存異動」登錄進貨或其他異動。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>品牌</Label>
                <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>類別</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>品項 *</Label>
              <Input
                required
                value={form.itemName}
                onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>型號</Label>
                <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>序號</Label>
                <Input
                  value={form.serialNumber}
                  onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>單位</Label>
                <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>倉庫位置</Label>
                <Input
                  value={form.warehouseLocation}
                  onChange={(e) => setForm((f) => ({ ...f, warehouseLocation: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>庫存狀態</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as InventoryStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>進貨成本</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "儲存中…" : "儲存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transaction */}
      <Dialog open={!!txItem} onOpenChange={(o) => !o && setTxItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>庫存異動</DialogTitle>
          </DialogHeader>
          {txItem && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="font-medium">{txItem.itemName}</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  目前數量：{txItem.quantity} {txItem.unit}
                </div>
              </div>
              <div className="space-y-1">
                <Label>異動原因</Label>
                <Select value={txReason} onValueChange={(v) => onReasonChange(v as InventoryTxReason)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_TX_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>異動數量</Label>
                <div className="flex gap-2">
                  {txReason === "盤點調整" && (
                    <Select value={txSign} onValueChange={(v) => setTxSign(v as "+" | "-")}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="+">增加 +</SelectItem>
                        <SelectItem value="-">減少 −</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={txQtyAbs}
                    onChange={(e) => setTxQtyAbs(e.target.value)}
                  />
                </div>
                {txReason !== "盤點調整" && (
                  <p className="text-xs text-muted-foreground">
                    {defaultTxSign(txReason) === 1
                      ? "此原因將增加庫存數量"
                      : "此原因將減少庫存數量"}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>備註</Label>
                <Textarea rows={2} value={txNotes} onChange={(e) => setTxNotes(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTxItem(null)}>
                  取消
                </Button>
                <Button onClick={() => txMut.mutate()} disabled={txMut.isPending}>
                  {txMut.isPending ? "送出中…" : "確認異動"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={!!historyItem} onOpenChange={(o) => !o && setHistoryItem(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>異動紀錄 — {historyItem?.itemName}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : txHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">尚無異動紀錄</p>
          ) : (
            <div className="space-y-2">
              {txHistory.map((tx) => (
                <div key={tx.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{tx.reason}</span>
                    <span
                      className={
                        tx.quantityChange > 0
                          ? "font-mono text-emerald-600"
                          : "font-mono text-destructive"
                      }
                    >
                      {tx.quantityChange > 0 ? "+" : ""}
                      {tx.quantityChange}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(tx.createdAt)}</div>
                  {tx.notes && <div className="text-xs mt-1">{tx.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              將刪除「{deleteTarget?.itemName}」及其所有異動紀錄，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
