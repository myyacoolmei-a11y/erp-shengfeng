// PDF V5 Shared Service
// Off-screen iframe render + style injection for mobile PDF generation
// html2pdf is statically imported so SW/SPA cannot serve index.html as the module.

import html2pdfFactory from "html2pdf.js";
import { PRINT_CJK_FONT_STACK, PRINT_CJK_FONT_FACE_CSS } from "@/components/pdf/templates/brand-config";
import { QUOTE_EQ_COL_WIDTHS } from "@/components/pdf/templates/QuotationTemplate";

export interface PdfBlobResult {
  blob: Blob;
  docNo: string;
  html: string;
}

export type PageFormat = "a4" | "custom-240x140-landscape";

const PAGE_CONFIG: Record<PageFormat, { format: string | number[]; orientation: "portrait" | "landscape"; margin: number[]; scale: number; renderWidth: number }> = {
  // 210mm @ 96dpi ≈ 794px，與 A4 CSS mm 單位同比例，避免 canvas 被非等比拉高／壓窄
  "a4": { format: "a4", orientation: "portrait", margin: [10, 12, 10, 12], scale: 2, renderWidth: 794 },
  // 240mm @ 96dpi ≈ 907px
  "custom-240x140-landscape": { format: [240, 140] as any, orientation: "landscape", margin: [0, 0, 0, 0], scale: 2, renderWidth: 907 },
};

function resolveHtml2Pdf(): any {
  const mod: any = html2pdfFactory;
  return typeof mod === "function" ? mod : mod?.default ?? mod;
}

/** html2canvas clone: lock quotation equipment columns so wrapped CJK cannot bleed. */
function applyQuotationEqTableCloneFixes(clonedDoc: Document) {
  const root = clonedDoc.querySelector(".quotation-print-page");
  if (!root) return;

  const style = clonedDoc.createElement("style");
  style.setAttribute("data-quote-eq-flow", "1");
  const colRules = QUOTE_EQ_COL_WIDTHS.map((w, i) => {
    const n = i + 1;
    return `.quotation-print-page .eq-table col:nth-child(${n}),.quotation-print-page .eq-table th:nth-child(${n}),.quotation-print-page .eq-table td:nth-child(${n}){width:${w}!important;max-width:${w}!important;min-width:0!important}`;
  }).join("");
  style.textContent = `
.quotation-print-page .eq-table{
  table-layout:fixed!important;
  width:100%!important;
  max-width:100%!important;
  border-collapse:collapse!important;
}
${colRules}
.quotation-print-page .eq-table tr,
.quotation-print-page .eq-table th,
.quotation-print-page .eq-table td,
.quotation-print-page .eq-table .cell-text{
  height:auto!important;
  max-height:none!important;
  min-height:0!important;
  position:static!important;
  transform:none!important;
  box-sizing:border-box!important;
  overflow:hidden!important;
  line-height:1.35!important;
}
.quotation-print-page .eq-table th,
.quotation-print-page .eq-table td{
  white-space:normal!important;
  overflow-wrap:anywhere!important;
  word-break:break-word!important;
  vertical-align:middle!important;
  padding:7px 6px!important;
}
.quotation-print-page .eq-table .cell-text{
  display:block!important;
  width:100%!important;
  max-width:100%!important;
  padding:0!important;
}
.quotation-print-page .eq-table .col-price,
.quotation-print-page .eq-table .col-sub,
.quotation-print-page .eq-table .col-qty,
.quotation-print-page .eq-table .col-unit,
.quotation-print-page .eq-table .col-no,
.quotation-print-page .eq-table .col-price .cell-text,
.quotation-print-page .eq-table .col-sub .cell-text,
.quotation-print-page .eq-table .col-qty .cell-text,
.quotation-print-page .eq-table .col-unit .cell-text,
.quotation-print-page .eq-table .col-no .cell-text{
  white-space:nowrap!important;
}
`;
  clonedDoc.head.appendChild(style);

  const table = root.querySelector(".eq-table") as HTMLTableElement | null;
  if (table) {
    table.style.setProperty("table-layout", "fixed", "important");
    table.style.setProperty("width", "100%", "important");
    table.style.setProperty("max-width", "100%", "important");
    table.querySelectorAll("col").forEach((node, i) => {
      const w = QUOTE_EQ_COL_WIDTHS[i];
      if (!w) return;
      const col = node as HTMLElement;
      col.style.setProperty("width", w, "important");
    });
    table.querySelectorAll("tr").forEach((tr) => {
      [...tr.children].forEach((cell, i) => {
        const w = QUOTE_EQ_COL_WIDTHS[i];
        if (!w) return;
        const h = cell as HTMLElement;
        h.style.setProperty("width", w, "important");
        h.style.setProperty("max-width", w, "important");
        h.style.setProperty("min-width", "0", "important");
        h.style.setProperty("box-sizing", "border-box", "important");
        h.style.setProperty("overflow", "hidden", "important");
      });
    });
  }

  root.querySelectorAll(".eq-table, .eq-table tr, .eq-table th, .eq-table td, .eq-table .cell-text").forEach((node) => {
    const h = node as HTMLElement;
    h.style.setProperty("height", "auto", "important");
    h.style.setProperty("max-height", "none", "important");
    h.style.setProperty("min-height", "0", "important");
    h.style.setProperty("position", "static", "important");
    h.style.setProperty("transform", "none", "important");
    h.style.setProperty("line-height", "1.35", "important");
    h.style.setProperty("box-sizing", "border-box", "important");
    h.style.setProperty("overflow", "hidden", "important");
  });
  root.querySelectorAll(".eq-table td, .eq-table th").forEach((node) => {
    const h = node as HTMLElement;
    const nowrap = h.classList.contains("col-price") || h.classList.contains("col-sub")
      || h.classList.contains("col-qty") || h.classList.contains("col-unit") || h.classList.contains("col-no");
    const isHead = h.tagName === "TH";
    const isMoney = h.classList.contains("col-price") || h.classList.contains("col-sub");
    h.style.setProperty("white-space", nowrap ? "nowrap" : "normal", "important");
    h.style.setProperty("overflow-wrap", nowrap ? "normal" : "anywhere", "important");
    h.style.setProperty("word-break", nowrap ? "keep-all" : "break-word", "important");
    h.style.setProperty("vertical-align", "middle", "important");
    h.style.setProperty("padding", "7px 6px", "important");
    h.style.setProperty("font-weight", isHead || isMoney ? "600" : "500", "important");
    h.style.setProperty("font-size", isMoney ? "10.5px" : "11px", "important");
    h.style.setProperty("line-height", "1.35", "important");
  });
  root.querySelectorAll(".eq-table .cell-text").forEach((node) => {
    const h = node as HTMLElement;
    h.style.setProperty("display", "block", "important");
    h.style.setProperty("width", "100%", "important");
    h.style.setProperty("max-width", "100%", "important");
    h.style.setProperty("padding", "0", "important");
  });
}

/** Ensure a Blob looks like a real PDF before opening/downloading. */
export function assertPdfBlob(blob: Blob, context = "PDF"): Blob {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("text/html")) {
    throw new Error(
      `${context} 產生失敗：收到 HTML 而非 PDF（可能是靜態資源被 SPA 攔截）。請重新整理後再試。`,
    );
  }
  if (type && !type.includes("application/pdf") && type !== "application/octet-stream") {
    throw new Error(`${context} 產生失敗：Content-Type 不是 application/pdf（收到 ${blob.type || "empty"}）`);
  }
  if (!blob || blob.size === 0) {
    throw new Error(`${context} 產生失敗：產生的 PDF 檔案為空`);
  }
  // Normalize MIME for Safari / object URLs
  if (!type.includes("application/pdf")) {
    return new Blob([blob], { type: "application/pdf" });
  }
  return blob;
}

/**
 * When fetching a PDF URL: only call response.blob() if Content-Type is application/pdf.
 * Otherwise surface JSON/text error — never treat HTML as a PDF module/blob.
 */
export async function fetchPdfResponse(url: string, init?: RequestInit): Promise<Blob> {
  const response = await fetch(url, init);
  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      if (contentType.includes("application/json")) {
        const data = await response.json();
        message = data?.message || data?.error || message;
      } else {
        const text = await response.text();
        if (text && !text.trimStart().startsWith("<!")) message = text.slice(0, 300);
        else if (contentType.includes("text/html")) {
          message = `伺服器回傳 HTML 錯誤頁（HTTP ${response.status}），而非 PDF`;
        }
      }
    } catch {
      /* keep status message */
    }
    throw new Error(message);
  }

  if (!contentType.includes("application/pdf")) {
    let detail = `Content-Type: ${contentType || "(missing)"}`;
    try {
      if (contentType.includes("application/json")) {
        const data = await response.json();
        detail = data?.message || data?.error || detail;
      } else {
        const text = await response.text();
        if (contentType.includes("text/html") || text.trimStart().startsWith("<!")) {
          detail = "伺服器回傳了 HTML（可能是 SPA fallback / index.html），不是 PDF";
        } else if (text) {
          detail = text.slice(0, 300);
        }
      }
    } catch {
      /* keep detail */
    }
    throw new Error(`PDF 下載失敗：${detail}`);
  }

  const blob = await response.blob();
  return assertPdfBlob(blob, "PDF 下載");
}

/** Generate PDF blob from HTML string using off-screen iframe render */
export async function generatePdfBlobFromHtml(
  html: string,
  docNo: string,
  pageFormat: PageFormat = "a4",
): Promise<PdfBlobResult> {
  const cfg = PAGE_CONFIG[pageFormat];
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:0;left:0;width:${cfg.renderWidth}px;height:2400px;opacity:0;pointer-events:none;touch-action:none;overflow:hidden;border:none;`;
  document.body.appendChild(iframe);

  let tempNodes: HTMLElement[] = [];
  try {
    const doc = iframe.contentDocument || iframe.contentWindow!.document;
    doc.open();
    doc.write(html);
    doc.close();

    const body = doc.body;
    await doc.fonts.ready;
    try {
      await Promise.all([
        doc.fonts.load('400 16px "Noto Sans TC"'),
        doc.fonts.load('500 16px "Noto Sans TC"'),
        doc.fonts.load('700 14px "Noto Sans TC"'),
        doc.fonts.load('700 18px "Noto Sans TC"'),
      ]);
    } catch {
      /* 本機未安裝 Noto 時仍用 PingFang／微軟正黑體 */
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const images = Array.from(body.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if ((img as HTMLImageElement).complete) resolve();
            else {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }
          }),
      ),
    );

    if (body.offsetWidth <= 0 || body.offsetHeight <= 0) {
      console.error("[PDF V5] iframe render failed:", body.offsetWidth, body.offsetHeight);
      throw new Error("PDF 產生失敗：DOM 尚未完整 render");
    }

    // Quotation uses .quotation-print-page; other templates still use .page
    const pageEl = body.querySelector(".page, .quotation-print-page") as HTMLElement | null;
    if (!pageEl) {
      throw new Error("PDF 產生失敗：找不到 .page / .quotation-print-page 列印容器");
    }
    pageEl.dataset.templateType = pageFormat;
    const isQuotation = pageEl.classList.contains("quotation-print-page");
    const isA4Portrait = pageFormat === "a4";
    // 報價單：依 A4 直式可印寬 186mm 排版，不要先做橫式再 scale。
    const captureWidth = isQuotation ? Math.round(186 * 96 / 25.4) : cfg.renderWidth;
    const pdfOrientation: "portrait" | "landscape" = isQuotation || isA4Portrait ? "portrait" : cfg.orientation;
    const pdfFormat = isQuotation || isA4Portrait ? "a4" : cfg.format;
    const pdfMargin = isQuotation ? [10, 12, 10, 12] : cfg.margin;
    iframe.style.width = `${captureWidth}px`;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    console.log("PDF capture target:", pageEl.className, pageEl.dataset.templateType, {
      captureWidth, pdfOrientation, pdfFormat,
    });

    // html2pdf.js deep-clones the element into the main document; CSS from the iframe <head> is lost.
    // Inject fonts + iframe styles into the main document so the clone does not inherit Inter.
    const fontStyle = document.createElement("style");
    fontStyle.textContent = PRINT_CJK_FONT_FACE_CSS;
    fontStyle.dataset.pdfTempStyle = "1";
    document.head.appendChild(fontStyle);
    tempNodes.push(fontStyle);
    try {
      await Promise.all([
        document.fonts.load('400 16px "Noto Sans TC"'),
        document.fonts.load('700 14px "Noto Sans TC"'),
        document.fonts.load('700 18px "Noto Sans TC"'),
      ]);
    } catch {
      /* 系統正黑體仍可使用 */
    }

    const iframeStyles = Array.from(doc.querySelectorAll("style"));
    iframeStyles.forEach((styleEl) => {
      const newStyle = document.createElement("style");
      newStyle.textContent = styleEl.textContent || "";
      newStyle.dataset.pdfTempStyle = "1";
      document.head.appendChild(newStyle);
      tempNodes.push(newStyle);
    });

    let html2pdf: any;
    try {
      html2pdf = resolveHtml2Pdf();
      if (typeof html2pdf !== "function") {
        throw new Error("html2pdf 模組載入失敗");
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("MIME type") || msg.includes("text/html")) {
        throw new Error(
          "PDF 引擎載入失敗：靜態 JS 被回傳成 HTML（常見於舊版 PWA 快取）。請強制重新整理或清除網站資料後再試。",
        );
      }
      throw e;
    }

    const opt = {
      margin: pdfMargin,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: cfg.scale,
        useCORS: true,
        logging: false,
        windowWidth: captureWidth,
        letterRendering: false,
        onclone: (clonedDoc: Document) => {
          const el = clonedDoc.querySelector(".page, .quotation-print-page") as HTMLElement | null;
          if (!el) return;
          el.style.setProperty("font-family", PRINT_CJK_FONT_STACK, "important");
          el.style.setProperty("transform", "none", "important");
          el.querySelectorAll(".eq-table, .eq-table th, .eq-table td, .cp-mat-row, .cp-mat-name, .cp-mat-qty, .cp-mat-no").forEach((node) => {
            const h = node as HTMLElement;
            h.style.setProperty("font-family", PRINT_CJK_FONT_STACK, "important");
            h.style.setProperty("transform", "none", "important");
            h.style.setProperty("letter-spacing", "0", "important");
          });
          applyQuotationEqTableCloneFixes(clonedDoc);
        },
      },
      jsPDF: { unit: "mm", format: pdfFormat, orientation: pdfOrientation },
      pagebreak: { mode: ["css", "legacy"], avoid: [".bottom-block", "tr", ".quotation-signature-section"] },
    };

    const worker = html2pdf().set(opt).from(pageEl);
    await worker.toPdf();
    const pdf = worker.prop.pdf;
    const rawBlob: Blob = pdf.output("blob");
    const blob = assertPdfBlob(rawBlob, "PDF");

    return { blob, docNo, html };
  } finally {
    tempNodes.forEach((el) => el.remove());
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}

/** Download PDF blob as file */
export function downloadPdf(blob: Blob, filename: string) {
  const safe = assertPdfBlob(blob, "下載");
  const url = URL.createObjectURL(safe);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Open PDF blob in a new tab for print / preview */
export function printPdf(blob: Blob, _filename: string) {
  const safe = assertPdfBlob(blob, "列印");
  const url = URL.createObjectURL(safe);
  const win = window.open(url, "_blank");
  if (win) {
    win.focus();
    setTimeout(() => {
      try { win.print(); } catch (_) {}
    }, 800);
  }
}

/** Share PDF via Web Share API; fallback to preview dialog */
export async function sharePdf(
  blob: Blob,
  filename: string,
  title: string,
  setPdfPreview: (v: { url: string; filename: string } | null) => void,
): Promise<{ shared: boolean; via: string }> {
  const safe = assertPdfBlob(blob, "分享");
  const file = new File([safe], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return { shared: true, via: "navigator.share" };
  }
  const url = URL.createObjectURL(safe);
  setPdfPreview({ url, filename });
  return { shared: false, via: "preview" };
}

/** Combined: generate + handle mobile/desktop flow */
export async function handlePdfAction(options: {
  html: string;
  docNo: string;
  filename: string;
  title: string;
  action: "download" | "print" | "share" | "preview";
  setPdfPreview: (v: { url: string; filename: string } | null) => void;
  toast: (opts: { title: string; description?: string; variant?: string }) => void;
  pageFormat?: PageFormat;
}): Promise<Blob | null> {
  const { html, docNo, filename, title, action, setPdfPreview, toast, pageFormat } = options;
  toast({ title: "PDF 產生中…", description: "請稍候，請勿重複點擊" });

  try {
    const { blob } = await generatePdfBlobFromHtml(html, docNo, pageFormat);

    if (action === "download") {
      downloadPdf(blob, filename);
      toast({ title: "已下載 PDF", description: filename });
      return blob;
    }
    if (action === "print") {
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, filename });
      toast({ title: "已開啟 PDF 預覽", description: "可由此列印或下載" });
      return blob;
    }
    if (action === "share") {
      try {
        const result = await sharePdf(blob, filename, title, setPdfPreview);
        if (result.shared) {
          toast({ title: "已開啟分享", description: "請選擇 LINE 或其他 App" });
        } else {
          toast({ title: "此裝置不支援直接分享", description: "已開啟 PDF 預覽，請手動分享" });
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast({ title: "分享取消", description: "使用者取消了分享" });
        } else {
          toast({ title: "分享失敗", description: String(e?.message || e), variant: "destructive" });
        }
      }
      return blob;
    }
    if (action === "preview") {
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, filename });
      toast({ title: "已開啟 PDF 預覽", description: "可下載、分享或列印" });
      return blob;
    }
    return blob;
  } catch (e: any) {
    const msg = String(e?.message || e);
    toast({ title: "PDF 產生失敗", description: msg, variant: "destructive" });
    return null;
  }
}

/** Open HTML in a new window and print after the document has actually loaded. */
export function openPrintWindow(html: string, _title: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast({ title: "無法開啟列印視窗", description: "請檢查彈出視窗設定", variant: "destructive" });
    return;
  }

  let printed = false;
  const attemptPrint = () => {
    if (printed) return;
    printed = true;
    try {
      w.focus();
      w.print();
    } catch (_) {}
  };

  const waitForAssetsThenPrint = () => {
    const doc = w.document;
    const images = Array.from(doc.images ?? []);
    const pending = images.filter((img) => !img.complete);
    const afterImages = () => {
      const fonts = doc.fonts;
      if (fonts?.ready) {
        fonts.ready.then(attemptPrint, attemptPrint);
      } else {
        attemptPrint();
      }
    };
    if (pending.length === 0) {
      afterImages();
      return;
    }
    let left = pending.length;
    const oneDone = () => {
      left -= 1;
      if (left <= 0) afterImages();
    };
    pending.forEach((img) => {
      img.addEventListener("load", oneDone, { once: true });
      img.addEventListener("error", oneDone, { once: true });
    });
  };

  w.document.open();
  w.document.write(html);
  w.document.close();

  if (w.document.readyState === "complete") {
    waitForAssetsThenPrint();
  } else {
    w.addEventListener("load", waitForAssetsThenPrint, { once: true });
  }
}

// Helper reference for toast inside openPrintWindow (will be injected by caller)
let toast: any = () => {};
export function setPrintToast(t: any) { toast = t; }

/** Detect if current device is mobile */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Open LINE share sheet with prefilled text (URL scheme). */
export function openLineShareText(text: string): Window | null {
  const url = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  return window.open(url, "_blank", "noopener,noreferrer");
}
