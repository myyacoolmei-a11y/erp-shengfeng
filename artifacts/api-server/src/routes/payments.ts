import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, paymentsTable, customersTable } from "@workspace/db";
import { CreatePaymentBody, UpdatePaymentBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_WRITE_ROLES = ["owner", "admin", "accountant"];
const DELETE_ROLES = ["owner"];

router.get("/payments", requireRole(...READ_WRITE_ROLES), async (req, res): Promise<void> => {
  const { customerId } = req.query as { customerId?: string };
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(paymentsTable.customerId, cid));
  }

  const payments = await db
    .select({
      id: paymentsTable.id,
      customerId: paymentsTable.customerId,
      customerName: customersTable.name,
      quoteId: paymentsTable.quoteId,
      workOrderId: paymentsTable.workOrderId,
      amount: paymentsTable.amount,
      paymentDate: paymentsTable.paymentDate,
      paymentMethod: paymentsTable.paymentMethod,
      notes: paymentsTable.notes,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .leftJoin(customersTable, eq(paymentsTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(paymentsTable.paymentDate);

  res.json(payments.map(p => ({
    ...p,
    amount: parseFloat(p.amount as string),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  })));
});

router.post("/payments", requireRole(...READ_WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = { ...parsed.data, amount: String(parsed.data.amount) };
  const [payment] = await db.insert(paymentsTable).values(data).returning();
  res.status(201).json({
    ...payment,
    amount: parseFloat(payment.amount as string),
    customerName: null,
    createdAt: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : payment.createdAt,
  });
});

router.get("/payments/:id", requireRole(...READ_WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [payment] = await db
    .select({
      id: paymentsTable.id,
      customerId: paymentsTable.customerId,
      customerName: customersTable.name,
      quoteId: paymentsTable.quoteId,
      workOrderId: paymentsTable.workOrderId,
      amount: paymentsTable.amount,
      paymentDate: paymentsTable.paymentDate,
      paymentMethod: paymentsTable.paymentMethod,
      notes: paymentsTable.notes,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .leftJoin(customersTable, eq(paymentsTable.customerId, customersTable.id))
    .where(eq(paymentsTable.id, id));

  if (!payment) {
    res.status(404).json({ error: "找不到收款紀錄" });
    return;
  }
  res.json({
    ...payment,
    amount: parseFloat(payment.amount as string),
    createdAt: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : payment.createdAt,
  });
});

router.patch("/payments/:id", requireRole(...READ_WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount != null) data["amount"] = String(parsed.data.amount);
  const [payment] = await db.update(paymentsTable).set(data).where(eq(paymentsTable.id, id)).returning();
  if (!payment) {
    res.status(404).json({ error: "找不到收款紀錄" });
    return;
  }
  res.json({
    ...payment,
    amount: parseFloat(payment.amount as string),
    customerName: null,
    createdAt: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : payment.createdAt,
  });
});

router.delete("/payments/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [payment] = await db.delete(paymentsTable).where(eq(paymentsTable.id, id)).returning();
  if (!payment) {
    res.status(404).json({ error: "找不到收款紀錄" });
    return;
  }
  res.sendStatus(204);
});

export default router;
