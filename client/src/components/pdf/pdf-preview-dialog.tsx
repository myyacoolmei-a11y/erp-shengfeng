import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Printer, Download, Share2, X } from "lucide-react";

interface PdfPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  pdfUrl: string;
  filename: string;
  onDownload?: () => void;
  onPrint?: () => void;
  onShare?: () => void;
}

export function PdfPreviewDialog({
  open,
  onClose,
  pdfUrl,
  filename,
  onDownload,
  onPrint,
  onShare,
}: PdfPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92dvh] p-0 flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            {filename}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden px-4 py-2 min-h-[300px]">
          <iframe
            src={pdfUrl}
            className="w-full h-full rounded border min-h-[60vh]"
            title={filename}
          />
        </div>
        <DialogFooter className="px-4 py-3 gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            \u95dc\u9589
          </Button>
          {onShare && (
            <Button variant="secondary" size="sm" onClick={onShare}>
              <Share2 className="h-4 w-4 mr-1" />
              \u5206\u4eab
            </Button>
          )}
          {onDownload && (
            <Button variant="secondary" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4 mr-1" />
              \u4e0b\u8f09 PDF
            </Button>
          )}
          {onPrint && (
            <Button size="sm" onClick={onPrint}>
              <Printer className="h-4 w-4 mr-1" />
              \u5217\u5370
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
