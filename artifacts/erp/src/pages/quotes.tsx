import { useState } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListQuotes, useCreateQuote, useUpdateQuote, useDeleteQuote,
  useListCustomers, useCreateWorkOrder,
  getListQuotesQueryKey, getListWorkOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Printer, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["草稿", "已送出", "已接受", "已拒絕", "已完成"];
const STATUS_COLORS: Record<string, string> = {
  "草稿": "bg-gray-100 text-gray-700",
  "已送出": "bg-blue-100 text-blue-700",
  "已接受": "bg-green-100 text-green-700",
  "已拒絕": "bg-red-100 text-red-700",
  "已完成": "bg-emerald-100 text-emerald-700",
};

function printQuote(quote: any) {
  const d = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const quoteNo = `Q-${ymd}-${String(quote.id).padStart(4, "0")}`;
  const quoteDate = d.toLocaleDateString("zh-TW");
  const validDate = new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("zh-TW");
  const printDate = new Date().toLocaleDateString("zh-TW");
  const logoUrl = `${window.location.origin}/logo.png`;
  const baseAmt = Number(quote.amount ?? 0);
  const discAmt = Number(quote.discountAmount ?? 0);
  const finalAmt = Number(quote.finalAmount ?? quote.amount ?? 0);
  const fmt = (n: number) => n > 0 ? `NT$ ${n.toLocaleString()}` : "—";
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const statusStamp = (() => {
    const map: Record<string, [string, string]> = {
      "已接受": ["ACCEPTED", "rgba(22,163,74,0.10)"],
      "已完成": ["COMPLETED", "rgba(22,163,74,0.10)"],
      "已拒絕": ["REJECTED", "rgba(220,38,38,0.10)"],
    };
    const entry = map[quote.status];
    return entry
      ? `<div style="position:fixed;top:38%;left:18%;transform:rotate(-28deg);font-size:52pt;font-weight:900;color:${entry[1]};pointer-events:none;white-space:nowrap;letter-spacing:8px;z-index:0">${entry[0]}</div>`
      : "";
  })();

  const notesRows = (quote.notes ?? "")
    .split(/\n/)
    .filter((l: string) => l.trim())
    .map((l: string, i: number) => `<div class="note-row"><span class="note-num">${i + 1}.</span><span>${esc(l.replace(/^\d+[.)、．]\s*/, ""))}</span></div>`)
    .join("") || `<div class="note-row"><span class="note-num">1.</span><span>報價單有效期限為 30 日</span></div>
<div class="note-row"><span class="note-num">2.</span><span>報價已含安裝施工費用</span></div>
<div class="note-row"><span class="note-num">3.</span><span>施工前請確認現場電源容量是否充足</span></div>
<div class="note-row"><span class="note-num">4.</span><span>施工前須支付 50% 訂金，完工驗收後付尾款</span></div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>報價單 ${quoteNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei','微軟正黑體',Arial,sans-serif;font-size:10pt;color:#111;background:#fff;position:relative}
@page{size:A4;margin:14mm 14mm 22mm 14mm}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .no-print{display:none!important}
  .page-footer{position:fixed;bottom:0;left:0;right:0}
}
.wrap{max-width:182mm;margin:0 auto;padding:0}

/* ── S1 Brand ── */
.brand-hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:5mm;border-bottom:3px solid #9ACD32;margin-bottom:6mm}
.brand-l{display:flex;align-items:center;gap:4mm}
.brand-logo{width:18mm;height:18mm;border-radius:50%;object-fit:cover;border:2px solid #9ACD32}
.brand-name{font-size:19pt;font-weight:900;color:#111;letter-spacing:1px;line-height:1.1}
.brand-sub{font-size:8pt;color:#555;margin-top:1.5mm;letter-spacing:1px}
.doc-r{text-align:right}
.doc-type{font-size:26pt;font-weight:900;color:#9ACD32;letter-spacing:10px;line-height:1}
.doc-type-en{font-size:9pt;color:#888;letter-spacing:3px;margin-top:0.5mm}
.doc-no{font-size:10.5pt;font-weight:700;font-family:monospace;color:#111;margin-top:2.5mm}
.doc-meta{font-size:8.5pt;color:#555;margin-top:1mm;line-height:1.7}

/* ── S2 Client ── */
.section{margin-bottom:6mm;page-break-inside:avoid}
.sec-title{font-size:8pt;font-weight:700;background:#111;color:#9ACD32;padding:1.5mm 4mm;letter-spacing:3px;text-transform:uppercase;margin-bottom:3mm}
.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 10mm}
.c-row{display:flex;align-items:baseline;gap:2mm;padding:1.2mm 0;border-bottom:1px dotted #ddd}
.c-lbl{font-size:8pt;color:#777;min-width:18mm;flex-shrink:0}
.c-val{font-size:9.5pt;font-weight:600;color:#111;flex:1}

/* ── Tables ── */
table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:2mm}
thead tr{background:#111}
thead th{color:#9ACD32;padding:2.2mm 2mm;text-align:center;font-weight:700;font-size:8pt;white-space:nowrap;border-right:1px solid #333}
thead th:last-child{border-right:none}
tbody tr:nth-child(even){background:#f8f8f8}
tbody td{padding:2mm 2mm;text-align:center;border-bottom:1px solid #e8e8e8;color:#111;vertical-align:middle}
tbody td.tdl{text-align:left}
tbody tr:last-child td{border-bottom:2px solid #9ACD32}
tfoot td{padding:2mm 2mm;text-align:right;font-size:8pt;color:#666;border-top:1px solid #ddd}

/* ── S7 Amount ── */
.amt-wrap{display:flex;justify-content:flex-end;margin-bottom:6mm;page-break-inside:avoid}
.amt-box{width:90mm;border:2px solid #9ACD32;border-radius:1mm;overflow:hidden}
.amt-row{display:flex;justify-content:space-between;padding:2.2mm 5mm;border-bottom:1px solid #e8e8e8;font-size:9.5pt}
.amt-lbl{color:#666}
.amt-val{font-weight:600;color:#111}
.amt-disc .amt-val{color:#e53e3e}
.amt-total{background:#111;padding:4mm 5mm;border-bottom:none}
.amt-total .amt-lbl{color:#9ACD32;font-size:11pt;font-weight:900;letter-spacing:2px}
.amt-total .amt-val{color:#fff;font-size:16pt;font-weight:900;font-family:monospace}

/* ── S6 Description ── */
.desc-block{border:1px solid #e0e0e0;border-left:4px solid #9ACD32;padding:4mm 5mm;min-height:22mm;font-size:9.5pt;white-space:pre-wrap;line-height:1.7;color:#333;background:#fafafa}

/* ── S8 Notes ── */
.note-row{display:flex;gap:2mm;padding:1.5mm 0;border-bottom:1px dotted #eee;font-size:9pt;line-height:1.5}
.note-num{color:#9ACD32;font-weight:700;min-width:5mm;flex-shrink:0}

/* ── S9 Signatures ── */
.sig-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm;margin-top:3mm;page-break-inside:avoid}
.sig-box{border:1px solid #ccc;border-radius:1mm;padding:2mm;min-height:30mm;display:flex;flex-direction:column}
.sig-area{flex:1}
.sig-lbl{font-size:8pt;color:#555;border-top:1.5px solid #999;padding-top:1.5mm;text-align:center;margin-top:auto}
.sig-date{font-size:7.5pt;color:#aaa;text-align:center;margin-top:1mm}

/* ── S10 Footer ── */
.page-footer{border-top:2.5px solid #9ACD32;padding-top:3.5mm;margin-top:6mm;display:flex;justify-content:space-between;align-items:flex-start;background:#fff}
.footer-l{display:flex;align-items:center;gap:3mm}
.footer-logo{width:10mm;height:10mm;border-radius:50%;object-fit:cover;border:1.5px solid #9ACD32;flex-shrink:0}
.footer-info{font-size:7.5pt;color:#666;line-height:1.7}
.footer-info strong{color:#111;font-size:8pt}

/* ── Print btn ── */
.print-btn{position:fixed;top:10mm;right:10mm;background:#9ACD32;color:#111;border:none;padding:6px 18px;font-size:10pt;font-weight:700;cursor:pointer;border-radius:2px;z-index:100}
.print-btn:hover{background:#7db220}
</style>
</head>
<body>
${statusStamp}
<button class="print-btn no-print" onclick="window.print()">列印 / PDF</button>

<div class="wrap">

<!-- ══ S1 品牌區 ══ -->
<div class="brand-hdr">
  <div class="brand-l">
    <img src="${logoUrl}" class="brand-logo" alt="">
    <div>
      <div class="brand-name">晟風工程有限公司</div>
      <div class="brand-sub">冷氣安裝｜保養｜維修｜設計</div>
    </div>
  </div>
  <div class="doc-r">
    <div class="doc-type">報價單</div>
    <div class="doc-type-en">QUOTATION</div>
    <div class="doc-no">${quoteNo}</div>
    <div class="doc-meta">
      報價日期：${quoteDate}<br>
      列印日期：${printDate}<br>
      有效期限：${validDate}
    </div>
  </div>
</div>

<!-- ══ S2 客戶資訊 ══ -->
<div class="section">
  <div class="sec-title">▌ 客戶資訊　Client Information</div>
  <div class="client-grid">
    <div class="c-row"><span class="c-lbl">客戶名稱</span><span class="c-val">${esc(quote.customerName) || "—"}</span></div>
    <div class="c-row"><span class="c-lbl">工程名稱</span><span class="c-val">${esc(quote.title) || "—"}</span></div>
    <div class="c-row"><span class="c-lbl">聯絡人</span><span class="c-val">　</span></div>
    <div class="c-row"><span class="c-lbl">付款方式</span><span class="c-val">　</span></div>
    <div class="c-row"><span class="c-lbl">電話</span><span class="c-val">　</span></div>
    <div class="c-row"><span class="c-lbl">付款條件</span><span class="c-val">　</span></div>
    <div class="c-row"><span class="c-lbl">Email</span><span class="c-val">　</span></div>
    <div class="c-row"><span class="c-lbl">統一編號</span><span class="c-val">　</span></div>
    <div class="c-row" style="grid-column:span 2"><span class="c-lbl">施工地址</span><span class="c-val">　</span></div>
  </div>
</div>

<!-- ══ S3 工程設備明細 ══ -->
<div class="section">
  <div class="sec-title">▌ 工程設備明細　Equipment Schedule</div>
  <table>
    <thead>
      <tr>
        <th style="width:7mm">項次</th>
        <th style="width:16mm">品牌</th>
        <th>品名</th>
        <th style="width:22mm">型號</th>
        <th style="width:16mm">能力</th>
        <th style="width:10mm">數量</th>
        <th style="width:10mm">單位</th>
        <th style="width:20mm">單價</th>
        <th style="width:14mm">折扣</th>
        <th style="width:22mm">小計</th>
        <th style="width:20mm">備註</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td></td>
        <td class="tdl">${esc(quote.title)}</td>
        <td></td>
        <td></td>
        <td>1</td>
        <td>式</td>
        <td>${baseAmt > 0 ? `NT$ ${baseAmt.toLocaleString()}` : ""}</td>
        <td>${discAmt > 0 ? `NT$ ${discAmt.toLocaleString()}` : "—"}</td>
        <td>${baseAmt > 0 ? `NT$ ${(baseAmt - discAmt).toLocaleString()}` : ""}</td>
        <td></td>
      </tr>
      <tr><td>2</td><td></td><td class="tdl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>3</td><td></td><td class="tdl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>4</td><td></td><td class="tdl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>5</td><td></td><td class="tdl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
    <tfoot>
      <tr><td colspan="11" style="text-align:right;color:#777;font-size:8pt;padding:2mm 2mm">以下空白</td></tr>
    </tfoot>
  </table>
</div>

<!-- ══ S4 追加材料 ══ -->
<div class="section">
  <div class="sec-title">▌ 追加材料　Additional Materials</div>
  <table>
    <thead>
      <tr>
        <th style="width:7mm">項次</th>
        <th>材料名稱</th>
        <th style="width:16mm">規格</th>
        <th style="width:12mm">數量</th>
        <th style="width:12mm">單位</th>
        <th style="width:22mm">單價</th>
        <th style="width:22mm">小計</th>
        <th style="width:25mm">備註</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>1</td><td class="tdl">銅管</td><td></td><td></td><td>尺</td><td></td><td></td><td></td></tr>
      <tr><td>2</td><td class="tdl">冷媒補充</td><td></td><td></td><td>磅</td><td></td><td></td><td></td></tr>
      <tr><td>3</td><td class="tdl">控制線</td><td></td><td></td><td>尺</td><td></td><td></td><td></td></tr>
      <tr><td>4</td><td class="tdl">排水管</td><td></td><td></td><td>尺</td><td></td><td></td><td></td></tr>
      <tr><td>5</td><td class="tdl">電源線</td><td></td><td></td><td>尺</td><td></td><td></td><td></td></tr>
      <tr><td>6</td><td class="tdl">吊車 / 高空車</td><td></td><td></td><td>次</td><td></td><td></td><td></td></tr>
      <tr><td>7</td><td class="tdl">洗孔</td><td></td><td></td><td>孔</td><td></td><td></td><td></td></tr>
      <tr><td>8</td><td class="tdl">拆除舊機</td><td></td><td></td><td>台</td><td></td><td></td><td></td></tr>
    </tbody>
    <tfoot>
      <tr><td colspan="8" style="text-align:right;color:#777;font-size:8pt;padding:2mm 2mm">以下空白</td></tr>
    </tfoot>
  </table>
</div>

<!-- ══ S5 免費贈送 ══ -->
<div class="section">
  <div class="sec-title">▌ 免費贈送項目　Complimentary Items</div>
  <table>
    <thead>
      <tr>
        <th style="width:7mm">項次</th>
        <th>贈送項目</th>
        <th style="width:16mm">數量</th>
        <th style="width:16mm">單位</th>
        <th>備註</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>1</td><td class="tdl">延長保固</td><td></td><td>年</td><td class="tdl"></td></tr>
      <tr><td>2</td><td class="tdl">室外機固定架</td><td></td><td>組</td><td class="tdl"></td></tr>
      <tr><td>3</td><td class="tdl">遙控器</td><td></td><td>支</td><td class="tdl"></td></tr>
      <tr><td>4</td><td class="tdl">免費保養</td><td></td><td>次</td><td class="tdl"></td></tr>
    </tbody>
    <tfoot>
      <tr><td colspan="5" style="text-align:right;color:#777;font-size:8pt;padding:2mm 2mm">以下空白</td></tr>
    </tfoot>
  </table>
</div>

<!-- ══ S6 工程說明 ══ -->
<div class="section">
  <div class="sec-title">▌ 工程說明　Scope of Work</div>
  <div class="desc-block">${esc(quote.description) || "施工方式：\n特殊施工說明：\n施工天數：\n注意事項：\n停車位置：\n施工限制：\n"}</div>
</div>

<!-- ══ S7 金額統計 ══ -->
<div class="section amt-wrap">
  <div class="amt-box">
    <div class="amt-row"><span class="amt-lbl">報價金額</span><span class="amt-val">${fmt(baseAmt)}</span></div>
    ${discAmt > 0 ? `<div class="amt-row amt-disc"><span class="amt-lbl">折扣優惠</span><span class="amt-val">－ NT$ ${discAmt.toLocaleString()}</span></div>` : ""}
    <div class="amt-row"><span class="amt-lbl">未稅金額</span><span class="amt-val">${fmt(Math.round(finalAmt / 1.05))}</span></div>
    <div class="amt-row"><span class="amt-lbl">稅額（5%）</span><span class="amt-val">${fmt(Math.round(finalAmt - finalAmt / 1.05))}</span></div>
    <div class="amt-row amt-total">
      <span class="amt-lbl">工程總價</span>
      <span class="amt-val">NT$ ${finalAmt.toLocaleString()}</span>
    </div>
  </div>
</div>

<!-- ══ S8 注意事項 ══ -->
<div class="section">
  <div class="sec-title">▌ 注意事項　Terms &amp; Conditions</div>
  ${notesRows}
</div>

<!-- ══ S9 簽名 ══ -->
<div class="section">
  <div class="sec-title">▌ 確認簽署　Authorization</div>
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-area"></div>
      <div class="sig-lbl">客戶簽名</div>
      <div class="sig-date">日期：＿＿＿＿＿＿</div>
    </div>
    <div class="sig-box">
      <div class="sig-area"></div>
      <div class="sig-lbl">業務簽名</div>
      <div class="sig-date">日期：＿＿＿＿＿＿</div>
    </div>
    <div class="sig-box">
      <div class="sig-area"></div>
      <div class="sig-lbl">業務主管</div>
      <div class="sig-date">日期：＿＿＿＿＿＿</div>
    </div>
    <div class="sig-box">
      <div class="sig-area"></div>
      <div class="sig-lbl">公　司　章</div>
      <div class="sig-date">&nbsp;</div>
    </div>
  </div>
</div>

</div><!-- /wrap -->

<!-- ══ S10 Footer ══ -->
<div class="page-footer">
  <div class="footer-l">
    <img src="${logoUrl}" class="footer-logo" alt="">
    <div class="footer-info">
      <strong>晟風工程有限公司</strong><br>
      Tel：0955-980-738　LINE：@cf-aircon<br>
      Email：service@cf-aircon.com.tw<br>
      地址：台灣
    </div>
  </div>
  <div class="footer-info" style="text-align:right;font-size:7.5pt;color:#aaa">
    本報價單由晟風工程 ERP 系統產生<br>
    列印日期：${printDate}
  </div>
</div>

<script>
(function(){
  // delay to ensure images load
  var imgs = document.querySelectorAll('img');
  var loaded = 0;
  if(imgs.length === 0){ return; }
  imgs.forEach(function(img){
    if(img.complete){ loaded++; if(loaded===imgs.length) return; }
    else { img.addEventListener('load', function(){ loaded++; }); img.addEventListener('error', function(){ loaded++; }); }
  });
})();
</script>
</body></html>`;

  const w = window.open("", "_blank", "width=960,height=1200");
  if (w) { w.document.write(html); w.document.close(); }
}

export default function Quotes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [convertItem, setConvertItem] = useState<any>(null);
  const [woForm, setWoForm] = useState({ assignedTo: "", scheduledDate: "", notes: "" });

  const { data: quotes, isLoading } = useListQuotes({
    ...(filterCustomerId ? { customerId: filterCustomerId } : {}),
    ...(statusFilter !== "全部" ? { status: statusFilter } : {}),
  });
  const { data: customers } = useListCustomers({});

  const createMutation = useCreateQuote({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setShowCreate(false); toast({ title: "報價單已新增" }); } } });
  const updateMutation = useUpdateQuote({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setEditItem(null); toast({ title: "報價單已更新" }); } } });
  const deleteMutation = useDeleteQuote({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setDeleteId(null); toast({ title: "報價單已刪除" }); } } });
  const createWoMutation = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setConvertItem(null);
        toast({ title: "派工單已建立，可至派工單管理查看" });
      }
    }
  });

  const emptyForm = { customerId: 0, title: "", description: "", amount: 0, discountAmount: 0, finalAmount: 0, status: "草稿", notes: "" };
  const [form, setForm] = useState(emptyForm);

  function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!convertItem) return;
    createWoMutation.mutate({
      data: {
        customerId: convertItem.customerId,
        quoteId: convertItem.id,
        title: convertItem.title,
        description: convertItem.description ?? "",
        assignedTo: woForm.assignedTo,
        scheduledDate: woForm.scheduledDate,
        status: "待處理",
        notes: woForm.notes,
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">報價單管理</h1><p className="text-sm text-muted-foreground mt-0.5">管理所有客戶報價單</p></div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增報價單</Button>
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/quotes")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {["全部", ...STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>{s}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : quotes && quotes.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {quotes.map(q => (
              <div key={q.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{q.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[q.status] ?? "bg-gray-100 text-gray-700"}`}>{q.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                    <span>{q.customerName}</span>
                    <span className="font-medium text-foreground">NT${Number(q.finalAmount ?? q.amount).toLocaleString()}</span>
                    <span>{new Date(q.createdAt).toLocaleDateString("zh-TW")}</span>
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="列印報價單" onClick={() => printQuote(q)}><Printer className="h-3.5 w-3.5" /></Button>
                  {(q.status === "已接受" || q.status === "已送出") && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="轉為派工單" onClick={() => { setConvertItem(q); setWoForm({ assignedTo: "", scheduledDate: "", notes: "" }); }}><Wrench className="h-3.5 w-3.5" /></Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm({ customerId: q.customerId, title: q.title, description: q.description ?? "", amount: Number(q.amount), discountAmount: Number(q.discountAmount ?? 0), finalAmount: Number(q.finalAmount ?? q.amount), status: q.status, notes: q.notes ?? "" }); setEditItem(q); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無報價單資料</p></CardContent></Card>
      )}

      {/* Create / Edit Quote Dialog */}
      {[showCreate && "create", editItem && "edit"].filter(Boolean).map(mode => (
        <Dialog key={mode as string} open={true} onOpenChange={() => mode === "create" ? setShowCreate(false) : setEditItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{mode === "create" ? "新增報價單" : "編輯報價單"}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); mode === "create" ? createMutation.mutate({ data: form }) : updateMutation.mutate({ id: editItem.id, data: form }); }} className="space-y-3">
              {mode === "create" && (
                <div className="space-y-1.5">
                  <Label>客戶 *</Label>
                  <Select value={String(form.customerId)} onValueChange={v => setForm(f => ({ ...f, customerId: parseInt(v) }))}>
                    <SelectTrigger><SelectValue placeholder="選擇客戶" /></SelectTrigger>
                    <SelectContent>{customers?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label>標題 *</Label><Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>說明</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5"><Label>原價</Label><Input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div>
                <div className="space-y-1.5"><Label>折扣</Label><Input type="number" min="0" value={form.discountAmount} onChange={e => setForm(f => ({ ...f, discountAmount: parseFloat(e.target.value) || 0 }))} /></div>
                <div className="space-y-1.5"><Label>成交價</Label><Input type="number" min="0" value={form.finalAmount} onChange={e => setForm(f => ({ ...f, finalAmount: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>狀態</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>備註</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => mode === "create" ? setShowCreate(false) : setEditItem(null)}>取消</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>儲存</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ))}

      {/* Convert to Work Order Dialog */}
      {convertItem && (
        <Dialog open onOpenChange={() => setConvertItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>轉為派工單</DialogTitle></DialogHeader>
            <div className="text-sm text-muted-foreground bg-muted/30 rounded p-3 mb-2">
              <p className="font-medium text-foreground">{convertItem.title}</p>
              <p>客戶：{convertItem.customerName} · NT${Number(convertItem.finalAmount ?? convertItem.amount).toLocaleString()}</p>
            </div>
            <form onSubmit={handleConvert} className="space-y-3">
              <div className="space-y-1.5"><Label>負責師傅</Label><Input value={woForm.assignedTo} onChange={e => setWoForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="張師傅" /></div>
              <div className="space-y-1.5"><Label>預定施工日期</Label><Input type="date" value={woForm.scheduledDate} onChange={e => setWoForm(f => ({ ...f, scheduledDate: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>備註</Label><Input value={woForm.notes} onChange={e => setWoForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConvertItem(null)}>取消</Button>
                <Button type="submit" disabled={createWoMutation.isPending}><Wrench className="h-3.5 w-3.5 mr-1" />建立派工單</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除</AlertDialogTitle><AlertDialogDescription>確定要刪除這筆報價單嗎？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
