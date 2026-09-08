import { getWholesaleOrder } from "@workspace/api-client-react";
import { handlePdfAction, isMobileDevice, openPrintWindow } from "@/components/pdf/pdf-service";
import { buildDeliveryHtml } from "@/components/pdf/templates/DeliveryTemplate";
import { buildWholesaleMonthlyStatementHtml } from "@/components/pdf/templates/WholesaleMonthlyStatementTemplate";
import { loadPrintCalibration } from "@/lib/printPaperConfig";
import type { CustomerStatement } from "@/lib/wholesaleAccountApi";

async function loadOrderForPrint(order: any, customers?: any[]): Promise<any> {
  if (!order?.id) throw new Error("找不到出貨單");
  const full = await getWholesaleOrder(order.id);
  if (!full) throw new Error("找不到出貨單");
  const cust = (customers ?? []).find((c: any) => c.id === full.customerId);
  return {
    ...full,
    customerName: full.customerName || cust?.companyName || "",
    customerPhone: (full as any).customerPhone || cust?.mobile || cust?.telephone || "",
    customerAddress: (full as any).customerAddress || (full as any).deliveryAddress || cust?.address || "",
  };
}

export async function printWholesaleDelivery(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
  customers?: any[],
) {
  let full: any;
  try {
    full = await loadOrderForPrint(order, customers);
  } catch {
    toast({ title: "無法載入出貨單", description: "請稍後再試", variant: "destructive" });
    return;
  }
  const orderNo = full.orderNumber || `WO-${String(full.id).padStart(4, "0")}`;
  if (isMobileDevice()) {
    const html = buildDeliveryHtml(full);
    await handlePdfAction({
      html,
      docNo: orderNo,
      filename: `出貨單_${orderNo}.pdf`,
      title: "晟風工程出貨單",
      action: "download",
      setPdfPreview,
      toast,
      pageFormat: "custom-240x140-landscape",
    });
  } else {
    const html = buildDeliveryHtml(full, {
      mode: "continuous-print",
      calibration: loadPrintCalibration(),
    });
    openPrintWindow(html, `晟風工程出貨單 — ${orderNo}`);
  }
}

export async function shareWholesaleDelivery(
  order: any,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
  customers?: any[],
) {
  let full: any;
  try {
    full = await loadOrderForPrint(order, customers);
  } catch {
    toast({ title: "無法載入出貨單", description: "請稍後再試", variant: "destructive" });
    return;
  }
  const orderNo = full.orderNumber || `WO-${String(full.id).padStart(4, "0")}`;
  const html = buildDeliveryHtml(full);
  await handlePdfAction({
    html,
    docNo: orderNo,
    filename: `出貨單_${orderNo}.pdf`,
    title: "晟風工程出貨單",
    action: "share",
    setPdfPreview,
    toast,
    pageFormat: "custom-240x140-landscape",
  });
}

export async function printWholesaleStatement(
  stmt: CustomerStatement,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
  toast: any,
  action: "print" | "download" | "share" = "print",
) {
  const html = buildWholesaleMonthlyStatementHtml(stmt);
  const docNo = `${stmt.customer.companyName}_${stmt.month}`;
  if (action === "share" || isMobileDevice() || action === "download") {
    await handlePdfAction({
      html,
      docNo,
      filename: `對帳單_${docNo}.pdf`,
      title: "晟風工程批發月結對帳單",
      action: action === "print" ? "download" : action,
      setPdfPreview,
      toast,
      pageFormat: "a4",
    });
    return;
  }
  openPrintWindow(html, `晟風工程批發月結對帳單 — ${docNo}`);
}
