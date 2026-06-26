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
  const preTax = Math.round(finalAmt / 1.05);
  const taxAmt = finalAmt - preTax;
  const fmt = (n: number) => `NT$ ${n.toLocaleString()}`;
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ── Brand detection ──
  const searchText = `${quote.title ?? ""} ${quote.description ?? ""}`.toLowerCase();
  const brandDefs: [string, string, string][] = [
    ["panasonic", "Panasonic", "#0033A0"],
    ["mitsubishi", "三菱重工", "#E60012"], ["三菱重工", "三菱重工", "#E60012"],
    ["daikin", "Daikin 大金", "#0078BF"], ["大金", "Daikin 大金", "#0078BF"],
    ["hitachi", "HITACHI 日立", "#C8002B"], ["日立", "HITACHI 日立", "#C8002B"],
    ["sampo", "SAMPO 聲寶", "#00529C"], ["聲寶", "SAMPO 聲寶", "#00529C"],
    ["冰點", "冰點", "#00B4D8"],
  ];
  const detectedBrand = brandDefs.find(([key]) => searchText.includes(key));
  const brandBadge = detectedBrand
    ? `<span style="background:${detectedBrand[2]};color:#fff;font-size:7pt;font-weight:700;padding:0.5mm 2mm;border-radius:1mm;letter-spacing:0.5px">${detectedBrand[1]}</span>`
    : "";

  // ── Status badge ──
  const statusStyles: Record<string, string> = {
    "草稿": "background:#e5e7eb;color:#374151",
    "已送出": "background:#dbeafe;color:#1d4ed8",
    "已接受": "background:#dcfce7;color:#15803d",
    "已拒絕": "background:#fee2e2;color:#dc2626",
    "已完成": "background:#d1fae5;color:#065f46",
  };
  const statusBadge = `<span style="font-size:8pt;font-weight:700;padding:1mm 3mm;border-radius:1mm;${statusStyles[quote.status] ?? "background:#f3f4f6;color:#111"}">${quote.status}</span>`;

  // ── Materials checkbox auto-detect ──
  const matText = `${quote.description ?? ""} ${quote.notes ?? ""}`.toLowerCase();
  const chk = (k: string) => matText.includes(k) ? "☑" : "☐";

  // ── Notes (max 4 lines) ──
  const notesLines = (quote.notes ?? "").split(/\n/).filter((l: string) => l.trim()).slice(0, 4);
  const defaultNotes = [
    "報價單有效期限為 30 日，逾期請重新確認。",
    "報價已含安裝人工及基本耗材，不含特殊工程。",
    "施工前須支付 50% 訂金，完工驗收後付清尾款。",
    "不含配電工程，如需配電請另行報價。",
  ];
  const notesHtml = (notesLines.length > 0 ? notesLines : defaultNotes)
    .map((l: string, i: number) => `<div style="display:flex;gap:2mm;padding:0.8mm 0;font-size:8pt;line-height:1.4"><span style="color:#9ACD32;font-weight:700;min-width:4mm">${i + 1}.</span><span>${esc(l.replace(/^\d+[.)、．]\s*/, ""))}</span></div>`)
    .join("");

  // (legacy vars removed — replaced by statusBadge, notesHtml, brandBadge above)

  const html = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>報價單 ${quoteNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei','微軟正黑體',Arial,sans-serif;font-size:8.5pt;color:#111;background:#fff;padding-bottom:18mm}
@page{size:A4;margin:10mm 10mm 10mm 10mm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none!important}.pf{position:fixed;bottom:0;left:0;right:0;background:#fff}}

/* ── layout ── */
.doc{max-width:190mm;margin:0 auto}
.row{display:flex;gap:3mm}
.sec{margin-bottom:2.5mm}
.stitle{font-size:7pt;font-weight:700;background:#111;color:#9ACD32;padding:1mm 3mm;letter-spacing:2px;text-transform:uppercase;margin-bottom:1.5mm;display:flex;align-items:center;justify-content:space-between}

/* ── header ── */
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:3mm;border-bottom:2.5px solid #9ACD32;margin-bottom:3mm}
.hdr-l{display:flex;align-items:center;gap:3mm}
.hdr-logo{width:14mm;height:14mm;border-radius:50%;object-fit:cover;border:2px solid #9ACD32}
.co-name{font-size:15pt;font-weight:900;color:#111;line-height:1.1;letter-spacing:0.5px}
.co-sub{font-size:7pt;color:#666;margin-top:1mm;letter-spacing:0.5px}
.co-info{font-size:6.5pt;color:#888;margin-top:1mm;line-height:1.5}
.doc-r{text-align:right}
.doc-label{font-size:20pt;font-weight:900;color:#9ACD32;letter-spacing:8px;line-height:1}
.doc-en{font-size:8pt;color:#aaa;letter-spacing:2px}
.doc-no{font-size:9pt;font-weight:700;font-family:monospace;margin-top:2mm}
.doc-dates{font-size:7.5pt;color:#555;line-height:1.7;margin-top:1mm}

/* ── client info ── */
.ci-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0.8mm 4mm}
.ci-r{display:flex;align-items:baseline;gap:1.5mm;padding:0.8mm 0;border-bottom:1px dotted #e0e0e0}
.ci-l{font-size:6.5pt;color:#888;min-width:13mm;flex-shrink:0}
.ci-v{font-size:8pt;font-weight:600;flex:1}
.ci-wide{grid-column:span 2}

/* ── equipment table ── */
table{width:100%;border-collapse:collapse;font-size:7.5pt}
thead th{background:#111;color:#9ACD32;padding:1.5mm 1.5mm;text-align:center;font-weight:700;font-size:7pt;white-space:nowrap;border-right:1px solid #333}
thead th:last-child{border-right:none}
tbody tr:nth-child(even){background:#f7f7f7}
tbody td{padding:1.5mm 1.5mm;text-align:center;border-bottom:1px solid #ebebeb;vertical-align:middle}
tbody td.tl{text-align:left}
tbody tr:last-child td{border-bottom:1.5px solid #9ACD32}

/* ── checkboxes ── */
.chk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1mm 2mm;font-size:7.5pt}
.chk-item{display:flex;align-items:center;gap:1mm}
.chk-sym{font-size:9pt;color:#9ACD32}
.chk-sym.off{color:#bbb}
.chk-other{display:flex;align-items:center;gap:1mm;grid-column:span 2}
.chk-line{flex:1;border-bottom:1px solid #999;min-width:20mm}

/* ── middle row (materials + service) ── */
.mid-l{flex:0 0 54%}
.mid-r{flex:1;border:1px solid #e0e0e0;border-left:3px solid #9ACD32;padding:2mm 2.5mm;font-size:7.5pt;white-space:pre-wrap;line-height:1.5;color:#333;background:#fafafa;min-height:24mm}

/* ── bottom row (terms + total) ── */
.bot-l{flex:1}
.bot-r{flex:0 0 72mm}
.amt-box{border:2px solid #9ACD32;border-radius:1mm;overflow:hidden}
.amt-r{display:flex;justify-content:space-between;padding:1.5mm 4mm;border-bottom:1px solid #ebebeb;font-size:8pt}
.amt-r .lbl{color:#777}
.amt-r .val{font-weight:600}
.amt-r.disc .val{color:#dc2626}
.amt-total{background:#111;padding:3mm 4mm}
.amt-total .lbl{color:#9ACD32;font-size:9.5pt;font-weight:900;letter-spacing:1px}
.amt-total .val{color:#fff;font-size:14pt;font-weight:900;font-family:monospace}

/* ── signatures ── */
.sig-row{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-top:1mm}
.sig-box{border:1px solid #ccc;border-radius:1mm;padding:1.5mm;min-height:22mm;display:flex;flex-direction:column}
.sig-sp{flex:1}
.sig-lbl{font-size:7pt;color:#555;border-top:1px solid #aaa;padding-top:1mm;text-align:center}
.sig-dt{font-size:6.5pt;color:#bbb;text-align:center;margin-top:0.5mm}

/* ── footer ── */
.pf{border-top:2px solid #9ACD32;padding-top:2mm;margin-top:3mm;display:flex;justify-content:space-between;align-items:center}
.pf-l{display:flex;align-items:center;gap:2mm}
.pf-logo{width:8mm;height:8mm;border-radius:50%;object-fit:cover;border:1px solid #9ACD32}
.pf-info{font-size:6.5pt;color:#666;line-height:1.5}
.pf-info b{color:#111}
.pf-r{font-size:6.5pt;color:#aaa;text-align:right;line-height:1.6}

/* ── print btn ── */
.pbtn{position:fixed;top:8mm;right:8mm;background:#9ACD32;color:#111;border:none;padding:5px 16px;font-size:9.5pt;font-weight:700;cursor:pointer;border-radius:2px;z-index:100;letter-spacing:1px}
.pbtn:hover{background:#7db220}
</style></head>
<body>
<button class="pbtn no-print" onclick="window.print()">列印 / PDF</button>
<div class="doc">

<!-- HEADER -->
<div class="hdr">
  <div class="hdr-l">
    <img src="${logoUrl}" class="hdr-logo" alt="">
    <div>
      <div class="co-name">晟風工程有限公司</div>
      <div class="co-sub">冷氣安裝｜保養｜維修｜設計</div>
      <div class="co-info">統編：93388506　Tel：0955-980-738<br>cfac07151025@gmail.com　彰化縣花壇鄉花南路212號</div>
    </div>
  </div>
  <div class="doc-r">
    <div class="doc-label">報價單</div>
    <div class="doc-en">QUOTATION</div>
    <div class="doc-no">${quoteNo}&nbsp;&nbsp;${statusBadge}${brandBadge ? `&nbsp;${brandBadge}` : ""}</div>
    <div class="doc-dates">
      報價日期：${quoteDate}　有效期限：${validDate}<br>
      列印日期：${printDate}
    </div>
  </div>
</div>

<!-- CLIENT INFO -->
<div class="sec">
  <div class="stitle">▌ 客戶資訊 　Client Information</div>
  <div class="ci-grid">
    <div class="ci-r"><span class="ci-l">客戶名稱</span><span class="ci-v">${esc(quote.customerName) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">聯絡人</span><span class="ci-v">　</span></div>
    <div class="ci-r"><span class="ci-l">工程名稱</span><span class="ci-v">${esc(quote.title) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">電話</span><span class="ci-v">　</span></div>
    <div class="ci-r"><span class="ci-l">Email</span><span class="ci-v">　</span></div>
    <div class="ci-r"><span class="ci-l">付款方式</span><span class="ci-v">　</span></div>
    <div class="ci-r ci-wide"><span class="ci-l">施工地址</span><span class="ci-v">　</span></div>
    <div class="ci-r"><span class="ci-l">付款條件</span><span class="ci-v">　</span></div>
  </div>
</div>

<!-- EQUIPMENT TABLE -->
<div class="sec">
  <div class="stitle">▌ 工程設備明細　Equipment Schedule</div>
  <table>
    <thead><tr>
      <th style="width:6mm">項次</th>
      <th style="width:14mm">品牌</th>
      <th>品名</th>
      <th style="width:20mm">型號</th>
      <th style="width:9mm">數量</th>
      <th style="width:9mm">單位</th>
      <th style="width:18mm">單價</th>
      <th style="width:12mm">折扣</th>
      <th style="width:20mm">小計</th>
      <th style="width:18mm">備註</th>
    </tr></thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${brandBadge || "　"}</td>
        <td class="tl">${esc(quote.title)}</td>
        <td></td><td>1</td><td>式</td>
        <td>${baseAmt > 0 ? fmt(baseAmt) : ""}</td>
        <td>${discAmt > 0 ? fmt(discAmt) : "—"}</td>
        <td>${baseAmt > 0 ? fmt(baseAmt - discAmt) : ""}</td>
        <td></td>
      </tr>
      <tr><td>2</td><td></td><td class="tl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>3</td><td></td><td class="tl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>4</td><td></td><td class="tl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>5</td><td></td><td class="tl"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
  </table>
</div>

<!-- MIDDLE ROW: Materials + Service Content -->
<div class="row sec">
  <div class="mid-l">
    <div class="stitle">▌ 追加材料　Additional Materials</div>
    <div class="chk-grid">
      <div class="chk-item"><span class="chk-sym ${chk("銅管")==="☑"?"":"off"}">${chk("銅管")}</span>銅管</div>
      <div class="chk-item"><span class="chk-sym ${chk("冷媒")==="☑"?"":"off"}">${chk("冷媒")}</span>冷媒補充</div>
      <div class="chk-item"><span class="chk-sym ${chk("控制線")==="☑"?"":"off"}">${chk("控制線")}</span>控制線</div>
      <div class="chk-item"><span class="chk-sym ${chk("排水管")==="☑"?"":"off"}">${chk("排水管")}</span>排水管</div>
      <div class="chk-item"><span class="chk-sym ${chk("電源線")==="☑"?"":"off"}">${chk("電源線")}</span>電源線</div>
      <div class="chk-item"><span class="chk-sym ${chk("固定架")==="☑"?"":"off"}">${chk("固定架")}</span>室外固定架</div>
      <div class="chk-item"><span class="chk-sym ${chk("洗孔")==="☑"?"":"off"}">${chk("洗孔")}</span>洗孔</div>
      <div class="chk-item"><span class="chk-sym ${chk("吊車")==="☑"?"":"off"}">${chk("吊車")}</span>吊車</div>
      <div class="chk-item"><span class="chk-sym ${chk("高空車")==="☑"?"":"off"}">${chk("高空車")}</span>高空車</div>
      <div class="chk-item"><span class="chk-sym ${chk("拆除")==="☑"?"":"off"}">${chk("拆除")}</span>拆除舊機</div>
      <div class="chk-item"><span class="chk-sym ${chk("冷凝水")==="☑"?"":"off"}">${chk("冷凝水")}</span>冷凝水幫浦</div>
      <div class="chk-other"><span class="chk-sym off">☐</span>其他：<span class="chk-line"></span></div>
    </div>
  </div>
  <div class="mid-r">
    <div class="stitle" style="margin:-2mm -2.5mm 1.5mm;padding:1mm 2.5mm">▌ 服務內容　Service Content</div>${esc(quote.description) || "施工方式：\n施工天數：\n注意事項：\n停車位置："}</div>
</div>

<!-- BOTTOM ROW: Terms + Total -->
<div class="row sec">
  <div class="bot-l">
    <div class="stitle">▌ 注意事項　Terms &amp; Conditions</div>
    ${notesHtml}
  </div>
  <div class="bot-r">
    <div class="amt-box">
      <div class="amt-r"><span class="lbl">材料費</span><span class="val">${fmt(baseAmt)}</span></div>
      <div class="amt-r"><span class="lbl">施工費</span><span class="val">—</span></div>
      ${discAmt > 0 ? `<div class="amt-r disc"><span class="lbl">折扣</span><span class="val">－ ${fmt(discAmt)}</span></div>` : ""}
      <div class="amt-r"><span class="lbl">未稅小計</span><span class="val">${fmt(preTax)}</span></div>
      <div class="amt-r"><span class="lbl">稅額 5%</span><span class="val">${fmt(taxAmt)}</span></div>
      <div class="amt-total" style="display:flex;justify-content:space-between;align-items:center">
        <span class="lbl">工程總價</span>
        <span class="val">${fmt(finalAmt)}</span>
      </div>
    </div>
  </div>
</div>

<!-- SIGNATURES -->
<div class="sec">
  <div class="stitle">▌ 確認簽署　Authorization</div>
  <div class="sig-row">
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">客戶簽名</div><div class="sig-dt">日期：＿＿＿＿＿＿</div></div>
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">業務簽名</div><div class="sig-dt">日期：＿＿＿＿＿＿</div></div>
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">公　司　章</div><div class="sig-dt">&nbsp;</div></div>
  </div>
</div>

</div><!-- /doc -->

<!-- FOOTER -->
<div class="pf">
  <div class="pf-l">
    <img src="${logoUrl}" class="pf-logo" alt="">
    <div class="pf-info">
      <b>晟風工程有限公司</b>　統編：93388506<br>
      Tel：0955-980-738　cfac07151025@gmail.com　彰化縣花壇鄉花南路212號
    </div>
  </div>
  <div class="pf-r">Generated by 晟風工程 ERP<br>列印：${printDate}</div>
</div>

</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1100");
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
