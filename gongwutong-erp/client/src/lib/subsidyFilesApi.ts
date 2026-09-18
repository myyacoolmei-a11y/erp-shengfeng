import { customFetch } from "../../../shared/api-client/custom-fetch.ts";

export type SubsidyCaseFile = {
  id: number;
  fileName: string | null;
  docTypeLabel: string;
  mimeType: string;
  isImage: boolean;
  isPdf: boolean;
  sizeLabel: string;
  uploadedAt: string | null;
  viewUrl: string;
  downloadUrl: string;
};

export type SubsidyCaseFileCategory = {
  docType: string;
  label: string;
  /** 目前系統是否會收集此類附件（施工照片、冷氣銘牌尚未收集） */
  collected: boolean;
  files: SubsidyCaseFile[];
};

export type SubsidyCaseFiles = {
  case: {
    workOrderId: number;
    workOrderNumber: string | null;
    customerName: string | null;
    mobilePhone: string | null;
    telephone: string | null;
    installAddress: string | null;
    invoiceKind: "dual" | "triple" | null;
    invoiceKindLabel: string | null;
    subsidyTypeLabel: string | null;
    invoiceTitle: string | null;
    taxId: string | null;
    lastUploadAt: string | null;
    appliedAt: string | null;
  };
  categories: SubsidyCaseFileCategory[];
  totalFiles: number;
  zipUrl: string;
  zipFileName: string;
};

export function fetchSubsidyCaseFiles(workOrderId: number) {
  return customFetch<SubsidyCaseFiles>(`/api/subsidy-cases/${workOrderId}/files`);
}

/** 以登入身分取回 ZIP，再由瀏覽器存檔（不經過任何公開網址）。 */
export async function downloadSubsidyCaseZip(workOrderId: number, fileName: string) {
  const blob = await customFetch<Blob>(`/api/subsidy-cases/${workOrderId}/download-zip`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
