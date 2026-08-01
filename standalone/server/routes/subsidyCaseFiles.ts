import { Router, type IRouter, type Request, type Response } from "express";
import { requireRole } from "../lib/auth";
import { logger } from "../lib/logger";
import {
  buildSubsidyCaseZip,
  getSubsidyCaseFile,
  getSubsidyCaseFiles,
} from "../lib/subsidy/subsidyCaseFilesService.ts";
import {
  signSubsidyFileToken,
  verifySubsidyFileToken,
} from "../lib/subsidy/subsidyFileToken.ts";

const FINANCE_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;
const requireFinanceView = requireRole(...FINANCE_ROLES);

function parseId(value: unknown): number | null {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** RFC 5987：中文檔名要同時給 ASCII fallback 與 UTF-8 版本 */
function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function sendFile(
  res: Response,
  workOrderId: number,
  docId: number,
  asDownload: boolean,
): Promise<void> {
  const file = await getSubsidyCaseFile(workOrderId, docId);
  if (!file) {
    res.status(404).json({ error: "找不到附件" });
    return;
  }
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Length", String(file.buffer.length));
  res.setHeader("Cache-Control", "private, max-age=300");
  if (asDownload) {
    res.setHeader("Content-Disposition", contentDisposition(file.downloadName));
  } else {
    res.setHeader("Content-Disposition", `inline; filename="file-${docId}"`);
  }
  res.end(file.buffer);
}

async function sendZip(res: Response, workOrderId: number): Promise<void> {
  const zip = await buildSubsidyCaseZip(workOrderId);
  if (!zip) {
    res.status(404).json({ error: "此案件尚無補助附件可下載" });
    return;
  }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(zip.buffer.length));
  res.setHeader("Content-Disposition", contentDisposition(zip.fileName));
  res.setHeader("Cache-Control", "no-store");
  res.end(zip.buffer);
}

/**
 * 短效簽章路由：<img src> 與 <a download> 無法帶 Authorization header，
 * 因此接受由 /files 發出的短效 token（30 分鐘、綁定案件與使用者）。
 * 沒帶 token 時交給後面的登入驗證流程處理。
 */
export const subsidyCaseFilesTokenRouter: IRouter = Router();

function tokenGuard(req: Request, res: Response): number | null | undefined {
  const raw = req.query["t"];
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? String(raw[0]) : "";
  if (!token) return undefined;
  const workOrderId = parseId(req.params["id"]);
  const payload = verifySubsidyFileToken(token);
  if (!payload || workOrderId == null || payload.workOrderId !== workOrderId) {
    res.status(403).json({ error: "連結無效或已過期，請重新開啟補助資料" });
    return null;
  }
  return workOrderId;
}

subsidyCaseFilesTokenRouter.get(
  "/subsidy-cases/:id/files/:docId",
  async (req, res, next): Promise<void> => {
    const workOrderId = tokenGuard(req, res);
    if (workOrderId === undefined) {
      next();
      return;
    }
    if (workOrderId === null) return;
    const docId = parseId(req.params["docId"]);
    if (docId == null) {
      res.status(400).json({ error: "無效的附件 ID" });
      return;
    }
    try {
      await sendFile(res, workOrderId, docId, req.query["download"] === "1");
    } catch (err) {
      logger.error({ err, workOrderId, docId }, "subsidy file stream failed");
      res.status(500).json({ error: "附件讀取失敗" });
    }
  },
);

subsidyCaseFilesTokenRouter.get(
  "/subsidy-cases/:id/download-zip",
  async (req, res, next): Promise<void> => {
    const workOrderId = tokenGuard(req, res);
    if (workOrderId === undefined) {
      next();
      return;
    }
    if (workOrderId === null) return;
    try {
      await sendZip(res, workOrderId);
    } catch (err) {
      logger.error({ err, workOrderId }, "subsidy zip build failed");
      res.status(500).json({ error: "ZIP 建立失敗" });
    }
  },
);

/** 登入後（行政／會計）使用的路由。 */
const router: IRouter = Router();

router.get("/subsidy-cases/:id/files", requireFinanceView, async (req, res): Promise<void> => {
  const workOrderId = parseId(req.params["id"]);
  if (workOrderId == null) {
    res.status(400).json({ error: "無效的案件 ID" });
    return;
  }
  try {
    const token = signSubsidyFileToken(workOrderId, req.user!.id);
    const base = `/api/subsidy-cases/${workOrderId}`;
    const data = await getSubsidyCaseFiles(
      workOrderId,
      (docId, download) =>
        `${base}/files/${docId}?t=${encodeURIComponent(token)}${download ? "&download=1" : ""}`,
      `${base}/download-zip?t=${encodeURIComponent(token)}`,
    );
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "載入失敗" });
  }
});

router.get(
  "/subsidy-cases/:id/files/:docId",
  requireFinanceView,
  async (req, res): Promise<void> => {
    const workOrderId = parseId(req.params["id"]);
    const docId = parseId(req.params["docId"]);
    if (workOrderId == null || docId == null) {
      res.status(400).json({ error: "無效的 ID" });
      return;
    }
    try {
      await sendFile(res, workOrderId, docId, req.query["download"] === "1");
    } catch (err) {
      logger.error({ err, workOrderId, docId }, "subsidy file stream failed");
      res.status(500).json({ error: "附件讀取失敗" });
    }
  },
);

router.get(
  "/subsidy-cases/:id/download-zip",
  requireFinanceView,
  async (req, res): Promise<void> => {
    const workOrderId = parseId(req.params["id"]);
    if (workOrderId == null) {
      res.status(400).json({ error: "無效的案件 ID" });
      return;
    }
    try {
      await sendZip(res, workOrderId);
    } catch (err) {
      logger.error({ err, workOrderId }, "subsidy zip build failed");
      res.status(500).json({ error: "ZIP 建立失敗" });
    }
  },
);

export default router;
