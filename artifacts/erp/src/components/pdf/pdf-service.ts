// PDF V2 Shared Service
// Off-screen render engine + shared actions (preview / print / download / share to LINE)

export interface PdfBlobResult {
  blob: Blob;
  docNo: string;
  html: string;
}

/** Generate PDF blob from HTML string using off-screen iframe render */
export async function generatePdfBlobFromHtml(
  html: string,
  docNo: string,
  jsPdfFormat: string = "a4",
): Promise<PdfBlobResult> {
  // Use a hidden iframe — html2canvas correctly measures iframe body content,
  // whereas hidden divs collapse to 0 height in html2canvas's computed rendering.
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:0;left:0;width:720px;height:1200px;visibility:hidden;z-index:-1;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();

  const body = doc.body;

  // Wait for fonts and layout in the iframe, plus any async stylesheet loading
  await doc.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // Wait for images to load inside iframe
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
    console.error("[PDF V2] iframe body render failed: offsetWidth=", body.offsetWidth, "offsetHeight=", body.offsetHeight);
    throw new Error("PDF \u751f\u6210\u5931\u6557\uff1aDOM \u5c1a\u672a\u5b8c\u6574 render\uff0c\u5143\u7d20\u5c3a\u5bf8\u70ba 0");
  }

  const html2pdf = await import("html2pdf.js").then((m: any) => m.default || m);
  const opt = {
    margin: [10, 10, 10, 10],
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: jsPdfFormat, orientation: "portrait" },
  };

  const worker = html2pdf().set(opt).from(body);
  await worker.toPdf();
  const pdf = worker.prop.pdf;
  const blob: Blob = pdf.output("blob");
  document.body.removeChild(iframe);

  if (!blob || blob.size === 0) {
    console.error("[PDF V2] Blob empty: size=", blob?.size);
    throw new Error("PDF \u751f\u6210\u5931\u6557\uff1a\u7522\u751f\u7684 PDF \u6a94\u6848\u70ba\u7a7a");
  }
  if (blob.size < 1024) {
    console.warn("[PDF V2] Blob suspiciously small: size=", blob.size, "bytes");
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
      try {
        win.print();
      } catch (_) {}
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

/** Open LINE with text message (always works) */
export function shareTextToLine(text: string) {
  window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, "_blank");
}

/** Combined: generate + handle mobile/desktop flow */
export async function handlePdfAction(options: {
  html: string;
  docNo: string;
  filename: string;
  title: string;
  lineText: string;
  action: "download" | "print" | "share" | "preview";
  setPdfPreview: (v: { url: string; filename: string } | null) => void;
  toast: (opts: { title: string; description?: string; variant?: string }) => void;
  jsPdfFormat?: string;
}) {
  const { html, docNo, filename, title, lineText, action, setPdfPreview, toast, jsPdfFormat } = options;
  toast({ title: "PDF \u7522\u751f\u4e2d", description: "\u8acb\u7a0d\u5019\u2026" });

  try {
    const { blob } = await generatePdfBlobFromHtml(html, docNo, jsPdfFormat);

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
        // Always open LINE text share as secondary action
        shareTextToLine(lineText);
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

/** Detect if current device is mobile */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
