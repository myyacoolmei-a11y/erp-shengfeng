import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";
import {
  completeSubsidyWithAcceptance,
  getCaseProgressAndTimeline,
  getOperationCenterCases,
  getOperationCenterOverview,
  updateSubsidyProcessFlags,
} from "../lib/operationCenter/operationCenterService.ts";

const OWNER_ROLES = ["super_admin", "owner"] as const;
const ADMIN_ROLES = ["super_admin", "owner", "admin"] as const;
const requireOwner = requireRole(...OWNER_ROLES);
const requireAdminOps = requireRole(...ADMIN_ROLES);

const router: IRouter = Router();

router.get("/operation-center", requireOwner, async (_req, res): Promise<void> => {
  try {
    res.json(await getOperationCenterOverview());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "載入失敗" });
  }
});

router.get("/operation-center/cases", requireOwner, async (req, res): Promise<void> => {
  const department = String(req.query["department"] ?? "");
  const bucket = String(req.query["bucket"] ?? "");
  if (!["engineering", "admin", "sales"].includes(department) || !bucket) {
    res.status(400).json({ error: "無效的分類" });
    return;
  }
  try {
    res.json(
      await getOperationCenterCases({
        department: department as "engineering" | "admin" | "sales",
        bucket,
      }),
    );
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "載入失敗" });
  }
});

router.get(
  "/operation-center/cases/:workOrderId",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    try {
      res.json(await getCaseProgressAndTimeline(workOrderId));
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : "載入失敗" });
    }
  },
);

/** 行政／老闆：更新 L夾／財政／經濟等流程旗標 */
router.post(
  "/admin-workbench/:workOrderId/subsidy-process-flags",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const schema = z.object({
      lFolderCreated: z.boolean().optional(),
      mofCompleted: z.boolean().optional(),
      moeaRequired: z.boolean().optional(),
      moeaCompleted: z.boolean().optional(),
      adminLineAlbumCreated: z.boolean().optional(),
      mofScreenshotSaved: z.boolean().optional(),
      moeaScreenshotSaved: z.boolean().optional(),
      arAmountConfirmed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "參數錯誤" });
      return;
    }
    try {
      res.json(await updateSubsidyProcessFlags(workOrderId, req.user!, parsed.data));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "更新失敗" });
    }
  },
);

/** 補助完成驗收 */
router.post(
  "/admin-workbench/:workOrderId/subsidy-acceptance",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const schema = z.object({
      note: z.string().optional(),
      checklist: z.object({
        mofCompleted: z.boolean(),
        moeaCompleted: z.boolean(),
        lFolderCreated: z.boolean(),
        adminLineAlbumCreated: z.boolean(),
        mofScreenshotSaved: z.boolean(),
        moeaScreenshotSaved: z.boolean(),
        arAmountConfirmed: z.boolean(),
      }),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "請勾選完整的驗收清單" });
      return;
    }
    try {
      res.json(
        await completeSubsidyWithAcceptance(
          workOrderId,
          req.user!,
          parsed.data.checklist,
          parsed.data.note,
        ),
      );
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "確認失敗" });
    }
  },
);

export default router;
