import { buildWorkOrderHtml, type WorkOrderHtmlMode } from "@/components/pdf/templates/WorkOrderTemplate";
import { buildDeliveryHtml, type DeliveryHtmlMode } from "@/components/pdf/templates/DeliveryTemplate";
import { handlePdfAction, isMobileDevice, openPrintWindow } from "@/components/pdf/pdf-service";
import { loadPrintCalibration } from "@/lib/printPaperConfig";

export const WO_PRINT_FORMATS = [
  { id: "a4-landscape", label: "A4 橫式派工單" },
  { id: "continuous-print", label: "點陣連續紙" },
  { id: "thermal-80", label: "80mm 熱感紙" },
  { id: "thermal-58", label: "58mm 熱感紙（預覽）" },
] as const;

export type WoPrintFormatId = (typeof WO_PRINT_FORMATS)[number]["id"];

const STORAGE_KEY = "shengfeng.woPrintFormat";

export function loadWoPrintFormat(): WoPrintFormatId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (WO_PRINT_FORMATS.some((f) => f.id === v)) return v as WoPrintFormatId;
  } catch { /* ignore */ }
  return "a4-landscape";
}

export function saveWoPrintFormat(id: WoPrintFormatId) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

export async function printWorkOrderDocument(
  order: any,
  format: WoPrintFormatId,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const woNum = order.workOrderNumber || `#${order.id}`;
  const mode = format as WorkOrderHtmlMode;
  const html = buildWorkOrderHtml(order, {
    mode,
    calibration: format === "continuous-print" ? loadPrintCalibration() : undefined,
  });
  const title = `晟風工程派工單 — ${woNum}`;
  if (isMobileDevice() && format === "a4-landscape") {
    await handlePdfAction({
      html,
      docNo: woNum,
      filename: `派工單_${woNum}.pdf`,
      title: "晟風工程派工單",
      action: "download",
      setPdfPreview,
      toast,
      pageFormat: "a4-landscape",
    });
    return;
  }
  openPrintWindow(html, title);
}

export async function printDeliveryDocument(
  order: any,
  format: "a4-landscape" | "continuous-print",
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
) {
  const orderNo = order.orderNumber || `WO-${String(order.id).padStart(4, "0")}`;
  const mode = format as DeliveryHtmlMode | "a4-landscape";
  const html = buildDeliveryHtml(order, {
    mode: mode === "a4-landscape" ? "a4-landscape" : mode,
    calibration: format === "continuous-print" ? loadPrintCalibration() : undefined,
  } as any);
  if (isMobileDevice() && format === "a4-landscape") {
    await handlePdfAction({
      html,
      docNo: orderNo,
      filename: `出貨單_${orderNo}.pdf`,
      title: "晟風工程出貨單",
      action: "download",
      setPdfPreview,
      toast,
      pageFormat: "a4-landscape",
    });
    return;
  }
  openPrintWindow(html, `晟風工程出貨單 — ${orderNo}`);
}
