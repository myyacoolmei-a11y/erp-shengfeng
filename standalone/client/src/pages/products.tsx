import { useState, useMemo } from "react";
import {
  useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Package, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const WRITE_ROLES = ["super_admin", "owner", "admin"] as const;

const PRESET_BRANDS = ["大金", "日立", "三菱電機", "富士通", "歌林", "LG", "Panasonic", "SAMPO", "東元", "禾聯"];
const PRESET_CATEGORIES = ["分離式冷氣", "窗型冷氣", "多聯式空調", "冷暖氣機", "商用空調", "配件", "耗材", "其他"];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 pb-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</p>
      <Separator className="mt-1" />
    </div>
  );
}

function makeEmpty() {
  return {
    brand: "",
    category: "",
    name: "",
    model: "",
    spec: "",
    unit: "台",
    imageUrl: "",
    isActive: true,
    costPrice: "",
    retailPrice: "",
    wholesalePrice: "",
    minPrice: "",
    taxIncluded: false,
    stockQty: 0,
    safetyStock: "",
    warehouseLocation: "",
    coolingCapacity: "",
    heatingCapacity: "",
    cspf: "",
    energyEfficiency: "",
    voltage: "",
    refrigerant: "",
    warrantyMonths: "",
    notes: "",
  };
}

type PForm = ReturnType<typeof makeEmpty>;

function formFromProduct(p: any): PForm {
  return {
    brand: p.brand ?? "",
    category: p.category ?? "",
    name: p.name ?? "",
    model: p.model ?? "",
    spec: p.spec ?? "",
    unit: p.unit ?? "台",
    imageUrl: p.imageUrl ?? "",
    isActive: p.isActive ?? true,
    costPrice: p.costPrice != null ? String(p.costPrice) : "",
    retailPrice: p.retailPrice != null ? String(p.retailPrice) : "",
    wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
    minPrice: p.minPrice != null ? String(p.minPrice) : "",
    taxIncluded: p.taxIncluded ?? false,
    stockQty: p.stockQty ?? 0,
    safetyStock: p.safetyStock != null ? String(p.safetyStock) : "",
    warehouseLocation: p.warehouseLocation ?? "",
    coolingCapacity: p.coolingCapacity ?? "",
    heatingCapacity: p.heatingCapacity ?? "",
    cspf: p.cspf ?? "",
    energyEfficiency: p.energyEfficiency ?? "",
    voltage: p.voltage ?? "",
    refrigerant: p.refrigerant ?? "",
    warrantyMonths: p.warrantyMonths != null ? String(p.warrantyMonths) : "",
    notes: p.notes ?? "",
  };
}

function buildPayload(f: PForm) {
  return {
    brand: f.brand || undefined,
    category: f.category || undefined,
    name: f.name,
    model: f.model || undefined,
    spec: f.spec || undefined,
    unit: f.unit || undefined,
    imageUrl: f.imageUrl || undefined,
    isActive: f.isActive,
    costPrice: f.costPrice !== "" ? parseFloat(f.costPrice) : null,
    retailPrice: f.retailPrice !== "" ? parseFloat(f.retailPrice) : null,
    wholesalePrice: f.wholesalePrice !== "" ? parseFloat(f.wholesalePrice) : null,
    minPrice: f.minPrice !== "" ? parseFloat(f.minPrice) : null,
    taxIncluded: f.taxIncluded,
    stockQty: f.stockQty,
    safetyStock: f.safetyStock !== "" ? parseInt(f.safetyStock) : null,
    warehouseLocation: f.warehouseLocation || undefined,
    coolingCapacity: f.coolingCapacity || undefined,
    heatingCapacity: f.heatingCapacity || undefined,
    cspf: f.cspf || undefined,
    energyEfficiency: f.energyEfficiency || undefined,
    voltage: f.voltage || undefined,
    refrigerant: f.refrigerant || undefined,
    warrantyMonths: f.warrantyMonths !== "" ? parseInt(f.warrantyMonths) : null,
    notes: f.notes || undefined,
  };
}

const PAGE_SIZE = 20;

export default function Products() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user && WRITE_ROLES.includes(user.role as any);

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("全部");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [activeFilter, setActiveFilter] = useState("全部");
  const [page, setPage] = useState(1);

  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<PForm>(makeEmpty());

  const queryParams = {
    ...(search ? { search } : {}),
    ...(brandFilter !== "全部" ? { brand: brandFilter } : {}),
    ...(categoryFilter !== "全部" ? { category: categoryFilter } : {}),
    ...(activeFilter !== "全部" ? { isActive: activeFilter === "啟用" ? "true" : "false" } : {}),
  };

  const { data: products, isLoading } = useListProducts(queryParams);

  const inv = () => qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
  const createMutation = useCreateProduct({ mutation: { onSuccess: () => { inv(); closeDialog(); toast({ title: "商品已新增" }); } } });
  const updateMutation = useUpdateProduct({ mutation: { onSuccess: () => { inv(); closeDialog(); toast({ title: "商品已更新" }); } } });
  const deleteMutation = useDeleteProduct({ mutation: { onSuccess: () => { inv(); setDeleteId(null); toast({ title: "商品已刪除" }); } } });

  // Derive unique brands/categories from all data (no filter applied)
  const { data: allProducts } = useListProducts({});
  const allBrands = useMemo(() => {
    const s = new Set<string>();
    (allProducts ?? []).forEach(p => { if (p.brand) s.add(p.brand); });
    return Array.from(s).sort();
  }, [allProducts]);
  const allCategories = useMemo(() => {
    const s = new Set<string>();
    (allProducts ?? []).forEach(p => { if (p.category) s.add(p.category); });
    return Array.from(s).sort();
  }, [allProducts]);

  const list = products ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() {
    setForm(makeEmpty());
    setEditItem(null);
    setShowDialog(true);
  }

  function openEdit(p: any) {
    setForm(formFromProduct(p));
    setEditItem(p);
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditItem(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: "請填寫商品名稱", variant: "destructive" }); return; }
    const payload = buildPayload(form) as any;
    if (editItem) updateMutation.mutate({ id: editItem.id, data: payload });
    else createMutation.mutate({ data: payload });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const dialogTitle = editItem ? `編輯商品 ${editItem.productNumber ?? ""}` : "新增商品";

  function fmtPrice(v: string | null | undefined) {
    if (!v) return "—";
    const n = parseFloat(v);
    return isNaN(n) ? "—" : `NT$ ${n.toLocaleString()}`;
  }

  function isLowStock(p: any) {
    return p.safetyStock != null && p.stockQty <= p.safetyStock;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">商品管理</h1>
          <p className="text-sm text-muted-foreground">主商品資料庫・共 {list.length} 筆</p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />新增商品
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="搜尋品牌、商品名稱、型號…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={brandFilter} onValueChange={v => { setBrandFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="品牌" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部">全部品牌</SelectItem>
            {allBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="分類" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部">全部分類</SelectItem>
            {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border overflow-hidden">
          {["全部", "啟用", "停用"].map(s => (
            <button
              key={s}
              onClick={() => { setActiveFilter(s); setPage(1); }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeFilter === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : paged.length === 0 ? (
        <Card><CardContent className="py-14 text-center">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">尚無商品資料</p>
          {canWrite && <Button className="mt-3" size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新增第一項商品</Button>}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {paged.map(p => (
            <Card key={p.id} className={`transition-colors ${!p.isActive ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex gap-4 items-start">
                  {/* Image */}
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt={p.name} className="h-16 w-16 rounded-md object-contain border bg-muted/20 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 items-center mb-1">
                      {p.productNumber && <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{p.productNumber}</span>}
                      {p.category && <Badge variant="outline" className="text-xs">{p.category}</Badge>}
                      <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">{p.isActive ? "啟用" : "停用"}</Badge>
                      {isLowStock(p) && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" />庫存偏低
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      <p className="font-semibold text-base">{p.brand ? `${p.brand} ` : ""}{p.name}</p>
                      {p.model && <span className="text-sm text-muted-foreground">型號：{p.model}</span>}
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-0.5 mt-1 text-sm text-muted-foreground">
                      {p.retailPrice && <span>售價：{fmtPrice(p.retailPrice)}{p.taxIncluded ? "（含稅）" : ""}</span>}
                      {p.wholesalePrice && <span>批發：{fmtPrice(p.wholesalePrice)}</span>}
                      <span>庫存：<span className={isLowStock(p) ? "text-destructive font-medium" : ""}>{p.stockQty} {p.unit ?? "台"}</span>{p.safetyStock != null ? `（安全庫存 ${p.safetyStock}）` : ""}</span>
                      {p.warehouseLocation && <span>位置：{p.warehouseLocation}</span>}
                      {p.spec && <span>規格：{p.spec}</span>}
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="編輯" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="刪除" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 頁</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">

            {/* ── 基本資料 ── */}
            <SectionHeading>基本資料</SectionHeading>
            {editItem?.productNumber && (
              <div className="space-y-1">
                <Label>商品編號</Label>
                <Input value={editItem.productNumber} readOnly className="bg-muted text-muted-foreground font-mono" />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>品牌</Label>
                <Input
                  list="brand-suggestions"
                  placeholder="大金、日立、三菱…"
                  value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                />
                <datalist id="brand-suggestions">
                  {PRESET_BRANDS.map(b => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label>商品分類</Label>
                <Input
                  list="category-suggestions"
                  placeholder="分離式冷氣、商用空調…"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                />
                <datalist id="category-suggestions">
                  {PRESET_CATEGORIES.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>商品名稱 *</Label>
                <Input
                  required
                  placeholder="例：變頻分離式冷暖氣"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>型號</Label>
                <Input placeholder="例：RAS-50NF1" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>規格</Label>
                <Input placeholder="例：5HP / 220V" value={form.spec} onChange={e => setForm(f => ({ ...f, spec: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>單位</Label>
                <Input placeholder="台、組、個" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>商品圖片網址</Label>
                <Input type="url" placeholder="https://…" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
              </div>
              {form.imageUrl && (
                <div className="sm:col-span-2">
                  <img src={form.imageUrl} alt="預覽" className="h-24 rounded-md object-contain border bg-muted/20" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                />
                <Label htmlFor="isActive">啟用此商品</Label>
              </div>
            </div>

            {/* ── 價格 ── */}
            <SectionHeading>價格</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>成本</Label>
                <Input type="number" min="0" step="1" placeholder="0" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>一般售價</Label>
                <Input type="number" min="0" step="1" placeholder="0" value={form.retailPrice} onChange={e => setForm(f => ({ ...f, retailPrice: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>批發價</Label>
                <Input type="number" min="0" step="1" placeholder="0" value={form.wholesalePrice} onChange={e => setForm(f => ({ ...f, wholesalePrice: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>最低售價</Label>
                <Input type="number" min="0" step="1" placeholder="0" value={form.minPrice} onChange={e => setForm(f => ({ ...f, minPrice: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="taxIncluded"
                checked={form.taxIncluded}
                onCheckedChange={v => setForm(f => ({ ...f, taxIncluded: v }))}
              />
              <Label htmlFor="taxIncluded">價格已含稅（含 5% 營業稅）</Label>
            </div>

            {/* ── 庫存 ── */}
            <SectionHeading>庫存</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>目前庫存</Label>
                <Input type="number" min="0" step="1" placeholder="0" value={form.stockQty} onChange={e => setForm(f => ({ ...f, stockQty: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <Label>安全庫存</Label>
                <Input type="number" min="0" step="1" placeholder="未設定" value={form.safetyStock} onChange={e => setForm(f => ({ ...f, safetyStock: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>倉庫位置</Label>
                <Input placeholder="例：A3-2" value={form.warehouseLocation} onChange={e => setForm(f => ({ ...f, warehouseLocation: e.target.value }))} />
              </div>
            </div>

            {/* ── 冷氣規格 ── */}
            <SectionHeading>冷氣規格</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>冷房能力</Label>
                <Input placeholder="例：5.0 kW" value={form.coolingCapacity} onChange={e => setForm(f => ({ ...f, coolingCapacity: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>暖房能力</Label>
                <Input placeholder="例：5.5 kW" value={form.heatingCapacity} onChange={e => setForm(f => ({ ...f, heatingCapacity: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>CSPF</Label>
                <Input placeholder="例：4.51" value={form.cspf} onChange={e => setForm(f => ({ ...f, cspf: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>能源效率</Label>
                <Input placeholder="例：一級" value={form.energyEfficiency} onChange={e => setForm(f => ({ ...f, energyEfficiency: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>電壓</Label>
                <Input placeholder="例：220V / 單相" value={form.voltage} onChange={e => setForm(f => ({ ...f, voltage: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>冷媒</Label>
                <Input placeholder="例：R-32" value={form.refrigerant} onChange={e => setForm(f => ({ ...f, refrigerant: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>保固（月）</Label>
                <Input type="number" min="0" step="1" placeholder="例：24" value={form.warrantyMonths} onChange={e => setForm(f => ({ ...f, warrantyMonths: e.target.value }))} />
              </div>
            </div>

            {/* ── 其他 ── */}
            <SectionHeading>其他</SectionHeading>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea rows={3} placeholder="其他說明…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={closeDialog}>取消</Button>
              <Button type="submit" disabled={isPending}>
                {editItem ? "儲存" : "新增商品"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除這筆商品資料嗎？此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
