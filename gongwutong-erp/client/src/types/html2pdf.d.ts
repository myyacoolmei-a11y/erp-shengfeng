declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: { unit?: string; format?: string | number[]; orientation?: string };
  }

  interface Html2PdfWorker {
    toPdf(): Promise<void>;
    save(filename?: string): Promise<void>;
    output(type: string, options?: unknown): Promise<unknown>;
    prop: {
      pdf: {
        output(type: "blob"): Blob;
        output(type: "datauristring"): string;
        output(type: "arraybuffer"): ArrayBuffer;
      };
    };
  }

  function html2pdf(): {
    set: (opts: Html2PdfOptions) => {
      from: (element: HTMLElement) => Html2PdfWorker;
    };
  };

  export default html2pdf;
}
