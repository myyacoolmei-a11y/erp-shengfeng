import { Router, type IRouter } from "express";
import { eq, and, lt } from "drizzle-orm";
import { db, receivablesTable, customersTable } from "@workspace/db";
import { requireRole } from "../lib/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

const READ_ROLES = ["owner", "admin", "accountant"];
const WRITE_ROLES = ["owner", "admin", "accountant"];
const DELETE_ROLES = ["owner", "admin"];

function parseId(raw: unknown): number | null {
  const id = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return isNaN(id) ? null : id;
}

function fmt(r: Record<string, unknown>) {
  return {
    ...r,
    totalAmount: parseFloat(String(r.totalAmount ?? "0")),
    receivedAmount: parseFloat(String(r.receivedAmount ?? "0")),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

const REC_SELECT = {
  id: receivablesTable.id,
  customerId: receivablesTable.customerId,
  customerName: customersTable.name,
  workOrderId: receivablesTable.workOrderId,
  workOrderNumber: receivablesTable.workOrderNumber,
  projectName: receivablesTable.projectName,
  projectType: receivablesTable.projectType,
  completionDate: receivablesTable.completionDate,
  totalAmount: receivablesTable.totalAmount,
  receivedAmount: receivablesTable.receivedAmount,
  paymentStatus: receivablesTable.paymentStatus,
  expectedPaymentDate: receivablesTable.expectedPaymentDate,
  actualPaymentDate: receivablesTable.actualPaymentDate,
  paymentMethod: receivablesTable.paymentMethod,
  notes: receivablesTable.notes,
  invoiceStatus: receivablesTable.invoiceStatus,
  invoiceType: receivablesTable.invoiceType,
  taxId: receivablesTable.taxId,
  invoiceTitle: receivablesTable.invoiceTitle,
  invoiceNumber: receivablesTable.invoiceNumber,
  invoiceDate: receivablesTable.invoiceDate,
  invoiceNotes: receivablesTable.invoiceNotes,
  createdAt: receivablesTable.createdAt,
  updatedAt: receivablesTable.updatedAt,
};

router.get("/receivables", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const { customerId, status, workOrderId } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(receivablesTable.customerId, cid));
  }
  if (workOrderId) {
    const wid = parseInt(workOrderId, 10);
    if (!isNaN(wid)) conditions.push(eq(receivablesTable.workOrderId, wid));
  }
  if (status === "逾期") {
    const today = new Date().toISOString().split("T")[0];
    conditions.push(lt(receivablesTable.expectedPaymentDate, today));
    conditions.push(eq(receivablesTable.paymentStatus, "未收款"));
  } else if (status === "發票未開立") {
    conditions.push(eq(receivablesTable.invoiceStatus, "未開立"));
  } else if (status && status !== "全部") {
    conditions.push(eq(receivablesTable.paymentStatus, status));
  }

  const rows = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(receivablesTable.createdAt);

  res.json(rows.map(fmt));
});

router.post("/receivables", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const CreateSchema = z.object({
    customerId: z.number().int(),
    workOrderId: z.number().int().optional(),
    workOrderNumber: z.string().optional(),
    projectName: z.string().optional(),
    projectType: z.string().optional(),
    completionDate: z.string().optional(),
    totalAmount: z.number(),
    expectedPaymentDate: z.string().optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
    invoiceStatus: z.string().optional(),
    invoiceType: z.string().optional(),
    taxId: z.string().optional(),
    invoiceTitle: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.string().optional(),
    invoiceNotes: z.string().optional(),
  });
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.workOrderId) {
    const existing = await db
      .select({ id: receivablesTable.id })
      .from(receivablesTable)
      .where(eq(receivablesTable.workOrderId, parsed.data.workOrderId));
    if (existing.length > 0) {
      res.status(409).json({ error: "此派工單已有應收帳款紀錄", receivableId: existing[0].id });
      return;
    }
  }

  const data = {
    ...parsed.data,
    totalAmount: String(parsed.data.totalAmount),
    receivedAmount: "0",
    paymentStatus: "未收款",
    invoiceStatus: parsed.data.invoiceStatus ?? "未開立",
  };
  const [row] = await db.insert(receivablesTable).values(data).returning();
  const joined = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, row.id));
  res.status(201).json(fmt(joined[0] as Record<string, unknown>));
});

router.get("/receivables/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, id));
  if (!row) { res.status(404).json({ error: "找不到應收帳款" }); return; }
  res.json(fmt(row as Record<string, unknown>));
});

router.patch("/receivables/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const UpdateSchema = z.object({
    totalAmount: z.number().optional(),
    expectedPaymentDate: z.string().nullable().optional(),
    actualPaymentDate: z.string().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    invoiceStatus: z.string().optional(),
    invoiceType: z.string().nullable().optional(),
    taxId: z.string().nullable().optional(),
    invoiceTitle: z.string().nullable().optional(),
    invoiceNumber: z.string().nullable().optional(),
    invoiceDate: z.string().nullable().optional(),
    invoiceNotes: z.string().nullable().optional(),
  });
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.totalAmount != null) data["totalAmount"] = String(parsed.data.totalAmount);

  await db.update(receivablesTable).set(data).where(eq(receivablesTable.id, id));
  const [updated] = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, id));
  if (!updated) { res.status(404).json({ error: "找不到應收帳款" }); return; }
  res.json(fmt(updated as Record<string, unknown>));
});

router.post("/receivables/:id/payment", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const PaymentSchema = z.object({
    amount: z.number().positive(),
    paymentDate: z.string(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = PaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [current] = await db.select().from(receivablesTable).where(eq(receivablesTable.id, id));
  if (!current) { res.status(404).json({ error: "找不到應收帳款" }); return; }

  const newReceived = parseFloat(String(current.receivedAmount ?? "0")) + parsed.data.amount;
  const total = parseFloat(String(current.totalAmount ?? "0"));
  const remaining = total - newReceived;

  let paymentStatus = "部分收款";
  if (newReceived <= 0) paymentStatus = "未收款";
  else if (remaining <= 0) paymentStatus = "已收款";

  const updateData: Record<string, unknown> = {
    receivedAmount: String(newReceived),
    paymentStatus,
    paymentMethod: parsed.data.paymentMethod ?? current.paymentMethod,
  };
  if (remaining <= 0) {
    updateData["actualPaymentDate"] = parsed.data.paymentDate;
  }

  await db.update(receivablesTable).set(updateData).where(eq(receivablesTable.id, id));
  const [updated] = await db
    .select(REC_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .where(eq(receivablesTable.id, id));
  res.json(fmt(updated as Record<string, unknown>));
});

router.delete("/receivables/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(receivablesTable).where(eq(receivablesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "找不到應收帳款" }); return; }
  res.sendStatus(204);
});

export default router;
