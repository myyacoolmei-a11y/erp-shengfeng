import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, SQL } from "drizzle-orm";
import { db, wholesaleReceivablesTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireFeature } from "../lib/auth";
import { normalizeWholesalePaymentStatus } from "../../shared/wholesalePaymentMath.ts";

const router: IRouter = Router();
router.use("/wholesale/receivables", requireFeature("wholesale"));


const UpdateInput = z.object({
  dueDate: z.string().optional().nullable(),
  paidDate: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  notes: z.string().optional(),
});

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/wholesale/receivables", async (req, res): Promise<void> => {
  const orderId = typeof req.query.orderId === "string" ? parseInt(req.query.orderId, 10) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conditions: SQL[] = [];
  if (orderId && !isNaN(orderId)) conditions.push(eq(wholesaleReceivablesTable.orderId, orderId));
  if (status && status !== "全部") {
    if (status === "已收清" || status === "已收款") {
      conditions.push(inArray(wholesaleReceivablesTable.paymentStatus, ["已收清", "已收款"]));
    } else {
      conditions.push(eq(wholesaleReceivablesTable.paymentStatus, status));
    }
  }
  const rows = await db
    .select()
    .from(wholesaleReceivablesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wholesaleReceivablesTable.createdAt));
  res.json(rows.map((row) => ({
    ...row,
    paymentStatus: normalizeWholesalePaymentStatus(row.paymentStatus),
  })));
});

router.patch("/wholesale/receivables/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(wholesaleReceivablesTable).where(eq(wholesaleReceivablesTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到應收款" }); return; }

  const updateData: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  const [updated] = await db.update(wholesaleReceivablesTable).set(updateData).where(eq(wholesaleReceivablesTable.id, id)).returning();
  res.json(updated);
});

export default router;
