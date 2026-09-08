import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, wholesaleOrdersTable, wholesalePaymentsTable, wholesalePaymentAllocationsTable, wholesalePaymentRecordsTable } from "@workspace/db";
import { requireFeature } from "../lib/auth";
import { round2 } from "../../shared/wholesaleAccount.ts";
import { pool } from "@workspace/db";
import { syncReceivableForOrder } from "../lib/wholesale/accountService";

const router: IRouter = Router();
router.use("/wholesale/payments", requireFeature("wholesale"));

const AllocationInput = z.object({
  orderId: z.number().int(),
  allocatedAmount: z.number().positive(),
});

const PaymentInput = z.object({
  customerId: z.number().int(),
  paymentDate: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  allocations: z.array(AllocationInput).optional().default([]),
});

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

async function remainingOfOrder(orderId: number, excludePaymentId?: number): Promise<{ total: number; remaining: number; customerId: number | null }> {
  const { rows } = await pool.query(
    `
    SELECT o.total::numeric AS total, o.customer_id,
      COALESCE((
        SELECT SUM(a.allocated_amount::numeric)
        FROM wholesale_payment_allocations a
        WHERE a.order_id = o.id
          ${excludePaymentId ? "AND a.payment_id <> $2" : ""}
      ), 0) AS paid
    FROM wholesale_orders o
    WHERE o.id = $1
    `,
    excludePaymentId ? [orderId, excludePaymentId] : [orderId],
  );
  const row = rows[0];
  if (!row) throw new Error("找不到出貨單");
  const total = round2(Number(row.total ?? 0));
  const paid = round2(Number(row.paid ?? 0));
  return { total, remaining: round2(Math.max(total - paid, 0)), customerId: row.customer_id == null ? null : Number(row.customer_id) };
}

async function applyAllocations(paymentId: number, customerId: number, allocations: z.infer<typeof AllocationInput>[]) {
  const existing = await db.select().from(wholesalePaymentAllocationsTable).where(eq(wholesalePaymentAllocationsTable.paymentId, paymentId));
  const touched = new Set<number>(existing.map((a) => a.orderId));
  await db.delete(wholesalePaymentAllocationsTable).where(eq(wholesalePaymentAllocationsTable.paymentId, paymentId));

  for (const a of allocations) {
    const info = await remainingOfOrder(a.orderId, paymentId);
    if (info.customerId !== customerId) {
      throw new Error(`出貨單 #${a.orderId} 不屬於此客戶`);
    }
    if (round2(a.allocatedAmount) - info.remaining > 0.009) {
      throw new Error(`出貨單 #${a.orderId} 可分配餘額僅 ${info.remaining}`);
    }
    touched.add(a.orderId);
  }

  if (allocations.length) {
    await db.insert(wholesalePaymentAllocationsTable).values(
      allocations.map((a) => ({
        paymentId,
        orderId: a.orderId,
        allocatedAmount: String(round2(a.allocatedAmount)),
      })),
    );
  }

  for (const orderId of touched) {
    await syncReceivableForOrder(orderId);
  }
}

router.get("/wholesale/payments", async (req, res): Promise<void> => {
  const customerId = typeof req.query.customerId === "string" ? parseInt(req.query.customerId, 10) : NaN;
  if (isNaN(customerId)) {
    res.status(400).json({ error: "需要 customerId" });
    return;
  }
  const payments = await db.select().from(wholesalePaymentsTable)
    .where(eq(wholesalePaymentsTable.customerId, customerId));
  const ids = payments.map((p) => p.id);
  const allocs = ids.length
    ? await pool.query(
        `SELECT * FROM wholesale_payment_allocations WHERE payment_id = ANY($1::int[])`,
        [ids],
      )
    : { rows: [] as any[] };
  const byPay = new Map<number, any[]>();
  for (const a of allocs.rows) {
    const list = byPay.get(a.payment_id) ?? [];
    list.push({
      id: a.id,
      paymentId: a.payment_id,
      orderId: a.order_id,
      allocatedAmount: Number(a.allocated_amount),
    });
    byPay.set(a.payment_id, list);
  }
  res.json(payments.map((p) => ({
    ...p,
    amount: Number(p.amount),
    allocations: byPay.get(p.id) ?? [],
  })));
});

router.post("/wholesale/payments", async (req, res): Promise<void> => {
  const parsed = PaymentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  const allocSum = round2(data.allocations.reduce((s, a) => s + a.allocatedAmount, 0));
  if (data.allocations.length && Math.abs(allocSum - data.amount) > 0.009) {
    res.status(400).json({ error: `分配合計 ${allocSum} 必須等於收款金額 ${data.amount}` });
    return;
  }
  try {
    const [pay] = await db.insert(wholesalePaymentsTable).values({
      customerId: data.customerId,
      paymentDate: data.paymentDate,
      amount: String(round2(data.amount)),
      paymentMethod: data.paymentMethod ?? null,
      note: data.note ?? null,
      createdBy: req.user?.id ?? null,
    }).returning();
    await applyAllocations(pay.id, data.customerId, data.allocations);
    if (data.allocations.length) {
      for (const a of data.allocations) {
        await db.insert(wholesalePaymentRecordsTable).values({
          wholesaleCustomerId: data.customerId,
          wholesaleOrderId: a.orderId,
          amount: String(round2(a.allocatedAmount)),
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod ?? null,
          note: data.note ?? null,
          createdBy: req.user?.id ?? null,
        });
      }
    }
    const allocations = await db.select().from(wholesalePaymentAllocationsTable)
      .where(eq(wholesalePaymentAllocationsTable.paymentId, pay.id));
    res.status(201).json({ ...pay, amount: Number(pay.amount), allocations });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/wholesale/payments/:id/allocations", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = z.object({ allocations: z.array(AllocationInput) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [pay] = await db.select().from(wholesalePaymentsTable).where(eq(wholesalePaymentsTable.id, id));
  if (!pay) { res.status(404).json({ error: "找不到收款紀錄" }); return; }
  const allocSum = round2(parsed.data.allocations.reduce((s, a) => s + a.allocatedAmount, 0));
  if (Math.abs(allocSum - Number(pay.amount)) > 0.009) {
    res.status(400).json({ error: `分配合計 ${allocSum} 必須等於收款金額 ${pay.amount}` });
    return;
  }
  try {
    await applyAllocations(id, pay.customerId, parsed.data.allocations);
    const allocations = await db.select().from(wholesalePaymentAllocationsTable)
      .where(eq(wholesalePaymentAllocationsTable.paymentId, id));
    res.json({ ...pay, amount: Number(pay.amount), allocations });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
