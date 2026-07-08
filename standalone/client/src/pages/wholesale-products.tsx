import { useState } from "react";
import { Link } from "wouter";
import {
  useListWholesaleProducts,
  useUpdateWholesaleProduct,
  getListWholesaleProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, Package, ExternalLink, Pencil, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const WRITE_ROLES = ["super_admin", "owner", "admin"] as const;

function fmtPrice(v: string | number | null | undefined) {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? "—" : `NT$${n.toLocaleString()}`;
}

export default function WholesaleProducts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user && WRITE_ROLES.includes(user.role as any);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("啟用");
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({
    wholesalePrice: "",
    minQuantity: "1",
    wholesaleNote: "",
    isEnabled: true,
    sortOrder: "0",
  });

  const queryParams = {
    ...(search ? { search } : {}),
    ...(activeFilter === "啟用" ? { isEnabled: "true" } : activeFilter === "停用" ? { isEnabled: "false" } : {}),
  };

  const { data: products, isLoading } = useListWholesaleProducts(queryParams);
  const updateMutation = useUpdateWholesaleProduct({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListWholesaleProductsQueryKey() });
        setEditItem(null);
        toast({ title: "批發設定已更新" });
      },
    },
  });

  const list = products ?? [];

  function openEdit(p: any) {
    setEditItem(p);
    setForm({
      wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
      minQuantity: String(p.minQuantity ?? 1),
      wholesaleNote: p.wholesaleNote ?? "",
      isEnabled: p.isEnabled ?? true,
      sortOrder: String(p.sortOrder ?? 0),
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    updateMutation.mutate({
      productId: editItem.id,
      data: {
        wholesalePrice: form.wholesalePrice !== "" ? parseFloat(form.wholesalePrice) : null,
        minQuantity: parseInt(form.minQuantity) || 1,
        wholesaleNote: form.wholesaleNote || null,
        isEnabled: form.isEnabled,
        sortOrder: parseInt(form.sortOrder) || 0,
      },
    });
  }

  function isLowStock(p: any) {
    return p.safetyStock != null && p.stockQty <= p.safetyStock;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發商品</h1>
          <p className="text-sm text-muted-foreground">共 {list.length} 筆・主檔來自商品管理，此處僅管理批發設定</p>
        </div>
        <Link href="/products">
          <Button variant="outline" className="shrink-0 gap-1.5">
            <ExternalLink className="h-4 w-4" />前往商品管理
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="搜尋品牌、名稱、型號…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-md border overflow-hidden">
          {["全部", "啟用", "停用"].map(s => (
            <button key={s} onClick={() => setActiveFilter(s)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeFilter === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left p-3 font-medium">商品名稱</th>
                  <th className="text-left p-3 font-medium">品牌</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">型號</th>
                  <th className="text-right p-3 font-medium">批發價</th>
                  <th className="text-right p-3 font-medium">一般單價</th>
                  <th className="text-right p-3 font-medium">最小量</th>
                  <th className="text-right p-3 font-medium">庫存</th>
                  <th className="text-center p-3 font-medium">狀態</th>
                  {canWrite && <th className="p-3 w-10" />}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr><td colSpan={canWrite ? 9 : 8} className="text-center py-12 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    尚無批發商品，請至商品管理勾選「批發銷售」用途
                  </td></tr>
                ) : list.map((p: any) => (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/30 ${!p.isEnabled ? "opacity-50" : ""}`}>
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
                    </td>
                    <td className="p-3 text-muted-foreground">{p.brand ?? "—"}</td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{p.model ?? "—"}</td>
                    <td className="p-3 text-right font-mono text-xs font-medium">{fmtPrice(p.wholesalePrice ?? p.effectivePrice)}</td>
                    <td className="p-3 text-right font-mono text-xs">{fmtPrice(p.retailPrice)}</td>
                    <td className="p-3 text-right">{p.minQuantity}</td>
                    <td className="p-3 text-right">
                      <span className={isLowStock(p) ? "text-destructive font-medium flex items-center justify-end gap-1" : ""}>
                        {isLowStock(p) && <AlertTriangle className="h-3 w-3" />}
                        {p.stockQty} {p.unit ?? "台"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={p.isEnabled ? "default" : "secondary"} className="text-xs">
                        {p.isEnabled ? "啟用" : "停用"}
                      </Badge>
                    </td>
                    {canWrite && (
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>編輯批發設定</DialogTitle></DialogHeader>
          {editItem && (
            <form onSubmit={handleSave} className="space-y-3">
              <p className="text-sm font-medium">{editItem.brand ? `${editItem.brand} ` : ""}{editItem.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>批發價</Label>
                  <Input type="number" min="0" value={form.wholesalePrice}
                    onChange={e => setForm(f => ({ ...f, wholesalePrice: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>最小數量</Label>
                  <Input type="number" min="1" value={form.minQuantity}
                    onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>排序</Label>
                  <Input type="number" min="0" value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={form.isEnabled} onCheckedChange={v => setForm(f => ({ ...f, isEnabled: v }))} />
                  <Label>啟用於批發</Label>
                </div>
              </div>
              <div className="space-y-1">
                <Label>批發備註</Label>
                <Textarea rows={2} value={form.wholesaleNote}
                  onChange={e => setForm(f => ({ ...f, wholesaleNote: e.target.value }))} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditItem(null)}>取消</Button>
                <Button type="submit" disabled={updateMutation.isPending}>儲存</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
