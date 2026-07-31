import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";
import {
  completeArchive,
  confirmAdminCompletion,
  getAdminWorkbench,
  markBilled,
  markFullyPaid,
  toggleSubsidy,
  updateBillingDraft,
  workbenchRecordPayment,
} from "../lib/workOrders/adminWorkbenchService.ts";
import { ARCHIVE_CHECKLIST_KEYS } from "../../shared/adminWorkflowConstants.ts";

const router: IRouter = Router();

const ADMIN_ROLES = ["super_admin", "owner", "admin"] as const;
const FINANCE_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;

const requireAdminOps = requireRole(...ADMIN_ROLES);
const requireFinanceView = requireRole(...FINANCE_ROLES);

router.get("/admin-workbench", requireFinanceView, async (_req, res): Promise<void> => {
  try {
    const data = await getAdminWorkbench();
    res.json(data);
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
        res.status(400).json({ error: "資料不足，無法確認完工", missing: result.missing });
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
      const result = await markBilled(workOrderId, req.user!, toBilling(parsed.data));
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

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
      await toggleSubsidy(workOrderId, req.user!, applied, note);
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
    const roles = req.user?.roles?.length ? req.user.roles : [req.user?.role ?? ""];
    const canPay = roles.some((r) => (FINANCE_ROLES as readonly string[]).includes(r));
    if (!canPay) {
      res.status(403).json({ error: "您沒有此功能權限" });
      return;
    }
    const parsed = PaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const result = await workbenchRecordPayment(workOrderId, req.user!, parsed.data);
      res.json(result);
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

const ArchiveBody = z.object({
  checklist: z.record(z.string(), z.boolean()),
  note: z.string().optional(),
});

router.post(
  "/admin-workbench/:workOrderId/complete-archive",
  requireAdminOps,
  async (req, res): Promise<void> => {
    const workOrderId = Number(req.params.workOrderId);
    if (!Number.isFinite(workOrderId)) {
      res.status(400).json({ error: "無效的派工單 ID" });
      return;
    }
    const parsed = ArchiveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const checklist = Object.fromEntries(
      ARCHIVE_CHECKLIST_KEYS.map((k) => [k, !!parsed.data.checklist[k]]),
    ) as Record<(typeof ARCHIVE_CHECKLIST_KEYS)[number], boolean>;
    try {
      const result = await completeArchive(workOrderId, req.user!, checklist, parsed.data.note);
      if (!result.ok) {
        res.status(400).json({ error: "歸檔檢查未完成", missing: result.missing });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "操作失敗" });
    }
  },
);

export default router;
