import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ImageOff, Loader2, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  downloadSubsidyCaseZip,
  fetchSubsidyCaseFiles,
  type SubsidyCaseFile,
} from "@/lib/subsidyFilesApi";

function dateText(v: string | null) {
  return v ? new Date(v).toLocaleString("zh-TW") : "—";
}

/** 縮圖載入失敗時改顯示替代圖示，不留破圖。 */
function FileThumb({ file, onOpen }: { file: SubsidyCaseFile; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);

  if (file.isImage && !broken) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="h-20 w-20 shrink-0 overflow-hidden rounded border bg-muted"
        title="點擊放大"
      >
        <img
          src={file.viewUrl}
          alt={file.docTypeLabel}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded border bg-muted text-muted-foreground"
      title={file.isPdf ? "開啟 PDF" : "開啟檔案"}
    >
      {file.isPdf ? <FileText className="h-6 w-6" /> : <ImageOff className="h-6 w-6" />}
      <span className="text-[10px]">{file.isPdf ? "PDF" : "無法預覽"}</span>
    </button>
  );
}

export function SubsidyFilesDialog({
  workOrderId,
  open,
  onOpenChange,
}: {
  workOrderId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [zipping, setZipping] = useState(false);
  const [preview, setPreview] = useState<SubsidyCaseFile | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["subsidy-case-files", workOrderId],
    queryFn: () => fetchSubsidyCaseFiles(workOrderId),
    enabled: open && !!workOrderId,
  });

  const info = data?.case;
  const phone = [info?.mobilePhone, info?.telephone].filter(Boolean).join(" / ");
  const hasFiles = (data?.totalFiles ?? 0) > 0;

  async function downloadZip() {
    if (!data) return;
    setZipping(true);
    try {
      await downloadSubsidyCaseZip(workOrderId, data.zipFileName);
      toast({ title: "已開始下載", description: data.zipFileName });
    } catch (err) {
      toast({
        title: "ZIP 下載失敗",
        description: err instanceof Error ? err.message : "請稍後再試",
        variant: "destructive",
      });
    } finally {
      setZipping(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>客戶補助資料</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {isLoading && (
              <p className="text-sm text-muted-foreground">載入中…</p>
            )}
            {isError && (
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "載入失敗"}
              </p>
            )}

            {data && (
              <>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border bg-muted/20 p-3 text-xs sm:grid-cols-2">
                  <p><span className="text-muted-foreground">客戶姓名：</span>{info?.customerName || "—"}</p>
                  <p><span className="text-muted-foreground">案件編號：</span>{info?.workOrderNumber || "—"}</p>
                  <p><span className="text-muted-foreground">電話：</span>{phone || "—"}</p>
                  <p>
                    <span className="text-muted-foreground">補助類型：</span>
                    {info?.subsidyTypeLabel || "—"}
                    {info?.invoiceKindLabel ? `（${info.invoiceKindLabel}）` : ""}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-muted-foreground">地址：</span>{info?.installAddress || "—"}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-muted-foreground">最後上傳時間：</span>
                    {dateText(info?.lastUploadAt ?? null)}
                  </p>
                </div>

                <div className="space-y-3">
                  {data.categories.map(category => (
                    <div key={category.docType} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{category.label}</p>
                        {category.files.length > 0 ? (
                          <span className="text-xs text-green-700">
                            {category.files.length} 份
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">尚未上傳</span>
                        )}
                        {!category.collected && category.files.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            （目前系統未向客戶收集此項）
                          </span>
                        )}
                      </div>

                      {category.files.length > 0 && (
                        <ul className="mt-2 space-y-2">
                          {category.files.map(file => (
                            <li key={file.id} className="flex items-start gap-3">
                              <FileThumb
                                file={file}
                                onOpen={() =>
                                  file.isImage
                                    ? setPreview(file)
                                    : window.open(file.viewUrl, "_blank", "noreferrer")
                                }
                              />
                              <div className="min-w-0 flex-1 space-y-1 text-xs">
                                <p className="truncate">{file.fileName || file.docTypeLabel}</p>
                                <p className="text-muted-foreground">
                                  上傳時間：{dateText(file.uploadedAt)}
                                </p>
                                <p className="text-muted-foreground">{file.sizeLabel}</p>
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    className="text-primary underline"
                                    onClick={() =>
                                      file.isImage
                                        ? setPreview(file)
                                        : window.open(file.viewUrl, "_blank", "noreferrer")
                                    }
                                  >
                                    查看
                                  </button>
                                  <a
                                    href={file.downloadUrl}
                                    download={file.fileName || undefined}
                                    className="inline-flex items-center gap-1 text-primary underline"
                                  >
                                    <Download className="h-3 w-3" />
                                    下載
                                  </a>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                {!hasFiles && (
                  <p className="text-sm text-muted-foreground">尚無補助資料</p>
                )}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              關閉
            </Button>
            <Button
              onClick={() => void downloadZip()}
              disabled={!hasFiles || zipping}
              className="bg-blue-700 hover:bg-blue-800"
            >
              {zipping ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ZIP整理中...
                </>
              ) : (
                <>
                  <Package className="mr-1 h-4 w-4" />
                  ZIP下載全部
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {preview?.docTypeLabel}
              {preview?.fileName ? ` · ${preview.fileName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="flex items-center justify-center">
            {preview && (
              <img
                src={preview.viewUrl}
                alt={preview.docTypeLabel}
                className="max-h-[70dvh] w-auto rounded border object-contain"
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              關閉
            </Button>
            {preview && (
              <a
                href={preview.downloadUrl}
                download={preview.fileName || undefined}
                className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <Download className="h-4 w-4" />
                下載
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SubsidyFilesDialog;
