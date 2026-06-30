import { Router, type IRouter } from "express";
import { eq, and, desc, SQL } from "drizzle-orm";
import { db, wholesaleReceivablesTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const ROLES = ["super_admin", "owner", "admin", "sales", "accountant"] as const;
const WRITE_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;

const UpdateInput = z.object({
  receivedAmount: z.number().min(0).optional(),
  dueDate: z.string().optional().nullable(),
  paidDate: z.string().optional().nullable(),
  paymentStatus: z.string().optional(),
  paymentMethod: z.string().optional().nullable(),
  notes: z.string().optional(),
});

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/wholesale/receivables", requireRole(...ROLES), async (req, res): Promise<void> => {
  const orderId = typeof req.query.orderId === "string" ? parseInt(req.query.orderId, 10) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conditions: SQL[] = [];
  if (orderId && !isNaN(orderId)) conditions.push(eq(wholesaleReceivablesTable.orderId, orderId));
  if (status && status !== "全部") conditions.push(eq(wholesaleReceivablesTable.paymentStatus, status));
  const rows = await db
    .select()
    .from(wholesaleReceivablesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wholesaleReceivablesTable.createdAt));
  res.json(rows);
});

router.patch("/wholesale/receivables/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(wholesaleReceivablesTable).where(eq(wholesaleReceivablesTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到應收款" }); return; }

  const receivedAmt = parsed.data.receivedAmount ?? parseFloat(existing.receivedAmount ?? "0");
  const totalAmt = parseFloat(existing.totalAmount ?? "0");
  let paymentStatus = parsed.data.paymentStatus;
  if (!paymentStatus) {
    if (receivedAmt <= 0) paymentStatus = "未收款";
    else if (receivedAmt >= totalAmt) paymentStatus = "已收款";
    else paymentStatus = "部分收款";
  }

  const updateData: Record<string, unknown> = {
    ...parsed.data,
    paymentStatus,
    updatedAt: new Date(),
  };
  if (parsed.data.receivedAmount !== undefined) {
    updateData.receivedAmount = String(parsed.data.receivedAmount);
  }

  const [updated] = await db.update(wholesaleReceivablesTable).set(updateData).where(eq(wholesaleReceivablesTable.id, id)).returning();
  res.json(updated);
});

export default router;
