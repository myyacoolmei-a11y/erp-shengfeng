import { useState, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useDeleteWorkOrder,
  useListCustomers, useListProgress, useCreateProgress,
  useCreatePayment, useCreateReceivable,
  useListEmployees, useListQuotes,
  getListWorkOrdersQueryKey, getListProgressQueryKey, getListPaymentsQueryKey, getListReceivablesQueryKey,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard, Printer, Share2, MapPin, X, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const STATUSES = ["待施工", "已完成"];
const PROJECT_TYPES = ["新裝", "維修", "保養", "遷機", "清洗", "保固服務"];
const ELEVATOR_OPTIONS = ["有電梯", "無電梯"];

const STATUS_COLORS: Record<string, string> = {
  "待施工": "bg-amber-100 text-amber-700",
  "已完成": "bg-green-100 text-green-700",
  // backward compat for old statuses
  "待處理": "bg-amber-100 text-amber-700",
  "進行中": "bg-blue-100 text-blue-700",
  "已取消": "bg-gray-100 text-gray-700",
};

const PT_COLORS: Record<string, string> = {
  "新裝": "bg-purple-100 text-purple-700",
  "維修": "bg-red-100 text-red-700",
  "保養": "bg-teal-100 text-teal-700",
  "遷機": "bg-orange-100 text-orange-700",
  "清洗": "bg-sky-100 text-sky-700",
  "保固服務": "bg-green-100 text-green-700",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"); }
function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(data)}`;
}
function stampHtml(status: string) {
  if (status !== "已完成" && status !== "已取消") return "";
  const color = status === "已完成" ? "#16a34a" : "#6b7280";
  return `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:36pt;font-weight:900;color:${color};opacity:0.12;pointer-events:none;white-space:nowrap;user-select:none">${status}</div>`;
}

function getTechDisplay(order: any): string {
  try {
    const techs = order.technicians ? JSON.parse(order.technicians) : null;
    if (Array.isArray(techs) && techs.length) return techs.join("、");
  } catch { /* ignore */ }
  if (order.assignedTo) {
    return order.assignedTo + (order.assistantTo ? ` / ${order.assistantTo}` : "");
  }
  return "—";
}

// ─── Full A4 work order ──────────────────────────────────────────────────────
function printWorkOrder(order: any) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const erpUrl = `${window.location.origin}/work-orders`;
  const qr = qrUrl(`${erpUrl}?wo=${encodeURIComponent(woNum)}`);
  const logoUrl = `${window.location.origin}/logo.png`;
  const techDisplay = getTechDisplay(order);
  const html = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>派工單 ${woNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Microsoft JhengHei',Arial,sans-serif;font-size:11pt;color:#111;background:#fff}
.page{padding:12mm 16mm;position:relative;min-height:267mm}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:4mm;margin-bottom:4mm}
.co-name{font-size:20pt;font-weight:700}.co-sub{font-size:8.5pt;color:#555;margin-top:2px}
.wo-right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2mm}
.wo-num{font-size:14pt;font-weight:700}.wo-meta{font-size:9pt;color:#555}
h2{font-size:10pt;font-weight:700;background:#f3f3f3;padding:1.5mm 4mm;margin:3.5mm 0 2.5mm;border-left:3px solid #444}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm 10mm;margin:0 0 2mm}
.field{display:flex;gap:3mm;align-items:baseline}
.lbl{font-size:8pt;color:#666;min-width:50px;flex-shrink:0}.val{font-size:10pt;font-weight:500}
.full{grid-column:1/-1}
.box{border:1px solid #ccc;border-radius:2px;padding:2mm 3mm;min-height:14mm;font-size:10pt;white-space:pre-wrap;line-height:1.5}
.sigs{margin-top:10mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm}
.sig{text-align:center;border-top:1px solid #555;padding-top:2mm;font-size:8pt;color:#555;padding-bottom:6mm}
@media print{@page{size:A4;margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="page">
  ${stampHtml(order.status)}
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:4mm">
      <img src="${logoUrl}" style="width:14mm;height:14mm;border-radius:50%;object-fit:cover;border:1.5px solid #16a34a" alt="">
      <div>
        <div class="co-name">晟風工程</div>
        <div class="co-sub">冷氣空調工程專業服務</div>
      </div>
    </div>
    <div class="wo-right">
      <img src="${qr}" width="80" height="80" alt="QR" style="border:1px solid #e5e7eb;border-radius:2px">
      <div>
        <div class="wo-num">派工單 ${woNum}</div>
        <div class="wo-meta">狀態：${order.status}　列印：${new Date().toLocaleDateString('zh-TW')}</div>
        <div class="wo-meta">工程類型：${order.projectType || '—'}</div>
      </div>
    </div>
  </div>

  <h2>客戶資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">客戶名稱</span><span class="val">${esc(order.customerName || '—')}</span></div>
    <div class="field"><span class="lbl">聯絡人</span><span class="val">${esc(order.contactPerson || '—')}</span></div>
    <div class="field"><span class="lbl">行動電話</span><span class="val">${esc(order.mobilePhone || '—')}</span></div>
    <div class="field"><span class="lbl">聯絡電話</span><span class="val">${esc(order.telephone || '—')}</span></div>
    <div class="field full"><span class="lbl">施工地址</span><span class="val">${esc(order.installAddress || '—')}</span></div>
    ${order.installAddress ? `<div class="field full"><span class="lbl">地圖連結</span><span class="val" style="font-size:8pt">https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.installAddress)}</span></div>` : ''}
  </div>

  <h2>施工資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">施工日期</span><span class="val">${esc(order.scheduledDate || '—')}</span></div>
    <div class="field"><span class="lbl">施工時間</span><span class="val">${esc(order.scheduledTime || '—')}</span></div>
    <div class="field"><span class="lbl">完成日期</span><span class="val">${esc(order.completedDate || '—')}</span></div>
    <div class="field"><span class="lbl">狀態</span><span class="val">${esc(order.status)}</span></div>
    <div class="field full"><span class="lbl">施工技師</span><span class="val">${esc(techDisplay)}</span></div>
  </div>

  <h2>設備資訊</h2>
  <div class="grid">
    <div class="field"><span class="lbl">冷氣品牌</span><span class="val">${esc(order.acBrand || '—')}</span></div>
    <div class="field"><span class="lbl">型號</span><span class="val">${esc(order.modelNumber || '—')}</span></div>
    <div class="field"><span class="lbl">數量</span><span class="val">${order.quantity != null ? order.quantity + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">室內機</span><span class="val">${order.indoorUnits != null ? order.indoorUnits + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">室外機</span><span class="val">${order.outdoorUnits != null ? order.outdoorUnits + ' 台' : '—'}</span></div>
    <div class="field"><span class="lbl">樓層</span><span class="val">${esc(order.floorLevel || '—')}</span></div>
    <div class="field"><span class="lbl">電梯</span><span class="val">${esc(order.hasElevator || '—')}</span></div>
  </div>

  <h2>施工內容</h2>
  <div class="box">${esc(order.description || '（無）')}</div>

  <h2>施工備註</h2>
  <div class="box">${esc(order.notes || '（無）')}</div>

  <div class="sigs">
    <div class="sig">客戶簽名</div>
    <div class="sig">技師簽名</div>
    <div class="sig">公司經手人</div>
  </div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=1160");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── A4 Two-Copy Dispatch Form ───────────────────────────────────────────────
function printTwoCopyDispatch(order: any) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const erpUrl = `${window.location.origin}/work-orders`;
  const qr = qrUrl(`${erpUrl}?wo=${encodeURIComponent(woNum)}`);
  const logoUrl = `${window.location.origin}/logo.png`;
  const printDate = new Date().toLocaleDateString("zh-TW");
  const stamp = stampHtml(order.status);
  const techDisplay = getTechDisplay(order);
  const mapsLink = order.installAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.installAddress)}`
    : "";

  function copyHtml(label: string) {
    return `
<div class="copy" style="position:relative">
  ${stamp}
  <div class="hdr">
    <div class="co" style="display:flex;align-items:center;gap:3mm">
      <img src="${logoUrl}" style="width:11mm;height:11mm;border-radius:50%;object-fit:cover;border:1.5px solid #16a34a;flex-shrink:0" alt="">
      <div>
        <div class="co-name">晟風工程</div>
        <div class="co-sub">冷氣空調工程專業服務</div>
      </div>
    </div>
    <div class="mid">
      <div class="title">派 工 單</div>
      <div class="copy-label">${label}</div>
    </div>
    <div class="qr-block">
      <img src="${qr}" width="64" height="64" alt="QR">
      <div class="qr-label">${woNum}</div>
    </div>
  </div>

  <div class="row2">
    <div class="meta">列印日期：${printDate}</div>
    <div class="meta">工程類型：${esc(order.projectType || '—')}</div>
    <div class="meta">狀態：${esc(order.status)}</div>
  </div>

  <div class="grid">
    <div class="field"><span class="lbl">客戶名稱</span><span class="val">${esc(order.customerName || '—')}</span></div>
    <div class="field"><span class="lbl">聯絡人</span><span class="val">${esc(order.contactPerson || '—')}</span></div>
    <div class="field"><span class="lbl">行動電話</span><span class="val">${esc(order.mobilePhone || '—')}</span></div>
    <div class="field"><span class="lbl">聯絡電話</span><span class="val">${esc(order.telephone || '—')}</span></div>
    <div class="field full"><span class="lbl">施工地址</span><span class="val">${esc(order.installAddress || '—')}</span></div>
    ${mapsLink ? `<div class="field full"><span class="lbl">地圖</span><span class="val sm">${mapsLink}</span></div>` : ""}
    <div class="field"><span class="lbl">施工日期</span><span class="val">${esc(order.scheduledDate || '—')}</span></div>
    <div class="field"><span class="lbl">施工時間</span><span class="val">${esc(order.scheduledTime || '—')}</span></div>
    <div class="field full"><span class="lbl">施工技師</span><span class="val">${esc(techDisplay)}</span></div>
    <div class="field"><span class="lbl">冷氣品牌</span><span class="val">${esc(order.acBrand || '—')}</span></div>
    <div class="field"><span class="lbl">型號</span><span class="val">${esc(order.modelNumber || '—')}</span></div>
    <div class="field"><span class="lbl">數量</span><span class="val">${order.quantity != null ? order.quantity + " 台" : "—"}</span></div>
    <div class="field"><span class="lbl">室內機</span><span class="val">${order.indoorUnits != null ? order.indoorUnits + " 台" : "—"}</span></div>
    <div class="field"><span class="lbl">室外機</span><span class="val">${order.outdoorUnits != null ? order.outdoorUnits + " 台" : "—"}</span></div>
    <div class="field"><span class="lbl">樓層</span><span class="val">${esc(order.floorLevel || '—')}</span></div>
    <div class="field"><span class="lbl">電梯</span><span class="val">${esc(order.hasElevator || '—')}</span></div>
  </div>

  <div class="desc-row">
    <div class="desc-block">
      <div class="desc-lbl">施工內容</div>
      <div class="desc-val">${esc(order.description || '（無）')}</div>
    </div>
    <div class="desc-block">
      <div class="desc-lbl">施工備註</div>
      <div class="desc-val">${esc(order.notes || '（無）')}</div>
    </div>
  </div>

  <div class="sigs">
    <div class="sig">客戶簽名</div>
    <div class="sig">技師簽名</div>
    <div class="sig">公司經手人</div>
  </div>
</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>派工單（上下聯）${woNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;font-family:'Microsoft JhengHei',Arial,sans-serif;font-size:9pt;color:#111;background:#fff}
.copy{height:135mm;padding:5mm 12mm 3mm;overflow:hidden;position:relative}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1.5px solid #222;padding-bottom:3mm;margin-bottom:2.5mm}
.co-name{font-size:16pt;font-weight:700}.co-sub{font-size:7.5pt;color:#555;margin-top:1px}
.mid{text-align:center;flex:1}
.title{font-size:15pt;font-weight:800;letter-spacing:4px;margin-top:2mm}
.copy-label{font-size:8pt;color:#555;margin-top:1px;letter-spacing:1px;border:1px solid #888;display:inline-block;padding:0.5mm 3mm;border-radius:2px}
.qr-block{text-align:center}.qr-label{font-size:7pt;color:#555;margin-top:1px;font-family:monospace}
.row2{display:flex;gap:6mm;font-size:8pt;color:#555;margin-bottom:2mm}
.meta{white-space:nowrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 8mm;margin:0 0 1.5mm}
.field{display:flex;gap:2mm;align-items:baseline}
.lbl{font-size:7.5pt;color:#666;min-width:46px;flex-shrink:0}.val{font-size:9pt;font-weight:600}
.val.sm{font-size:7pt;font-weight:400;word-break:break-all}
.full{grid-column:1/-1}
.desc-row{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:1.5mm 0}
.desc-block{border:1px solid #ccc;border-radius:2px;padding:1.5mm 2mm}
.desc-lbl{font-size:7.5pt;color:#666;margin-bottom:1mm;font-weight:700}
.desc-val{font-size:8.5pt;white-space:pre-wrap;min-height:8mm;line-height:1.4}
.sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm;margin-top:3mm}
.sig{text-align:center;border-top:1px solid #555;padding-top:1.5mm;font-size:7.5pt;color:#555;padding-bottom:5mm}
.cut{height:0;border-top:2px dashed #888;margin:0 6mm;position:relative;display:flex;align-items:center;justify-content:center}
.cut-label{position:absolute;background:#fff;padding:0 3mm;font-size:7pt;color:#888;letter-spacing:1px}
@media print{
  @page{size:A4 portrait;margin:0}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>
${copyHtml("公司留底")}
<div class="cut"><span class="cut-label">✂ 沿此線裁切</span></div>
${copyHtml("師傅留底 / 現場簽收")}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=1160");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Dot-Matrix Triple-Copy (點陣三聯單) ─────────────────────────────────────
function printDotMatrixTriplicate(order: any) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const printDate = new Date().toLocaleDateString("zh-TW");
  const techDisplay = getTechDisplay(order);

  function triRow(label: string, value: string) {
    return `<tr><td class="lbl">${label}</td><td class="val">${value || "—"}</td></tr>`;
  }

  function copyHtml(label: string) {
    return `
<div class="copy">
  <div class="copy-hdr">
    <div class="co-title">晟風工程 派工單</div>
    <div class="copy-badge">${label}</div>
  </div>
  <div class="wo-num">${woNum}　　列印：${printDate}　　狀態：${order.status}</div>
  <table class="data-table">
    <tbody>
      ${triRow("客戶名稱", order.customerName || "")}
      ${triRow("聯絡人", order.contactPerson || "")}
      ${triRow("行動電話", order.mobilePhone || "")}
      ${triRow("聯絡電話", order.telephone || "")}
      ${triRow("施工地址", order.installAddress || "")}
      ${triRow("施工日期", order.scheduledDate || "")}
      ${triRow("施工時間", order.scheduledTime || "")}
      ${triRow("施工技師", techDisplay)}
      ${triRow("工程類型", order.projectType || "")}
      ${triRow("冷氣品牌", order.acBrand || "")}
      ${order.modelNumber ? triRow("型號", order.modelNumber) : ""}
      ${order.quantity != null ? triRow("數量", order.quantity + " 台") : ""}
      ${triRow("施工內容", (order.description || "").replace(/\n/g, " "))}
      ${triRow("施工備註", (order.notes || "").replace(/\n/g, " "))}
    </tbody>
  </table>
  <div class="sig-row">
    <div class="sig-box">客戶簽名</div>
    <div class="sig-box">技師簽名</div>
    <div class="sig-box">主管核章</div>
  </div>
</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>派工單三聯單 ${woNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;font-size:9pt;color:#000;background:#fff}
.copy{padding:3mm 5mm;border-bottom:2px dashed #555;page-break-inside:avoid;min-height:85mm;position:relative}
.copy:last-child{border-bottom:none}
.copy-hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:1.5mm;margin-bottom:2mm}
.co-title{font-size:13pt;font-weight:900;letter-spacing:1px}
.copy-badge{font-size:9pt;font-weight:700;border:2px solid #000;padding:0.5mm 3mm}
.wo-num{font-size:8pt;margin-bottom:2mm;letter-spacing:0.5px}
.data-table{width:100%;border-collapse:collapse}
.data-table td{font-size:8.5pt;padding:0.8mm 1mm;border-bottom:1px solid #ccc;vertical-align:top}
.lbl{width:55px;font-weight:700;white-space:nowrap;color:#333}
.val{word-break:break-all}
.sig-row{display:flex;gap:5mm;margin-top:3mm}
.sig-box{flex:1;text-align:center;border-top:1px solid #000;padding-top:1.5mm;font-size:8pt;padding-bottom:8mm}
@media print{
  @page{size:A4 portrait;margin:8mm 10mm}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .copy{page-break-inside:avoid}
}
</style></head><body>
${copyHtml("客戶聯")}
${copyHtml("公司聯")}
${copyHtml("師傅聯")}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=760,height=1100");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── LINE Share ─────────────────────────────────────────────────────────────
function shareViaLine(order: any) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const techDisplay = getTechDisplay(order);
  const mapsUrl = order.installAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.installAddress)}`
    : "";
  const lines = [
    "【晟風工程 派工通知】",
    "",
    `派工單號：${woNum}`,
    `客戶：${order.customerName || "—"}`,
    `行動電話：${order.mobilePhone || "—"}`,
    `施工地址：${order.installAddress || "—"}`,
    mapsUrl ? `地圖導航：${mapsUrl}` : "",
    "",
    `施工日期：${order.scheduledDate || "—"}`,
    `施工時間：${order.scheduledTime || "—"}`,
    "",
    `施工技師：${techDisplay}`,
    "",
    `施工內容：${order.description || "—"}`,
    order.notes ? `\n施工備註：${order.notes}` : "",
  ].filter(l => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
  window.open(`https://line.me/R/msg/text?${encodeURIComponent(lines)}`, "_blank");
}

// ─── Progress + Quick Payment Panel ────────────────────────────────────────
function ProgressPanel({ workOrderId, customerId, workOrderTitle }: {
  workOrderId: number; customerId: number; workOrderTitle: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isTechnician = user?.role === "technician";
  const { data: progress } = useListProgress(workOrderId);
  const [note, setNote] = useState("");
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: 0,
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "現金",
    notes: "",
  });

  const createProgress = useCreateProgress({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProgressQueryKey(workOrderId) });
        setNote("");
        toast({ title: "進度紀錄已新增" });
      },
    },
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
        setShowPayForm(false);
        toast({ title: "收款已登錄" });
      },
    },
  });

  const METHODS = ["現金", "銀行轉帳", "支票", "LINE Pay", "其他"];

  return (
    <div className="mt-3 ml-2 pl-3 border-l-2 border-muted space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">工程進度紀錄</p>
        {progress && progress.length > 0 ? progress.map(p => (
          <div key={p.id} className="text-xs bg-muted/30 rounded p-2">
            <p className="font-medium">{p.description}</p>
            <p className="text-muted-foreground mt-0.5">
              {new Date(p.createdAt).toLocaleString("zh-TW")}
              {p.recordedBy && ` · ${p.recordedBy}`}
            </p>
          </div>
        )) : <p className="text-xs text-muted-foreground">尚無進度紀錄</p>}
      </div>
      <div className="flex gap-2">
        <Input
          className="text-xs h-8 flex-1"
          placeholder="新增進度說明..."
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && note) createProgress.mutate({ workOrderId, data: { description: note } });
          }}
        />
        <Button
          size="sm" className="h-8 text-xs px-3"
          disabled={!note || createProgress.isPending}
          onClick={() => createProgress.mutate({ workOrderId, data: { description: note } })}
        >新增</Button>
      </div>
      {!isTechnician && !showPayForm && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowPayForm(true)}>
          <CreditCard className="h-3 w-3 mr-1" />登錄收款
        </Button>
      )}
      {!isTechnician && showPayForm && (
        <div className="bg-muted/30 rounded p-3 space-y-2">
          <p className="text-xs font-medium">快速登錄收款</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">金額</Label>
              <Input className="h-7 text-xs" type="number" value={payForm.amount || ""} onChange={e => setPayForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">日期</Label>
              <Input className="h-7 text-xs" type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">付款方式</Label>
            <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">備註</Label>
            <Input className="h-7 text-xs" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder={workOrderTitle} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" variant="ghost" onClick={() => setShowPayForm(false)}>取消</Button>
            <Button size="sm" className="h-7 text-xs" disabled={!payForm.amount || createPayment.isPending}
              onClick={() => createPayment.mutate({ data: { customerId, workOrderId, ...payForm } })}>
              儲存收款
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section heading ─────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 pb-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</p>
      <Separator className="mt-1" />
    </div>
  );
}

// ─── Empty form ──────────────────────────────────────────────────────────────
function makeEmpty() {
  return {
    quoteId: undefined as number | undefined,
    customerId: 0,
    title: "",
    status: "待施工",
    contactPerson: "",
    mobilePhone: "",
    telephone: "",
    installAddress: "",
    scheduledDate: "",
    scheduledTime: "",
    completedDate: "",
    technicians: [] as string[],
    projectType: "",
    acBrand: "",
    modelNumber: "",
    quantity: undefined as number | undefined,
    indoorUnits: undefined as number | undefined,
    outdoorUnits: undefined as number | undefined,
    floorLevel: "",
    hasElevator: "",
    description: "",
    notes: "",
  };
}

type WOForm = ReturnType<typeof makeEmpty>;

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function WorkOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === "super_admin" || user?.role === "owner" || user?.role === "admin";
  const queryClient = useQueryClient();

  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);
  const filterCustomerId = parseInt(urlParams.get("customerId") ?? "0", 10) || null;
  const filterCustomerName = urlParams.get("customerName") ?? "";

  const [statusFilter, setStatusFilter] = useState("全部");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<WOForm>(makeEmpty());
  const [arModal, setArModal] = useState<{ order: any; amount: string } | null>(null);
  const pendingARRef = useRef<any>(null);

  const { data: orders, isLoading } = useListWorkOrders({
    ...(filterCustomerId ? { customerId: filterCustomerId } : {}),
    ...(statusFilter !== "全部" ? { status: statusFilter } : {}),
  });
  const { data: customers } = useListCustomers({ includeOld: "true" });
  const { data: employees } = useListEmployees();
  const { data: quotes } = useListQuotes({ includeOld: "true" } as any);

  // Technician options: employees whose position contains "技師" and are active
  const technicianOptions = (employees ?? []).filter(e => e.position?.includes("技師") && e.status === "在職");

  const createMutation = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setShowCreate(false);
        toast({ title: "派工單已新增" });
      },
    },
  });
  const updateMutation = useUpdateWorkOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setEditItem(null);
        toast({ title: "派工單已更新" });
        if (pendingARRef.current) {
          const o = pendingARRef.current;
          pendingARRef.current = null;
          setArModal({ order: o, amount: "" });
        }
      },
    },
  });

  const createARMutation = useCreateReceivable({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
        setArModal(null);
        toast({ title: "應收帳款已建立", description: "可至「應收帳款」頁面查看" });
      },
      onError: (err: any) => {
        if (err?.status === 409) {
          toast({ title: "此派工單已有應收帳款紀錄" });
          setArModal(null);
        } else {
          toast({ title: "建立失敗，請稍後再試", variant: "destructive" });
        }
      },
    },
  });
  const deleteMutation = useDeleteWorkOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        setDeleteId(null);
        toast({ title: "派工單已刪除" });
      },
    },
  });

  function handleCustomerChange(v: string) {
    const cid = parseInt(v);
    const cust = customers?.find(c => c.id === cid);
    setForm(f => ({
      ...f,
      customerId: cid,
      mobilePhone: f.mobilePhone || cust?.phone || "",
      installAddress: f.installAddress || cust?.address || "",
    }));
  }

  function handleQuoteChange(v: string) {
    if (!v || v === "__none__") {
      setForm(f => ({ ...f, quoteId: undefined }));
      return;
    }
    const qid = parseInt(v);
    const quote = quotes?.find(q => q.id === qid);
    if (!quote) return;

    const cust = customers?.find(c => c.id === (quote.customerId ?? 0));
    setForm(f => ({
      ...f,
      quoteId: qid,
      customerId: quote.customerId ?? f.customerId,
      contactPerson: quote.contactPerson || f.contactPerson || "",
      mobilePhone: quote.customerPhone || cust?.phone || f.mobilePhone || "",
      installAddress: quote.address || cust?.address || f.installAddress || "",
      description: quote.description || f.description || "",
    }));
  }

  function openCreate() {
    setForm(makeEmpty());
    setShowCreate(true);
  }

  function openEdit(o: any) {
    let technicians: string[] = [];
    try {
      const parsed = o.technicians ? JSON.parse(o.technicians) : null;
      if (Array.isArray(parsed)) technicians = parsed;
    } catch { /* ignore */ }

    setForm({
      quoteId: o.quoteId ?? undefined,
      customerId: o.customerId,
      title: o.title ?? "",
      status: o.status,
      contactPerson: o.contactPerson ?? "",
      mobilePhone: o.mobilePhone ?? "",
      telephone: o.telephone ?? "",
      installAddress: o.installAddress ?? "",
      scheduledDate: o.scheduledDate ?? "",
      scheduledTime: o.scheduledTime ?? "",
      completedDate: o.completedDate ?? "",
      technicians,
      projectType: o.projectType ?? "",
      acBrand: o.acBrand ?? "",
      modelNumber: o.modelNumber ?? "",
      quantity: o.quantity ?? undefined,
      indoorUnits: o.indoorUnits ?? undefined,
      outdoorUnits: o.outdoorUnits ?? undefined,
      floorLevel: o.floorLevel ?? "",
      hasElevator: o.hasElevator ?? "",
      description: o.description ?? "",
      notes: o.notes ?? "",
    });
    setEditItem(o);
  }

  function buildPayload(f: WOForm) {
    const title = f.title.trim() || `${f.projectType || "派工"} 派工單`;
    return {
      customerId: f.customerId,
      quoteId: f.quoteId,
      title,
      status: f.status,
      contactPerson: f.contactPerson || undefined,
      mobilePhone: f.mobilePhone || undefined,
      telephone: f.telephone || undefined,
      installAddress: f.installAddress || undefined,
      scheduledDate: f.scheduledDate || undefined,
      scheduledTime: f.scheduledTime || undefined,
      completedDate: f.completedDate || undefined,
      technicians: f.technicians.length > 0 ? JSON.stringify(f.technicians) : undefined,
      projectType: f.projectType || undefined,
      acBrand: f.acBrand || undefined,
      modelNumber: f.modelNumber || undefined,
      quantity: f.quantity,
      indoorUnits: f.indoorUnits,
      outdoorUnits: f.outdoorUnits,
      floorLevel: f.floorLevel || undefined,
      hasElevator: f.hasElevator || undefined,
      description: f.description || undefined,
      notes: f.notes || undefined,
    };
  }

  function handleSubmit(e: React.FormEvent, mode: "create" | "edit") {
    e.preventDefault();
    if (!form.customerId) { toast({ title: "請選擇客戶", variant: "destructive" }); return; }
    const payload = buildPayload(form);
    if (mode === "create") {
      createMutation.mutate({ data: payload });
    } else {
      if (form.status === "已完成" && editItem?.status !== "已完成") {
        pendingARRef.current = { ...editItem, ...payload };
      }
      updateMutation.mutate({ id: editItem.id, data: payload });
    }
  }

  function toggleTechnician(name: string) {
    setForm(f => ({
      ...f,
      technicians: f.technicians.includes(name)
        ? f.technicians.filter(n => n !== name)
        : [...f.technicians, name],
    }));
  }

  const isDialogOpen = showCreate || !!editItem;
  const dialogMode = showCreate ? "create" : "edit";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">派工單管理</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">冷氣工程派工管理</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />新增派工單
          </Button>
        )}
      </div>

      {filterCustomerName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-800">篩選客戶：<strong>{filterCustomerName}</strong></span>
          <button className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs" onClick={() => navigate("/work-orders")}>
            <X className="h-3 w-3" />清除篩選
          </button>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {["全部", ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >{s}</button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : orders && orders.length > 0 ? (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {orders.map(o => {
              const techDisplay = getTechDisplay(o);
              return (
                <div key={o.id} className="px-3 sm:px-4 py-3">
                  {/* Row 1: number + badges + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-mono font-semibold text-muted-foreground">
                          {o.workOrderNumber || `#${o.id}`}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {o.status}
                        </span>
                        {o.projectType && (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${PT_COLORS[o.projectType] ?? "bg-gray-100 text-gray-600"}`}>
                            {o.projectType}
                          </span>
                        )}
                      </div>

                      {/* Row 2: customer + address */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="text-sm font-semibold">{o.customerName}</span>
                        {o.installAddress && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{o.installAddress}</span>
                        )}
                      </div>

                      {/* Row 3: date/time + technician */}
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {o.scheduledDate && (
                          <span>施工：{o.scheduledDate}{o.scheduledTime ? ` ${o.scheduledTime}` : ""}</span>
                        )}
                        {techDisplay !== "—" && <span>技師：{techDisplay}</span>}
                        {o.completedDate && <span className="text-green-600">完成：{o.completedDate}</span>}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-0.5 shrink-0 flex-wrap justify-end">
                      {/* AR button for completed orders */}
                      {canWrite && o.status === "已完成" && (
                        <Button
                          variant="outline" size="sm"
                          className="h-7 text-xs px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => setArModal({ order: o, amount: "" })}
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1" />建立帳款
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="列印">
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => printDotMatrixTriplicate(o)}>
                            <FileText className="h-3.5 w-3.5 mr-2" />點陣三聯單
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printTwoCopyDispatch(o)}>
                            <FileText className="h-3.5 w-3.5 mr-2" />A4 上下聯派工單
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printWorkOrder(o)}>
                            <Printer className="h-3.5 w-3.5 mr-2" />A4 完整派工單
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="LINE 分享" onClick={() => shareViaLine(o)}>
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      {o.installAddress && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700" title="導航" asChild>
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.installAddress)}`} target="_blank" rel="noopener noreferrer">
                            <MapPin className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="進度" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                        {expandedId === o.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      {canWrite && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="編輯" onClick={() => openEdit(o)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(user?.role === "owner" || user?.role === "super_admin") && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="刪除" onClick={() => setDeleteId(o.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress panel */}
                  {expandedId === o.id && (
                    <ProgressPanel workOrderId={o.id} customerId={o.customerId} workOrderTitle={o.workOrderNumber || o.title} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-12 text-center">
          <p className="text-muted-foreground">尚無派工單資料</p>
        </CardContent></Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={open => { if (!open) { setShowCreate(false); setEditItem(null); } }}>
        <DialogContent className="max-w-2xl w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "新增派工單" : `編輯派工單 ${editItem?.workOrderNumber || ""}`}</DialogTitle>
          </DialogHeader>

          <form onSubmit={e => handleSubmit(e, dialogMode)} className="space-y-4 mt-1">

            {/* ── 對應報價單 ── */}
            <SectionHeading>對應報價單（選填）</SectionHeading>
            <div className="space-y-1">
              <Label>報價單</Label>
              <Select
                value={form.quoteId ? String(form.quoteId) : "__none__"}
                onValueChange={handleQuoteChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇報價單（可不填）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（不連結報價單）</SelectItem>
                  {(quotes ?? []).map(q => (
                    <SelectItem key={q.id} value={String(q.id)}>
                      {q.title}{q.customerName ? ` — ${q.customerName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.quoteId && (
                <p className="text-xs text-muted-foreground">已自動帶入報價單客戶資料，可修改</p>
              )}
            </div>

            {/* ── 客戶資訊 ── */}
            <SectionHeading>客戶資訊</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>客戶 *</Label>
                <Select
                  value={form.customerId ? String(form.customerId) : ""}
                  onValueChange={handleCustomerChange}
                  disabled={dialogMode === "edit"}
                >
                  <SelectTrigger><SelectValue placeholder="選擇客戶" /></SelectTrigger>
                  <SelectContent>
                    {customers?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>聯絡人</Label>
                <Input placeholder="聯絡人姓名" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>行動電話</Label>
                <Input type="tel" placeholder="0912-345-678" value={form.mobilePhone} onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>聯絡電話</Label>
                <Input type="tel" placeholder="(02) 1234-5678" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>施工地址</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="施工地址"
                    value={form.installAddress}
                    onChange={e => setForm(f => ({ ...f, installAddress: e.target.value }))}
                  />
                  {form.installAddress && (
                    <Button type="button" variant="outline" size="icon" asChild title="Google Maps 導航">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.installAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* ── 施工資訊 ── */}
            <SectionHeading>施工資訊</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>狀態</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>施工日期</Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>施工時間</Label>
                <Input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>完成日期</Label>
                <Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>工程類型</Label>
                <Select value={form.projectType} onValueChange={v => setForm(f => ({ ...f, projectType: v }))}>
                  <SelectTrigger><SelectValue placeholder="選擇類型" /></SelectTrigger>
                  <SelectContent>{PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>工程標題</Label>
                <Input
                  placeholder={`${form.projectType || "派工"} 派工單`}
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
            </div>

            {/* ── 施工技師 ── */}
            <div className="space-y-1">
              <Label>施工技師</Label>
              {technicianOptions.length > 0 ? (
                <div className="border rounded-md p-2 max-h-36 overflow-y-auto space-y-1.5">
                  {technicianOptions.map(emp => (
                    <div key={emp.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`tech-${emp.id}`}
                        checked={form.technicians.includes(emp.name)}
                        onCheckedChange={() => toggleTechnician(emp.name)}
                      />
                      <label htmlFor={`tech-${emp.id}`} className="text-sm cursor-pointer">{emp.name}</label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground border rounded-md p-2">尚無在職技師資料（請至員工管理新增職位為「師傅技師」的員工）</p>
              )}
              {form.technicians.length > 0 && (
                <p className="text-xs text-muted-foreground">已選：{form.technicians.join("、")}</p>
              )}
            </div>

            {/* ── 冷氣設備 ── */}
            <SectionHeading>冷氣設備</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>冷氣品牌</Label>
                <Input placeholder="大金、日立…" value={form.acBrand} onChange={e => setForm(f => ({ ...f, acBrand: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>型號</Label>
                <Input placeholder="型號" value={form.modelNumber} onChange={e => setForm(f => ({ ...f, modelNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>數量（台）</Label>
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={form.quantity ?? ""}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value ? parseInt(e.target.value) : undefined }))}
                />
              </div>
              <div className="space-y-1">
                <Label>室內機（台）</Label>
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={form.indoorUnits ?? ""}
                  onChange={e => setForm(f => ({ ...f, indoorUnits: e.target.value ? parseInt(e.target.value) : undefined }))}
                />
              </div>
              <div className="space-y-1">
                <Label>室外機（台）</Label>
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={form.outdoorUnits ?? ""}
                  onChange={e => setForm(f => ({ ...f, outdoorUnits: e.target.value ? parseInt(e.target.value) : undefined }))}
                />
              </div>
              <div className="space-y-1">
                <Label>樓層</Label>
                <Input placeholder="例：3樓" value={form.floorLevel} onChange={e => setForm(f => ({ ...f, floorLevel: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>電梯</Label>
                <Select value={form.hasElevator} onValueChange={v => setForm(f => ({ ...f, hasElevator: v }))}>
                  <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">（未填）</SelectItem>
                    {ELEVATOR_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── 施工內容 ── */}
            <SectionHeading>施工說明</SectionHeading>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>施工內容</Label>
                <Textarea
                  rows={3}
                  placeholder="描述施工內容、要求…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>施工備註</Label>
                <Textarea
                  rows={2}
                  placeholder="停車、進出限制、注意事項…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreate(false); setEditItem(null); }}
              >取消</Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除這筆派工單嗎？相關進度紀錄也會一併刪除。</AlertDialogDescription>
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

      {/* AR creation modal */}
      <Dialog open={!!arModal} onOpenChange={open => { if (!open) setArModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>建立應收帳款</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            是否為此派工單建立應收帳款？
          </p>
          {arModal && (
            <div className="text-xs text-muted-foreground bg-muted rounded p-2 space-y-1">
              {arModal.order.workOrderNumber && <div>派工單號：{arModal.order.workOrderNumber}</div>}
              <div>工程：{arModal.order.title}</div>
              {arModal.order.customerName && <div>客戶：{arModal.order.customerName}</div>}
              {arModal.order.projectType && <div>類別：{arModal.order.projectType}</div>}
            </div>
          )}
          <div className="space-y-1">
            <Label>應收金額 (NT$)</Label>
            <Input
              type="number"
              placeholder="請輸入金額"
              value={arModal?.amount ?? ""}
              onChange={e => setArModal(m => m ? { ...m, amount: e.target.value } : m)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArModal(null)}>略過</Button>
            <Button
              disabled={createARMutation.isPending}
              onClick={() => {
                if (!arModal) return;
                const o = arModal.order;
                createARMutation.mutate({ data: {
                  customerId: o.customerId,
                  workOrderId: o.id,
                  workOrderNumber: o.workOrderNumber ?? undefined,
                  projectName: o.title,
                  projectType: o.projectType ?? undefined,
                  completionDate: o.completedDate ?? undefined,
                  totalAmount: parseFloat(arModal.amount) || 0,
                }});
              }}
            >確認建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
