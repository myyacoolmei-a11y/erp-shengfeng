// PDF V4 Shared Service
// Off-screen render engine + shared actions (preview / print / download / share to LINE)
// All templates are fixed 1-page; no auto page break needed

export interface PdfBlobResult {
  blob: Blob;
  docNo: string;
  html: string;
}

export type PageFormat = "a4" | "custom-240x140-landscape";

const PAGE_CONFIG: Record<PageFormat, { format: string | number[]; orientation: "portrait" | "landscape"; margin: number[]; scale: number }> = {
  "a4": { format: "a4", orientation: "portrait", margin: [8, 8, 8, 8], scale: 2 },
  "custom-240x140-landscape": { format: [240, 140] as any, orientation: "landscape", margin: [0, 0, 0, 0], scale: 2 },
};

/** Generate PDF blob from HTML string using off-screen iframe render */
export async function generatePdfBlobFromHtml(
  html: string,
  docNo: string,
  pageFormat: PageFormat = "a4",
): Promise<PdfBlobResult> {
  const cfg = PAGE_CONFIG[pageFormat];

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:0;left:-9999px;width:720px;height:1200px;opacity:0;pointer-events:none;z-index:-1;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();

  const body = doc.body;

  await doc.fonts.ready;
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
    document.body.removeChild(iframe);
    console.error("[PDF V4] iframe render failed:", body.offsetWidth, body.offsetHeight);
    throw new Error("PDF \u751f\u6210\u5931\u6557\uff1aDOM \u5c1a\u672a\u5b8c\u6574 render");
  }

  const html2pdf = await import("html2pdf.js").then((m: any) => m.default || m);
  const opt = {
    margin: cfg.margin,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: cfg.scale, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: cfg.format, orientation: cfg.orientation },
  };

  const worker = html2pdf().set(opt).from(body);
  await worker.toPdf();
  const pdf = worker.prop.pdf;
  const blob: Blob = pdf.output("blob");
  document.body.removeChild(iframe);

  if (!blob || blob.size === 0) {
    throw new Error("PDF \u751f\u6210\u5931\u6557\uff1a\u7522\u751f\u7684 PDF \u6a94\u6848\u70ba\u7a7a");
  }
  return { blob, docNo, html };
}

/** Download PDF blob as file */
export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Print PDF blob in a new window */
export function printPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
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
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return { shared: true, via: "navigator.share" };
  }
  const url = URL.createObjectURL(blob);
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
}) {
  const { html, docNo, filename, title, action, setPdfPreview, toast, pageFormat } = options;
  toast({ title: "PDF \u7522\u751f\u4e2d", description: "\u8acb\u7a0d\u5019\u2026" });

  try {
    const { blob } = await generatePdfBlobFromHtml(html, docNo, pageFormat);

    if (action === "download") {
      downloadPdf(blob, filename);
      toast({ title: "\u5df2\u4e0b\u8f09 PDF", description: filename });
      return;
    }
    if (action === "print") {
      printPdf(blob, filename);
      toast({ title: "\u5df2\u958b\u555f\u5217\u5370", description: filename });
      return;
    }
    if (action === "share") {
      try {
        const result = await sharePdf(blob, filename, title, setPdfPreview);
        if (result.shared) {
          toast({ title: "\u5df2\u958b\u555f\u5206\u4eab", description: "\u8acb\u9078\u64c7 LINE \u6216\u5176\u4ed6 App" });
        } else {
          toast({ title: "\u6b64\u88dd\u7f6e\u4e0d\u652f\u63f4\u76f4\u63a5\u5206\u4eab", description: "\u5df2\u958b\u555f PDF \u9810\u89bd\uff0c\u8acb\u624b\u52d5\u5206\u4eab" });
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast({ title: "\u5206\u4eab\u53d6\u6d88", description: "\u4f7f\u7528\u8005\u53d6\u6d88\u4e86\u5206\u4eab" });
        } else {
          toast({ title: "\u5206\u4eab\u5931\u6557", description: String(e), variant: "destructive" });
        }
      }
      return;
    }
    if (action === "preview") {
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, filename });
      toast({ title: "\u5df2\u958b\u555f PDF \u9810\u89bd", description: "\u53ef\u4e0b\u8f09\u3001\u5206\u4eab\u6216\u5217\u5370" });
      return;
    }
  } catch (e: any) {
    toast({ title: "PDF \u7522\u751f\u5931\u6557", description: String(e), variant: "destructive" });
  }
}

/** Open HTML in a new print window and trigger browser print dialog */
export function openPrintWindow(html: string, title: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast({ title: "無法開啟列印視窗", description: "請檢查彈出視窗設定", variant: "destructive" });
    return;
  }
  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>${title}</title></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  // Wait for fonts + images then print
  const attemptPrint = () => {
    try {
      w.print();
    } catch (_) {}
  };
  setTimeout(attemptPrint, 500);
}

// Helper reference for toast inside openPrintWindow (will be injected by caller)
let toast: any = () => {};
export function setPrintToast(t: any) { toast = t; }

/** Detect if current device is mobile */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
