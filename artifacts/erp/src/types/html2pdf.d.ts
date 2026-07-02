declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: { unit?: string; format?: string; orientation?: string };
  }

  function html2pdf(): {
    set: (opts: Html2PdfOptions) => {
      from: (element: HTMLElement) => {
        save: () => Promise<void>;
      };
    };
  };

  export default html2pdf;
}
