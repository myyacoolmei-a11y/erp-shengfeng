import { useState } from "react";
import { Link } from "wouter";
import { useListProducts } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, ExternalLink, AlertTriangle } from "lucide-react";

function fmtPrice(v: string | null | undefined) {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `NT$${n.toLocaleString()}`;
}

export default function WholesaleProducts() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("啟用");

  const { data: products, isLoading } = useListProducts({
    ...(search ? { search } : {}),
    isActive: activeFilter !== "全部" ? (activeFilter === "啟用" ? "true" : "false") : undefined,
  });

  const list = products ?? [];

  function isLowStock(p: any) {
    return p.safetyStock != null && p.stockQty <= p.safetyStock;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">批發商品</h1>
          <p className="text-sm text-muted-foreground">共 {list.length} 筆・價格資料來自商品管理</p>
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
                  <th className="text-right p-3 font-medium">成本</th>
                  <th className="text-right p-3 font-medium">批發價</th>
                  <th className="text-right p-3 font-medium">零售價</th>
                  <th className="text-right p-3 font-medium">庫存</th>
                  <th className="text-center p-3 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    尚無商品資料，請至商品管理新增
                  </td></tr>
                ) : list.map((p: any) => (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/30 ${!p.isActive ? "opacity-50" : ""}`}>
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
                    </td>
                    <td className="p-3 text-muted-foreground">{p.brand ?? "—"}</td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{p.model ?? "—"}</td>
                    <td className="p-3 text-right font-mono text-xs">{fmtPrice(p.costPrice)}</td>
                    <td className="p-3 text-right font-mono text-xs font-medium">{fmtPrice(p.wholesalePrice)}</td>
                    <td className="p-3 text-right font-mono text-xs">{fmtPrice(p.retailPrice)}</td>
                    <td className="p-3 text-right">
                      <span className={isLowStock(p) ? "text-destructive font-medium flex items-center justify-end gap-1" : ""}>
                        {isLowStock(p) && <AlertTriangle className="h-3 w-3" />}
                        {p.stockQty} {p.unit ?? "台"}
                      </span>
                      {p.safetyStock != null && <div className="text-xs text-muted-foreground">安全：{p.safetyStock}</div>}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">
                        {p.isActive ? "啟用" : "停用"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
