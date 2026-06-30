import { useState } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListQuotes, useCreateQuote, useUpdateQuote, useDeleteQuote,
  useListCustomers, useCreateWorkOrder, useListEmployees,
  getListQuotesQueryKey, getListWorkOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, Pencil, Trash2, Printer, Wrench, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { WorkOrderFormFields, makeEmpty, buildPayload, type WOForm } from "@/components/work-order-form";

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = ["裝新機", "保養", "維修", "移機", "拆機", "冷媒工程", "配管工程", "其他"];
const CATEGORY_ITEMS: Record<string, string[]> = {
  "裝新機": ["壁掛分離式", "吊隱式", "直立式"],
  "保養": ["分離式保養", "吊隱式保養", "直立式保養"],
  "維修": ["維修"],
  "移機": ["移機"],
  "拆機": ["拆機"],
  "冷媒工程": ["冷媒工程"],
  "配管工程": ["配管工程"],
  "其他": [],
};
const BRANDS = ["冰點", "聲寶", "國際", "三菱重工", "金鼎", "格力", "三洋", "日立", "奇美", "其他"];
const KNOWN_BRANDS = BRANDS.filter(b => b !== "其他");
const UNITS = ["台", "式", "個", "組", "套", "次", "公尺", "公斤"];
const STATUSES = ["草稿", "已送出", "已接受", "已拒絕", "已完成"];
const STATUS_COLORS: Record<string, string> = {
  "草稿": "bg-gray-100 text-gray-700",
  "已送出": "bg-blue-100 text-blue-700",
  "已接受": "bg-green-100 text-green-700",
  "已拒絕": "bg-red-100 text-red-700",
  "已完成": "bg-emerald-100 text-emerald-700",
};

// ── Types ──────────────────────────────────────────────────────────────────
interface QuoteItem {
  category: string;
  itemName: string;
  brand: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  notes: string;
  sortOrder: number;
}
interface QuoteForm {
  customerId: number;
  customerName: string;
  contactPerson: string;
  customerPhone: string;
  address: string;
  title: string;
  description: string;
  taxType: string;
  salesRepId: number;
  status: string;
  notes: string;
  discountAmount: number;
  items: QuoteItem[];
}

const DEFAULT_ITEM = (): QuoteItem => ({
  category: "裝新機", itemName: "壁掛分離式", brand: "冰點",
  quantity: 1, unit: "台", unitPrice: 0, notes: "", sortOrder: 0,
});
const emptyForm = (): QuoteForm => ({
  customerId: 0, customerName: "", contactPerson: "", customerPhone: "",
  address: "", title: "", description: "", taxType: "未稅", salesRepId: 0,
  status: "草稿", notes: "", discountAmount: 0, items: [],
});

// ── Helpers ────────────────────────────────────────────────────────────────
function calcTax(subtotal: number, taxType: string) {
  if (taxType === "含稅") {
    const preTax = Math.round(subtotal / 1.05);
    return { preTax, taxAmt: subtotal - preTax, total: subtotal };
  }
  const taxAmt = Math.round(subtotal * 0.05);
  return { preTax: subtotal, taxAmt, total: subtotal + taxAmt };
}

function computeTotals(items: QuoteItem[], discountAmount: number, taxType: string) {
  const rawTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const subtotal = Math.max(0, rawTotal - (discountAmount || 0));
  return { rawTotal, ...calcTax(subtotal, taxType) };
}

function formToApi(f: QuoteForm) {
  const rawTotal = f.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discAmt = f.discountAmount || 0;
  return {
    ...(f.customerId > 0 ? { customerId: f.customerId } : {}),
    customerName: f.customerName || undefined,
    contactPerson: f.contactPerson || undefined,
    title: f.title,
    description: f.description || undefined,
    amount: rawTotal,
    discountAmount: discAmt > 0 ? discAmt : undefined,
    finalAmount: Math.max(0, rawTotal - discAmt),
    status: f.status,
    notes: f.notes || undefined,
    address: f.address || undefined,
    customerPhone: f.customerPhone || undefined,
    taxType: f.taxType,
    ...(f.salesRepId > 0 ? { salesRepId: f.salesRepId } : {}),
    items: f.items.map((item, idx) => ({
      category: item.category,
      itemName: item.itemName,
      brand: item.brand || undefined,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      notes: item.notes || undefined,
      sortOrder: idx,
    })),
  };
}

function quoteToForm(q: any): QuoteForm {
  return {
    customerId: q.customerId ?? 0,
    customerName: q.customerName ?? "",
    contactPerson: q.contactPerson ?? "",
    customerPhone: q.customerPhone ?? "",
    address: q.address ?? "",
    title: q.title ?? "",
    description: q.description ?? "",
    taxType: q.taxType ?? "未稅",
    salesRepId: q.salesRepId ?? 0,
    status: q.status ?? "草稿",
    notes: q.notes ?? "",
    discountAmount: Number(q.discountAmount ?? 0),
    items: (q.items ?? []).map((item: any, idx: number) => ({
      category: item.category ?? "其他",
      itemName: item.itemName ?? "",
      brand: item.brand ?? "",
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? "台",
      unitPrice: Number(item.unitPrice ?? 0),
      notes: item.notes ?? "",
      sortOrder: idx,
    })),
  };
}

// ── Print ──────────────────────────────────────────────────────────────────
function printQuote(quote: any, autoprint = true) {
  const items: any[] = quote.items ?? [];
  const d = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const quoteNo = `Q-${ymd}-${String(quote.id).padStart(4, "0")}`;
  const quoteDate = d.toLocaleDateString("zh-TW");
  const validDate = new Date(d.getTime() + 30 * 86400000).toLocaleDateString("zh-TW");
  const printDate = new Date().toLocaleDateString("zh-TW");
  const logoUrl = `${window.location.origin}/logo.png`;
  const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;
  const taxType = quote.taxType || "未稅";

  const rawTotal = items.length > 0
    ? items.reduce((s: number, i: any) => s + Number(i.subtotal || 0), 0)
    : Number(quote.finalAmount ?? quote.amount ?? 0);
  const discAmt = Number(quote.discountAmount ?? 0);
  const subtotal = Math.max(0, rawTotal - discAmt);
  const { preTax, taxAmt, total } = calcTax(subtotal, taxType);

  const statusStyles: Record<string, string> = {
    "草稿": "background:#e5e7eb;color:#374151",
    "已送出": "background:#dbeafe;color:#1d4ed8",
    "已接受": "background:#dcfce7;color:#15803d",
    "已拒絕": "background:#fee2e2;color:#dc2626",
    "已完成": "background:#d1fae5;color:#065f46",
  };
  const statusBadge = `<span style="font-size:8pt;font-weight:700;padding:1mm 3mm;border-radius:1mm;${statusStyles[quote.status] ?? ""}">${quote.status ?? ""}</span>`;

  const itemRows = items.length > 0
    ? items.map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(item.category)}</td>
        <td>${esc(item.brand || "—")}</td>
        <td class="tl">${esc(item.itemName)}</td>
        <td>${Number(item.quantity)}</td>
        <td>${esc(item.unit)}</td>
        <td style="text-align:right">${fmt(Number(item.unitPrice))}</td>
        <td style="text-align:right;font-weight:600">${fmt(Number(item.subtotal))}</td>
        <td class="tl">${esc(item.notes || "")}</td>
      </tr>`).join("")
    : `<tr><td>1</td><td>工程</td><td>—</td><td class="tl">${esc(quote.title)}</td><td>1</td><td>式</td><td style="text-align:right">${fmt(rawTotal)}</td><td style="text-align:right;font-weight:600">${fmt(rawTotal)}</td><td></td></tr>`;

  const padRows = Array.from({ length: Math.max(0, 4 - items.length) }, (_, i) => `
    <tr><td>${items.length + i + 1}</td><td></td><td></td><td class="tl"></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");

  const notesHtml = (quote.notes ?? "").split(/\n/).filter((l: string) => l.trim()).slice(0, 5)
    .map((l: string, i: number) => `<div style="display:flex;gap:2mm;padding:0.8mm 0;font-size:8pt;line-height:1.4"><span style="color:#9ACD32;font-weight:700;min-width:4mm">${i + 1}.</span><span>${esc(l.replace(/^\d+[.)、．]\s*/, ""))}</span></div>`).join("")
    || ["報價單有效期限為 30 日，逾期請重新確認。","施工前請支付 50% 訂金，完工驗收後付清尾款。","施工費已含基本配管耗材，特殊工程另計。","不含配電工程，如需配電請另行報價。"]
      .map((l, i) => `<div style="display:flex;gap:2mm;padding:0.8mm 0;font-size:8pt;line-height:1.4"><span style="color:#9ACD32;font-weight:700;min-width:4mm">${i + 1}.</span><span>${l}</span></div>`).join("");

  const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>報價單 ${quoteNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei','微軟正黑體',Arial,sans-serif;font-size:8.5pt;color:#111;background:#fff}
@page{size:A4;margin:10mm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.np{display:none!important}}
.doc{max-width:190mm;margin:0 auto;padding-bottom:16mm}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:3mm;border-bottom:2.5px solid #9ACD32;margin-bottom:3mm}
.hdr-l{display:flex;align-items:center;gap:3mm}
.hdr-logo{width:14mm;height:14mm;border-radius:50%;object-fit:cover;border:2px solid #9ACD32}
.co-name{font-size:15pt;font-weight:900}
.co-sub{font-size:7pt;color:#666;margin-top:1mm}
.co-info{font-size:6.5pt;color:#888;margin-top:1mm;line-height:1.5}
.doc-r{text-align:right}
.doc-label{font-size:20pt;font-weight:900;color:#9ACD32;letter-spacing:8px;line-height:1}
.doc-en{font-size:8pt;color:#aaa;letter-spacing:2px}
.doc-no{font-size:9pt;font-weight:700;font-family:monospace;margin-top:2mm}
.doc-dates{font-size:7.5pt;color:#555;line-height:1.7;margin-top:1mm}
.sec{margin-bottom:3mm}
.stitle{font-size:7pt;font-weight:700;background:#111;color:#9ACD32;padding:1mm 3mm;letter-spacing:2px;margin-bottom:1.5mm;display:flex;align-items:center;justify-content:space-between}
.ci-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0.8mm 4mm}
.ci-r{display:flex;align-items:baseline;gap:1.5mm;padding:0.8mm 0;border-bottom:1px dotted #e0e0e0}
.ci-l{font-size:6.5pt;color:#888;min-width:14mm;flex-shrink:0}
.ci-v{font-size:8pt;font-weight:600;flex:1}
.ci-wide{grid-column:span 2}
table{width:100%;border-collapse:collapse;font-size:7.5pt}
thead th{background:#111;color:#9ACD32;padding:1.5mm 1.5mm;text-align:center;font-weight:700;font-size:7pt;border-right:1px solid #333;white-space:nowrap}
thead th:last-child{border-right:none}
tbody tr:nth-child(even){background:#f7f7f7}
tbody td{padding:1.5mm 1.5mm;text-align:center;border-bottom:1px solid #ebebeb;vertical-align:middle}
tbody td.tl{text-align:left}
tbody tr:last-child td{border-bottom:1.5px solid #9ACD32}
.row{display:flex;gap:3mm}
.mid-r{flex:1;border:1px solid #e0e0e0;border-left:3px solid #9ACD32;padding:2mm 2.5mm;font-size:8pt;white-space:pre-wrap;line-height:1.5;color:#333;background:#fafafa;min-height:20mm}
.bot-l{flex:1}
.bot-r{flex:0 0 70mm}
.amt-box{border:2px solid #9ACD32;border-radius:1mm;overflow:hidden}
.amt-r{display:flex;justify-content:space-between;padding:1.5mm 4mm;border-bottom:1px solid #ebebeb;font-size:8pt}
.amt-r .lbl{color:#777}
.amt-r .val{font-weight:600}
.amt-total{background:#111;padding:3mm 4mm;display:flex;justify-content:space-between;align-items:center}
.amt-total .lbl{color:#9ACD32;font-size:9.5pt;font-weight:900;letter-spacing:1px}
.amt-total .val{color:#fff;font-size:14pt;font-weight:900;font-family:monospace}
.sig-row{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-top:1mm}
.sig-box{border:1px solid #ccc;border-radius:1mm;padding:1.5mm;min-height:22mm;display:flex;flex-direction:column}
.sig-sp{flex:1}
.sig-lbl{font-size:7pt;color:#555;border-top:1px solid #aaa;padding-top:1mm;text-align:center}
.sig-dt{font-size:6.5pt;color:#bbb;text-align:center;margin-top:0.5mm}
.pf{border-top:2px solid #9ACD32;padding-top:2mm;margin-top:3mm;display:flex;justify-content:space-between;align-items:center}
.pf-l{display:flex;align-items:center;gap:2mm}
.pf-logo{width:8mm;height:8mm;border-radius:50%;object-fit:cover;border:1px solid #9ACD32}
.pf-info{font-size:6.5pt;color:#666;line-height:1.5}
.pf-r{font-size:6.5pt;color:#aaa;text-align:right;line-height:1.6}
.pbtn{position:fixed;top:8mm;right:8mm;background:#9ACD32;color:#111;border:none;padding:5px 16px;font-size:9.5pt;font-weight:700;cursor:pointer;border-radius:2px;z-index:100;letter-spacing:1px}
.pbtn:hover{background:#7db220}
</style></head><body>
<button class="pbtn np" onclick="window.print()">列印 / PDF</button>
<div class="doc">
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
    <div class="doc-no">${quoteNo}&nbsp;&nbsp;${statusBadge}</div>
    <div class="doc-dates">報價日期：${quoteDate}　有效期限：${validDate}<br>列印日期：${printDate}</div>
  </div>
</div>

<div class="sec">
  <div class="stitle">▌ 客戶資訊　Client Information</div>
  <div class="ci-grid">
    <div class="ci-r"><span class="ci-l">客戶名稱</span><span class="ci-v">${esc(quote.customerName) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">聯絡人</span><span class="ci-v">${esc(quote.contactPerson) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">聯絡電話</span><span class="ci-v">${esc(quote.customerPhone) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">負責業務</span><span class="ci-v">${esc(quote.salesRepName) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">工程名稱</span><span class="ci-v">${esc(quote.title) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">稅別</span><span class="ci-v">${esc(taxType)}</span></div>
    <div class="ci-r ci-wide"><span class="ci-l">施工地址</span><span class="ci-v">${esc(quote.address) || "　"}</span></div>
    <div class="ci-r"><span class="ci-l">付款條件</span><span class="ci-v">　</span></div>
  </div>
</div>

<div class="sec">
  <div class="stitle">▌ 工程設備明細　Equipment Schedule</div>
  <table>
    <thead><tr>
      <th style="width:6mm">項次</th><th style="width:16mm">類別</th>
      <th style="width:14mm">品牌</th><th>品項</th>
      <th style="width:9mm">數量</th><th style="width:9mm">單位</th>
      <th style="width:22mm">單價</th><th style="width:22mm">小計</th>
      <th style="width:18mm">備註</th>
    </tr></thead>
    <tbody>${itemRows}${padRows}</tbody>
  </table>
</div>

<div class="row sec">
  <div style="flex:0 0 54%">
    <div class="stitle">▌ 備註說明　Notes &amp; Remarks</div>
    <div class="mid-r" style="min-height:${quote.description ? "auto" : "24mm"};margin-left:0;border-left:3px solid #9ACD32">${esc(quote.description) || "施工方式：\n施工天數：\n注意事項："}</div>
  </div>
  <div style="flex:1">
    <div class="stitle">▌ 注意事項　Terms &amp; Conditions</div>
    ${notesHtml}
  </div>
</div>

<div class="row sec">
  <div class="bot-l"></div>
  <div class="bot-r">
    <div class="amt-box">
      <div class="amt-r"><span class="lbl">項目小計</span><span class="val">${fmt(rawTotal)}</span></div>
      ${discAmt > 0 ? `<div class="amt-r"><span class="lbl">折扣</span><span class="val" style="color:#dc2626">－ ${fmt(discAmt)}</span></div>` : ""}
      <div class="amt-r"><span class="lbl">未稅小計</span><span class="val">${fmt(preTax)}</span></div>
      <div class="amt-r"><span class="lbl">稅額 5%</span><span class="val">${fmt(taxAmt)}</span></div>
      <div class="amt-total"><span class="lbl">含稅總計</span><span class="val">${fmt(total)}</span></div>
    </div>
  </div>
</div>

<div class="sec">
  <div class="stitle">▌ 確認簽署　Authorization</div>
  <div class="sig-row">
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">客戶簽名</div><div class="sig-dt">日期：＿＿＿＿＿＿</div></div>
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">業務簽名</div><div class="sig-dt">日期：＿＿＿＿＿＿</div></div>
    <div class="sig-box"><div class="sig-sp"></div><div class="sig-lbl">公　司　章</div><div class="sig-dt">&nbsp;</div></div>
  </div>
</div>
</div>

<div class="pf">
  <div class="pf-l">
    <img src="${logoUrl}" class="pf-logo" alt="">
    <div class="pf-info"><b>晟風工程有限公司</b>　統編：93388506<br>Tel：0955-980-738　彰化縣花壇鄉花南路212號</div>
  </div>
  <div class="pf-r">Generated by 晟風工程 ERP<br>列印：${printDate}</div>
</div>
</body></html>`;

  // Blob URL approach — works on mobile Safari/Chrome (no blank-window popup needed)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // Popup blocked (iOS Safari) — force via anchor click
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── LINE Share (報價單) ────────────────────────────────────────────────────
function shareQuoteViaLine(quote: any) {
  const items = (quote.items ?? []) as any[];
  const d = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const quoteNo = `Q-${ymd}-${String(quote.id).padStart(4, "0")}`;
  const qRaw = items.length > 0
    ? items.reduce((s: number, i: any) => s + Number(i.subtotal ?? 0), 0)
    : Number(quote.finalAmount ?? quote.amount ?? 0);
  const qDisc = Number(quote.discountAmount ?? 0);
  const { total } = calcTax(Math.max(0, qRaw - qDisc), quote.taxType ?? "未稅");
  const validUntil = new Date(d.getTime() + 30 * 86400000).toLocaleDateString("zh-TW");

  const lines = [
    "【晟風工程 報價通知】",
    "",
    `報價單號：${quoteNo}`,
    `工程名稱：${quote.title || "—"}`,
    `客戶：${quote.customerName || "—"}`,
    quote.contactPerson ? `聯絡人：${quote.contactPerson}` : "",
    quote.customerPhone ? `聯絡電話：${quote.customerPhone}` : "",
    quote.address ? `施工地址：${quote.address}` : "",
    "",
    `含稅總金額：NT$ ${total.toLocaleString()}`,
    `報價有效期限：${validUntil}`,
    "",
    "如有任何問題請與我們聯繫，謝謝！",
    "晟風工程有限公司  Tel：0955-980-738",
  ].filter(l => l !== "").join("\n").replace(/\n{3,}/g, "\n\n");

  window.open(`https://line.me/R/msg/text?${encodeURIComponent(lines)}`, "_blank");
}

// ── ItemCard ───────────────────────────────────────────────────────────────
function ItemCard({ item, index, onChange, onDelete }: {
  item: QuoteItem; index: number;
  onChange: (u: QuoteItem) => void; onDelete: () => void;
}) {
  const itemOptions = CATEGORY_ITEMS[item.category] || [];
  const hasOptions = itemOptions.length > 0;
  const isCustomItem = hasOptions && !itemOptions.includes(item.itemName);
  const isCustomBrand = !!item.brand && !KNOWN_BRANDS.includes(item.brand);

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">項目 {index + 1}</span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onDelete}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">類別</Label>
          <Select value={item.category} onValueChange={v => {
            onChange({ ...item, category: v, itemName: CATEGORY_ITEMS[v]?.[0] || "" });
          }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">品項</Label>
          {hasOptions ? (
            <Select value={isCustomItem ? "其他" : item.itemName} onValueChange={v => onChange({ ...item, itemName: v === "其他" ? "" : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {itemOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value="其他">其他（自填）</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input className="h-8 text-xs" value={item.itemName} onChange={e => onChange({ ...item, itemName: e.target.value })} placeholder="請輸入品項" />
          )}
          {isCustomItem && (
            <Input className="h-7 text-xs mt-1" value={item.itemName} onChange={e => onChange({ ...item, itemName: e.target.value })} placeholder="請輸入品項名稱" />
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">品牌</Label>
          <Select value={isCustomBrand ? "其他" : (item.brand || "其他")} onValueChange={v => onChange({ ...item, brand: v === "其他" ? "" : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
          {(isCustomBrand || item.brand === "") && (
            <Input className="h-7 text-xs mt-1" value={item.brand} onChange={e => onChange({ ...item, brand: e.target.value })} placeholder="請輸入品牌" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">數量</Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01" value={item.quantity}
            onChange={e => onChange({ ...item, quantity: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">單位</Label>
          <Select value={item.unit} onValueChange={v => onChange({ ...item, unit: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">單價</Label>
          <Input className="h-8 text-sm" type="number" min="0" value={item.unitPrice}
            onChange={e => onChange({ ...item, unitPrice: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">小計</Label>
          <div className="h-8 flex items-center px-2 bg-muted/50 rounded-md border text-xs font-semibold">
            NT${(item.quantity * item.unitPrice).toLocaleString()}
          </div>
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-1">
          <Label className="text-xs">備註</Label>
          <Input className="h-8 text-xs" value={item.notes} onChange={e => onChange({ ...item, notes: e.target.value })} placeholder="選填" />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Quotes() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const [statusFilter, setStatusFilter] = useState("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [convertItem, setConvertItem] = useState<any>(null);
  const [woForm, setWoForm] = useState<WOForm>(makeEmpty());
  const [form, setForm] = useState<QuoteForm>(emptyForm());

  const { data: quotes, isLoading } = useListQuotes({
    ...(filterCustomerId ? { customerId: filterCustomerId } : {}),
    ...(statusFilter !== "全部" ? { status: statusFilter } : {}),
  });
  const { data: customers } = useListCustomers({ includeOld: "true" });
  const { data: allSalesReps } = useListEmployees({ position: "業務" });
  const salesReps = (allSalesReps ?? []).filter(e => e.status !== "離職");
  const { data: allEmployees } = useListEmployees({});
  const technicianOptions = (allEmployees ?? []).filter(e => e.position?.includes("技師") && e.status !== "離職");

  const invQuotes = () => qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
  const createMutation = useCreateQuote({ mutation: { onSuccess: () => { invQuotes(); setShowCreate(false); toast({ title: "報價單已新增" }); } } });
  const updateMutation = useUpdateQuote({ mutation: { onSuccess: () => { invQuotes(); setEditItem(null); toast({ title: "報價單已更新" }); } } });
  const deleteMutation = useDeleteQuote({ mutation: { onSuccess: () => { invQuotes(); setDeleteId(null); toast({ title: "報價單已刪除" }); } } });
  const createWoMutation = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        setConvertItem(null);
        toast({ title: "派工單建立成功" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "建立失敗，請稍後再試";
        toast({ title: "建立派工單失敗", description: msg, variant: "destructive" });
      },
    },
  });

  function handleCustomerChange(v: string) {
    const cid = parseInt(v, 10);
    const c = customers?.find(x => x.id === cid);
    setForm(f => ({
      ...f, customerId: cid,
      customerName: c ? c.name : f.customerName,
      address: c ? (c.address || f.address) : f.address,
      customerPhone: c ? (c.phone || f.customerPhone) : f.customerPhone,
    }));
  }

  function handleCopy(q: any) {
    setForm({ ...quoteToForm(q), title: `${q.title}（複製）`, status: "草稿" });
    setShowCreate(true);
  }

  function openEdit(q: any) { setForm(quoteToForm(q)); setEditItem(q); }

  function addItem() { setForm(f => ({ ...f, items: [...f.items, { ...DEFAULT_ITEM(), sortOrder: f.items.length }] })); }
  function removeItem(idx: number) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }
  function updateItem(idx: number, updated: QuoteItem) { setForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? updated : item) })); }

  function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!convertItem) return;
    if (!woForm.customerId || woForm.customerId <= 0) {
      toast({ title: "請先選擇客戶", description: "建立派工單需要指定客戶", variant: "destructive" });
      return;
    }
    const payload = buildPayload(woForm);
    createWoMutation.mutate({ data: payload });
  }

  const { rawTotal, preTax, taxAmt, total } = computeTotals(form.items, form.discountAmount, form.taxType);

  const closeDialog = () => { if (editItem) setEditItem(null); else setShowCreate(false); };
  const dialogOpen = showCreate || !!editItem;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">報價單管理</h1><p className="text-sm text-muted-foreground mt-0.5">管理所有客戶報價單</p></div>
        <Button size="sm" onClick={() => { setForm(emptyForm()); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" />新增報價單</Button>
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/quotes")}>
            <X className="h-3 w-3" />清除
          </button>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["全部", ...STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : quotes && quotes.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {quotes.map(q => {
              const qItems = (q.items ?? []) as any[];
              const qRaw = qItems.length > 0 ? qItems.reduce((s: number, i: any) => s + Number(i.subtotal ?? 0), 0) : Number(q.finalAmount ?? q.amount ?? 0);
              const qDisc = Number(q.discountAmount ?? 0);
              const { total: qTotal } = calcTax(Math.max(0, qRaw - qDisc), q.taxType ?? "未稅");
              return (
                <div key={q.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm">{q.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[q.status] ?? "bg-gray-100 text-gray-700"}`}>{q.status}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{q.taxType ?? "未稅"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                      {q.customerName && <span>{q.customerName}</span>}
                      {q.customerPhone && <span>{q.customerPhone}</span>}
                      {q.salesRepName && <span>業務：{q.salesRepName}</span>}
                      {qItems.length > 0
                        ? <span>{qItems.length} 項工程・含稅 NT${qTotal.toLocaleString()}</span>
                        : <span>含稅 NT${qTotal.toLocaleString()}</span>
                      }
                      <span>{new Date(q.createdAt).toLocaleDateString("zh-TW")}</span>
                    </div>
                    {q.address && <div className="text-xs text-muted-foreground truncate max-w-sm mt-0.5">{q.address}</div>}
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="列印/PDF" onClick={() => printQuote(q, true)}><Printer className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="LINE 分享" onClick={() => shareQuoteViaLine(q)}><Share2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="複製" onClick={() => handleCopy(q)}><Copy className="h-3.5 w-3.5" /></Button>
                    {(q.status === "已接受" || q.status === "已送出") && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="轉為派工單" onClick={() => {
                        setConvertItem(q);
                        setWoForm({
                          ...makeEmpty(),
                          quoteId: q.id,
                          customerId: q.customerId ?? 0,
                          title: q.title ?? "",
                          contactPerson: q.contactPerson ?? "",
                          mobilePhone: q.customerPhone ?? "",
                          installAddress: q.address ?? "",
                          description: q.description ?? "",
                        });
                      }}><Wrench className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="編輯" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="刪除" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">尚無報價單資料</p></CardContent></Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => !open && closeDialog()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "編輯報價單" : "新增報價單"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            const data = formToApi(form) as any;
            if (editItem) updateMutation.mutate({ id: editItem.id, data });
            else createMutation.mutate({ data });
          }} className="space-y-4">

            {/* Section: 客戶資訊 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1">客戶資訊</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>選擇客戶</Label>
                  <Select value={String(form.customerId)} onValueChange={handleCustomerChange}>
                    <SelectTrigger><SelectValue placeholder="選擇既有客戶（可不選）" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">（不選擇）</SelectItem>
                      {customers?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>客戶姓名</Label>
                  <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="輸入或自動帶入" />
                </div>
                <div className="space-y-1.5">
                  <Label>聯絡電話</Label>
                  <Input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="自動帶入或手動填寫" />
                </div>
                <div className="space-y-1.5">
                  <Label>聯絡人 <span className="text-muted-foreground text-xs">（選填）</span></Label>
                  <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="聯絡人姓名" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>施工地址</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="自動帶入或手動填寫" />
              </div>
            </div>

            {/* Section: 工程資訊 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1">工程資訊</h3>
              <div className="space-y-1.5">
                <Label>工程名稱 *</Label>
                <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例：台中南屯冷氣安裝工程" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>負責業務</Label>
                  <Select value={String(form.salesRepId)} onValueChange={v => setForm(f => ({ ...f, salesRepId: parseInt(v, 10) }))}>
                    <SelectTrigger><SelectValue placeholder="選擇業務" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">（不指定）</SelectItem>
                      {salesReps?.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>稅別</Label>
                  <Select value={form.taxType} onValueChange={v => setForm(f => ({ ...f, taxType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未稅">○ 未稅（加計 5% 稅額）</SelectItem>
                      <SelectItem value="含稅">○ 含稅（已含 5% 稅額）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>狀態</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section: 工程項目 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b pb-1">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">工程項目</h3>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" />新增項目
                </Button>
              </div>
              {form.items.length === 0 ? (
                <div className="border border-dashed rounded-lg py-8 text-center text-muted-foreground text-sm">
                  <p>尚未新增工程項目</p>
                  <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />新增第一項</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <ItemCard key={idx} item={item} index={idx}
                      onChange={updated => updateItem(idx, updated)}
                      onDelete={() => removeItem(idx)} />
                  ))}
                </div>
              )}

              {/* Discount + Totals */}
              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-20 text-right flex-shrink-0">折扣</Label>
                    <Input className="h-7 text-sm text-right" type="number" min="0" value={form.discountAmount || ""}
                      placeholder="0"
                      onChange={e => setForm(f => ({ ...f, discountAmount: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground"><span>項目小計</span><span>NT$ {rawTotal.toLocaleString()}</span></div>
                    {form.discountAmount > 0 && <div className="flex justify-between text-red-600"><span>折扣</span><span>－ NT$ {form.discountAmount.toLocaleString()}</span></div>}
                    <div className="flex justify-between text-muted-foreground"><span>未稅小計</span><span>NT$ {preTax.toLocaleString()}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>稅額 5%</span><span>NT$ {taxAmt.toLocaleString()}</span></div>
                    <div className="flex justify-between font-bold border-t pt-1 text-sm">
                      <span>含稅總計</span><span>NT$ {total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: 備註 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-1">說明與備註</h3>
              <div className="space-y-1.5">
                <Label>施工說明</Label>
                <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="施工方式、施工天數、注意事項…" />
              </div>
              <div className="space-y-1.5">
                <Label>備註 <span className="text-muted-foreground text-xs">（保固說明、其他約定事項等）</span></Label>
                <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="保固說明、付款條件、其他約定…" />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to Work Order */}
      {convertItem && (
        <Dialog open onOpenChange={() => setConvertItem(null)}>
          <DialogContent className="max-w-2xl w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader><DialogTitle>轉為派工單</DialogTitle></DialogHeader>
            <form onSubmit={handleConvert} className="space-y-4 mt-1">
              <WorkOrderFormFields
                form={woForm}
                setForm={setWoForm}
                customers={customers ?? []}
                technicianOptions={technicianOptions}
                showQuoteSelector={false}
                customerDisabled={!!(convertItem?.customerId)}
              />
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
