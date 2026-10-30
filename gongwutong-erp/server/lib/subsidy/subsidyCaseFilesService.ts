/**
 * 行政檢視／打包客戶補助附件。
 *
 * 附件目前沒有物件儲存，客戶上傳後是以 base64 data URL 存在
 * customer_documents.file_url，因此這裡直接由 DB 解碼後串流／打包，
 * 不會產生任何公開網址。
 */
import JSZip from "jszip";
import { desc, eq } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  receivablesTable,
  subsidyApplicationsTable,
  customerDocumentsTable,
} from "@workspace/db";
import {
  SUBSIDY_DOC_TYPE_LABELS,
  SUBSIDY_FILE_CATEGORIES,
  SUBSIDY_OTHER_FILE_CATEGORY,
  type SubsidyDocType,
} from "../../../shared/subsidyDocs.ts";
import {
  SUBSIDY_INVOICE_KIND_LABELS,
  SUBSIDY_TYPE_LABELS,
  normalizeSubsidyInvoiceKind,
  normalizeSubsidyType,
} from "../../../shared/adminWorkflowConstants.ts";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

type StoredFile = {
  id: number;
  docType: string;
  fileName: string | null;
  mimeType: string;
  byteLength: number;
  uploadedAt: Date | null;
  status: string;
};

/** data URL 前置解析，不解碼內容（列表用）。 */
function parseDataUrlMeta(fileUrl: string): { mimeType: string; byteLength: number } | null {
  if (!fileUrl.startsWith("data:")) return null;
  const commaIdx = fileUrl.indexOf(",");
  if (commaIdx < 0) return null;
  const header = fileUrl.slice(5, commaIdx);
  const mimeType = header.split(";")[0] || "application/octet-stream";
  const base64Len = fileUrl.length - commaIdx - 1;
  return { mimeType, byteLength: Math.floor((base64Len * 3) / 4) };
}

export function decodeStoredFile(
  fileUrl: string,
): { buffer: Buffer; mimeType: string } | null {
  if (!fileUrl.startsWith("data:")) return null;
  const commaIdx = fileUrl.indexOf(",");
  if (commaIdx < 0) return null;
  const header = fileUrl.slice(5, commaIdx);
  const mimeType = header.split(";")[0] || "application/octet-stream";
  const isBase64 = header.includes(";base64");
  const payload = fileUrl.slice(commaIdx + 1);
  try {
    const buffer = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

function extForFile(mimeType: string, fileName: string | null): string {
  const fromName = fileName?.includes(".") ? fileName.split(".").pop()! : "";
  if (fromName && fromName.length <= 5 && /^[A-Za-z0-9]+$/.test(fromName)) {
    return fromName.toLowerCase();
  }
  return EXT_BY_MIME[mimeType] ?? "bin";
}

/** 去掉檔名不允許的字元，避免壓縮檔或下載標頭出問題。 */
function safeName(v: string): string {
  return v.replace(/[\\/:*?"<>|\r\n\t]/g, "_").trim() || "未命名";
}

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function loadCase(workOrderId: number) {
  const [wo] = await db
    .select()
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, workOrderId))
    .limit(1);
  if (!wo) throw new Error("找不到派工單");

  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.workOrderId, workOrderId))
    .limit(1);
  const [recv] = await db
    .select()
    .from(receivablesTable)
    .where(eq(receivablesTable.workOrderId, workOrderId))
    .limit(1);

  const rows = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.workOrderId, workOrderId))
    .orderBy(desc(customerDocumentsTable.createdAt));

  const usable = rows
    .filter(
      (d) =>
        d.status !== "rejected" &&
        !!d.fileUrl &&
        (d.subsidyApplicationId == null || d.subsidyApplicationId === sub?.id),
    )
    .sort((a, b) => {
      const at = (a.uploadedAt ?? a.createdAt)?.getTime() ?? 0;
      const bt = (b.uploadedAt ?? b.createdAt)?.getTime() ?? 0;
      return at - bt;
    });

  return { wo, sub, recv, rows: usable };
}

/** 依分類排序後的附件（同分類多張時保留全部，不覆蓋）。 */
function groupByCategory(rows: Awaited<ReturnType<typeof loadCase>>["rows"]) {
  const knownTypes = new Set<string>(SUBSIDY_FILE_CATEGORIES.map((c) => c.docType));
  const byType = new Map<string, StoredFile[]>();

  for (const row of rows) {
    const meta = parseDataUrlMeta(row.fileUrl!);
    const docType = knownTypes.has(row.docType)
      ? row.docType
      : SUBSIDY_OTHER_FILE_CATEGORY.docType;
    const list = byType.get(docType) ?? [];
    list.push({
      id: row.id,
      docType: row.docType,
      fileName: row.fileName,
      mimeType: meta?.mimeType ?? "application/octet-stream",
      byteLength: meta?.byteLength ?? 0,
      uploadedAt: row.uploadedAt ?? row.createdAt,
      status: row.status,
    });
    byType.set(docType, list);
  }

  const categories = [...SUBSIDY_FILE_CATEGORIES, SUBSIDY_OTHER_FILE_CATEGORY].map(
    (c, idx) => ({
      docType: c.docType,
      label: c.label,
      collected: c.collected,
      order: idx + 1,
      files: byType.get(c.docType) ?? [],
    }),
  );

  return categories;
}

export function subsidyZipFileName(customerName: string | null, workOrderNumber: string | null) {
  return `${safeName(customerName || "客戶")}_${safeName(workOrderNumber || "案件")}_補助資料.zip`;
}

/** 列表：附件分類、每份檔案的中繼資料，以及可直接使用的短效連結。 */
export async function getSubsidyCaseFiles(
  workOrderId: number,
  buildFileUrl: (docId: number, download: boolean) => string,
  zipUrl: string,
) {
  const { wo, sub, recv, rows } = await loadCase(workOrderId);
  const categories = groupByCategory(rows);
  const invoiceKind = normalizeSubsidyInvoiceKind(sub?.invoiceKind ?? null);
  const subsidyType = normalizeSubsidyType(sub?.subsidyType ?? null);

  const lastUploadAt = rows
    .map((d) => d.uploadedAt ?? d.createdAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    case: {
      workOrderId: wo.id,
      workOrderNumber: wo.workOrderNumber,
      customerName: wo.customerName,
      mobilePhone: wo.mobilePhone,
      telephone: wo.telephone,
      installAddress: wo.installAddress,
      invoiceKind,
      invoiceKindLabel: invoiceKind ? SUBSIDY_INVOICE_KIND_LABELS[invoiceKind] : null,
      subsidyTypeLabel: subsidyType ? SUBSIDY_TYPE_LABELS[subsidyType] : null,
      invoiceTitle: recv?.invoiceTitle ?? null,
      taxId: recv?.taxId ?? null,
      lastUploadAt: lastUploadAt?.toISOString() ?? null,
      appliedAt: sub?.appliedAt?.toISOString() ?? null,
    },
    categories: categories.map((c) => ({
      docType: c.docType,
      label: c.label,
      collected: c.collected,
      files: c.files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        docTypeLabel:
          f.docType in SUBSIDY_DOC_TYPE_LABELS
            ? SUBSIDY_DOC_TYPE_LABELS[f.docType as SubsidyDocType]
            : f.docType,
        mimeType: f.mimeType,
        isImage: f.mimeType.startsWith("image/"),
        isPdf: f.mimeType === "application/pdf",
        sizeLabel: sizeLabel(f.byteLength),
        uploadedAt: f.uploadedAt?.toISOString() ?? null,
        viewUrl: buildFileUrl(f.id, false),
        downloadUrl: buildFileUrl(f.id, true),
      })),
    })),
    totalFiles: rows.length,
    zipUrl,
    zipFileName: subsidyZipFileName(wo.customerName, wo.workOrderNumber),
  };
}

/** 單一附件：解碼後回傳原始位元組（供串流下載／預覽）。 */
export async function getSubsidyCaseFile(workOrderId: number, docId: number) {
  const [row] = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.id, docId))
    .limit(1);
  if (!row || row.workOrderId !== workOrderId) return null;
  if (!row.fileUrl) return null;

  const decoded = decodeStoredFile(row.fileUrl);
  if (!decoded) return null;

  const label =
    row.docType in SUBSIDY_DOC_TYPE_LABELS
      ? SUBSIDY_DOC_TYPE_LABELS[row.docType as SubsidyDocType]
      : row.docType || "附件";
  const ext = extForFile(decoded.mimeType, row.fileName);

  return {
    buffer: decoded.buffer,
    mimeType: decoded.mimeType,
    downloadName: `${safeName(label)}.${ext}`,
  };
}

/**
 * ZIP 內檔名：分類順序當前綴，同分類多張加 _1 _2 避免覆蓋。
 * 例：01_身分證正面.jpg、08_施工照片_1.jpg
 */
export function zipEntryName(
  order: number,
  label: string,
  ext: string,
  index: number,
  total: number,
): string {
  const prefix = String(order).padStart(2, "0");
  const suffix = total > 1 ? `_${index + 1}` : "";
  return `${prefix}_${safeName(label)}${suffix}.${ext}`;
}

export async function buildSubsidyCaseZip(workOrderId: number) {
  const { wo, rows } = await loadCase(workOrderId);
  if (rows.length === 0) return null;

  const categories = groupByCategory(rows);
  const docsById = new Map(rows.map((r) => [r.id, r]));
  const zip = new JSZip();
  let added = 0;

  for (const category of categories) {
    if (category.files.length === 0) continue;

    category.files.forEach((file, idx) => {
      const row = docsById.get(file.id);
      if (!row?.fileUrl) return;
      const decoded = decodeStoredFile(row.fileUrl);
      if (!decoded) return;
      const ext = extForFile(decoded.mimeType, file.fileName);
      zip.file(
        zipEntryName(category.order, category.label, ext, idx, category.files.length),
        decoded.buffer,
      );
      added += 1;
    });
  }

  if (added === 0) return null;

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    buffer,
    fileName: subsidyZipFileName(wo.customerName, wo.workOrderNumber),
    fileCount: added,
  };
}
