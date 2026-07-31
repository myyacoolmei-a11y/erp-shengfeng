import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";
import {
  advanceSubsidyPipeline,
  approveCloseOverride,
  cancelFullyPaid,
  completeClose,
  confirmAdminCompletion,
  getAdminWorkbench,
  markBilled,
  markFullyPaid,
  reopenClosedCase,
  setReceivableExpectedPaymentDate,
  setSubsidyType,
  updateBillingDraft,
  workbenchRecordPayment,
} from "../lib/workOrders/adminWorkbenchService.ts";
import { SUBSIDY_PIPELINE_STATUSES, SUBSIDY_TYPES } from "../../shared/adminWorkflowConstants.ts";

const router: IRouter = Router();

const ADMIN_ROLES = ["super_admin", "owner", "admin"] as const;
const FINANCE_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;
const OWNER_ROLES = ["super_admin", "owner"] as const;

const requireAdminOps = requireRole(...ADMIN_ROLES);
const requireFinanceView = requireRole(...FINANCE_ROLES);
const requireOwnerOps = requireRole(...OWNER_ROLES);

router.get("/admin-workbench", requireFinanceView, async (_req, res): Promise<void> => {
  try {
    res.json(await getAdminWorkbench());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "載入失敗" });
  }
});

router.post(
  "/admin-workbench/:workOrderId/confirm-completion",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    try {
      const result = await confirmAdminCompletion(workOrderId, req.user!, note);
      if (!result.ok) {
        res.status(400).json({ error: "資料不足，無法確認施工資料", missing: result.missing });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

const BillingBody = z.object({
  extraAmount: z.union([z.string(), z.number()]).optional().nullable(),
  discountAmount: z.union([z.string(), z.number()]).optional().nullable(),
  finalAmount: z.union([z.string(), z.number()]).optional().nullable(),
  invoiceNeeded: z.boolean().optional().nullable(),
  billTo: z.string().optional().nullable(),
  expectedPaymentDate: z.string().optional().nullable(),
  needsSubsidy: z.boolean().optional(),
  subsidyType: z.enum(SUBSIDY_TYPES).optional(),
  note: z.string().optional(),
});

function toBilling(body: z.infer<typeof BillingBody>) {
  const str = (v: string | number | null | undefined) =>
    v == null || v === "" ? null : String(v);
  return {
    extraAmount: str(body.extraAmount),
    discountAmount: str(body.discountAmount),
    finalAmount: str(body.finalAmount),
    invoiceNeeded: body.invoiceNeeded ?? null,
    billTo: body.billTo ?? null,
    expectedPaymentDate: body.expectedPaymentDate ?? null,
    needsSubsidy: body.needsSubsidy,
    subsidyType: body.subsidyType,
    note: body.note,
  };
}

router.patch(
  "/admin-workbench/:workOrderId/billing",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const parsed = BillingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      await updateBillingDraft(workOrderId, req.user!, toBilling(parsed.data));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/mark-billed",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const parsed = BillingBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      res.json(await markBilled(workOrderId, req.user!, toBilling(parsed.data)));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/expected-payment-date",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const date = typeof req.body?.expectedPaymentDate === "string" ? req.body.expectedPaymentDate : "";
    try {
      await setReceivableExpectedPaymentDate(workOrderId, req.user!, date);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/subsidy-type",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const parsed = z
      .object({
        subsidyType: z.enum(SUBSIDY_TYPES),
        note: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      await setSubsidyType(workOrderId, req.user!, parsed.data.subsidyType, parsed.data.note);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/subsidy-pipeline",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const parsed = z
      .object({
        status: z.enum(SUBSIDY_PIPELINE_STATUSES),
        note: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      res.json(
        await advanceSubsidyPipeline(
          workOrderId,
          req.user!,
          parsed.data.status,
          parsed.data.note,
        ),
      );
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

/** Legacy toggle endpoint */
router.post(
  "/admin-workbench/:workOrderId/subsidy",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const applied = !!req.body?.applied;
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    try {
      await advanceSubsidyPipeline(
        workOrderId,
        req.user!,
        applied ? "applied" : "link_not_sent",
        note,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

const PaymentBody = z.object({
  amount: z.number().positive(),
  paymentDate: z.string().min(1),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

router.post(
  "/admin-workbench/:workOrderId/payment",
  requireFinanceView,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const parsed = PaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      res.json(await workbenchRecordPayment(workOrderId, req.user!, parsed.data));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/mark-paid",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    try {
      await markFullyPaid(workOrderId, req.user!, note);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/cancel-paid",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    try {
      res.json(await cancelFullyPaid(workOrderId, req.user!, reason));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/reopen",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    try {
      res.json(await reopenClosedCase(workOrderId, req.user!, note));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/close-override",
  requireOwnerOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    try {
      await approveCloseOverride(workOrderId, req.user!, note);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

router.post(
  "/admin-workbench/:workOrderId/complete-close",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    try {
      const result = await completeClose(workOrderId, req.user!, note);
      if (!result.ok) {
        res.status(400).json({ error: "尚未符合結案條件", missing: result.missing });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

/** Legacy archive endpoint → close (no warranty checklist). */
router.post(
  "/admin-workbench/:workOrderId/complete-archive",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    try {
      const result = await completeClose(workOrderId, req.user!, note);
      if (!result.ok) {
        res.status(400).json({ error: "尚未符合結案條件", missing: result.missing });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

export default router;
