import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth, userHasFeature } from "@/contexts/auth-context";
import { listInventoryItems } from "@/lib/inventoryApi";
import { customFetch } from "../../../shared/api-client/custom-fetch";
import { getListWorkOrdersQueryKey } from "@workspace/api-client-react";

type ShipmentLine = {id:number; productName:string|null; brand:string|null; model:string|null; shipQty:number; inventoryDeductedAt:string|null};
type HistoryLine = {id:number;inventoryItemId:number;quantityChange:number;notes:string|null;occurredAt:string|null;createdAt:string;brand:string|null;itemName:string|null;model:string|null;serialNumber:string|null;unit:string|null};
type Shipment = {wholesale:boolean; parent:boolean; confirmed:boolean; lines:ShipmentLine[]; history:HistoryLine[]};
function ShipmentHistory({history,parent=false}:{history:HistoryLine[];parent?:boolean}) {
  return <div className="space-y-2"><div className="flex items-center justify-between"><span className="font-semibold">{parent?"原批發單出貨紀錄":"實際庫存出貨紀錄"}</span><span className="text-xs text-muted-foreground">{history.length} 筆明細</span></div>{history.length===0?<p className="text-xs text-muted-foreground">尚無此單的庫存出貨紀錄</p>:history.map(h=><div key={h.id} className="rounded border p-2 text-xs"><div className="flex justify-between gap-2"><span className="font-medium">{[h.brand,h.itemName,h.model].filter(Boolean).join(" ")||`品項 #${h.inventoryItemId}`}</span><span className="shrink-0 font-semibold">出貨 {Math.abs(h.quantityChange)} {h.unit||""}</span></div><div className="text-muted-foreground mt-1">{new Date(h.occurredAt||h.createdAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false})}{h.serialNumber?` ｜序號 ${h.serialNumber}`:""}</div></div>)}</div>;
}
export function StockShipmentHistory({id}:{id:number}) {
  const {user}=useAuth(); const allowed=userHasFeature(user,"inventory");
  const detail=useQuery({queryKey:["stock-shipment",id],queryFn:()=>customFetch<Shipment>(`/api/work-orders/${id}/stock-shipment`),enabled:allowed,staleTime:0});
  if(!allowed)return null;
  return <div className="rounded-lg border bg-muted/20 p-3 text-sm">{detail.isLoading?"讀取出貨紀錄…":detail.isError?<div>無法讀取出貨紀錄 <Button size="sm" variant="ghost" onClick={()=>detail.refetch()}>重試</Button></div>:<ShipmentHistory history={detail.data?.history||[]} parent={detail.data?.parent}/>}</div>;
}
export function StockShipmentButton({id, wholesale=false, onConfirmed}:{id:number;wholesale?:boolean;onConfirmed?:()=>void}) {
  const {user}=useAuth(); const {toast}=useToast(); const qc=useQueryClient();
  const [requestId,setRequestId]=useState("");
  const [open,setOpen]=useState(false); const [search,setSearch]=useState("");
  const [rows,setRows]=useState([{inventoryItemId:0,quantity:1}]); const [picks,setPicks]=useState<Record<number,number>>({});
  const path=`/api/work-orders/${id}/stock-shipment`;
  const detail=useQuery({queryKey:["stock-shipment",id],queryFn:()=>customFetch<Shipment>(path),enabled:open,staleTime:0});
  const inventory=useQuery({queryKey:["inventory-items","shipment-picker"],queryFn:()=>listInventoryItems(),enabled:open,staleTime:0});
  const data=detail.data; const lines=(data?.lines||[]).filter(l=>!l.inventoryDeductedAt);
  const items=(inventory.data||[]).filter(i=>["庫存中","待出貨"].includes(i.status));
  const filtered=items.filter(i=>[i.brand,i.model,i.itemName].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const selected=(id:number)=>items.find(i=>Number(i.id)===id);
  const selectOptions=(id:number)=>([...filtered,...(id&&!filtered.some(i=>i.id===id)&&selected(id)?[selected(id)!]:[])]).map(i=><option key={i.id} value={i.id}>{[i.brand,i.itemName,i.model].filter(Boolean).join(" ")}｜剩 {i.quantity} {i.unit}</option>);
  const mutation=useMutation({mutationFn:()=>customFetch<{alreadyConfirmed:boolean}>(wholesale?`/api/work-orders/${id}/confirm-delivery`:path,{method:"POST",body:JSON.stringify(wholesale?{selections:lines.map(l=>({lineId:l.id,inventoryItemId:picks[l.id]}))}:{items:rows,requestId})}),onSuccess:()=>{qc.invalidateQueries({queryKey:["inventory-items"]});qc.invalidateQueries({queryKey:["inventory-transactions"]});qc.invalidateQueries({queryKey:["stock-shipment",id]});qc.invalidateQueries({queryKey:getListWorkOrdersQueryKey()});qc.invalidateQueries();toast({title:"出貨確認完成，庫存已更新"});setOpen(false);onConfirmed?.();},onError:(e:any)=>toast({title:"出貨失敗",description:e?.data?.error||e?.message,variant:"destructive"})});
  const valid=wholesale?lines.length>0&&lines.every(l=>!!picks[l.id]):!!requestId&&rows.length>0&&rows.every(r=>r.inventoryItemId>0&&Number.isInteger(r.quantity)&&r.quantity>0);
  if(!userHasFeature(user,"inventory")) return null;
  return <><Button type="button" size="sm" variant="outline" onClick={()=>{setRequestId(crypto.randomUUID());setSearch("");setRows([{inventoryItemId:0,quantity:1}]);setPicks({});setOpen(true);}}>{data?.history.length&&!wholesale?"追加出貨":"庫存出貨"}</Button>
  <Dialog open={open} onOpenChange={v=>{if(!mutation.isPending)setOpen(v);}}><DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>確認庫存出貨（新版）</DialogTitle></DialogHeader>
  {detail.isLoading||inventory.isLoading?<p>載入中…</p>:detail.isError||inventory.isError?<p className="text-destructive">無法讀取出貨資料，請重新開啟。</p>:wholesale&&data?.confirmed?<div>此單已確認出貨，不會再次扣庫存。<ShipmentHistory history={data.history}/></div>:data?.parent?<p>此安裝工單已連結批發出貨，請至原出貨單操作。</p>:<div className="space-y-3"><p className="text-sm text-muted-foreground">選擇本次實際出貨的庫存品項。庫存不足不會出貨。</p>{!!data?.history.length&&<ShipmentHistory history={data.history}/>}<Input placeholder="搜尋品牌、型號、品項" value={search} onChange={e=>setSearch(e.target.value)}/>
  {wholesale?lines.map(l=><div key={l.id} className="space-y-1"><p className="text-sm font-medium">{l.brand} {l.productName} {l.model} × {l.shipQty}</p><select className="w-full border rounded p-2 bg-background text-sm" value={picks[l.id]||0} onChange={e=>setPicks(p=>({...p,[l.id]:Number(e.target.value)}))}><option value={0}>選擇庫存品項</option>{selectOptions(picks[l.id]||0)}</select></div>):rows.map((r,i)=><div key={i} className="flex gap-2 items-center"><select aria-label="庫存品項" className="min-w-0 flex-1 border rounded p-2 bg-background text-sm" value={r.inventoryItemId} onChange={e=>setRows(a=>a.map((x,j)=>j===i?{...x,inventoryItemId:Number(e.target.value)}:x))}><option value={0}>選擇庫存品項</option>{selectOptions(r.inventoryItemId)}</select><Input aria-label="出貨數量" className="w-20" type="number" min={1} step={1} value={r.quantity} onChange={e=>setRows(a=>a.map((x,j)=>j===i?{...x,quantity:Number(e.target.value)}:x))}/><Button type="button" variant="ghost" disabled={rows.length===1} onClick={()=>setRows(a=>a.filter((_,j)=>j!==i))}>移除</Button></div>)}
  {!wholesale&&<Button type="button" variant="outline" onClick={()=>setRows(a=>[...a,{inventoryItemId:0,quantity:1}])}>＋ 新增設備</Button>}
  <DialogFooter><Button type="button" disabled={!valid||mutation.isPending} onClick={()=>{if(window.confirm("確定實際出貨並扣除庫存？"))mutation.mutate();}}>{mutation.isPending?"處理中…":"確認出貨・扣庫存"}</Button></DialogFooter></div>}</DialogContent></Dialog></>;
}
