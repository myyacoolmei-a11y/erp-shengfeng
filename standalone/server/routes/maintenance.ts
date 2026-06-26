import { Router, type IRouter } from "express";
import { eq, and, lte } from "drizzle-orm";
import { db, maintenanceRemindersTable, customersTable } from "@workspace/db";
import { CreateMaintenanceReminderBody, UpdateMaintenanceReminderBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_ROLES = ["owner", "admin", "engineer", "technician"];
const WRITE_ROLES = ["owner", "admin", "engineer"];
const PATCH_ROLES = ["owner", "admin", "engineer", "technician"];
const DELETE_ROLES = ["owner", "admin"];

router.get("/maintenance-reminders", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const { customerId, status, upcoming } = req.query as { customerId?: string; status?: string; upcoming?: string };
  const conditions = [];
  if (customerId) {
    const cid = parseInt(customerId, 10);
    if (!isNaN(cid)) conditions.push(eq(maintenanceRemindersTable.customerId, cid));
  }
  if (status) {
    conditions.push(eq(maintenanceRemindersTable.status, status));
  }
  if (upcoming === "true") {
    const inThirtyDays = new Date();
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    conditions.push(lte(maintenanceRemindersTable.reminderDate, inThirtyDays.toISOString().split("T")[0]));
  }

  const reminders = await db
    .select({
      id: maintenanceRemindersTable.id,
      customerId: maintenanceRemindersTable.customerId,
      customerName: customersTable.name,
      acUnitId: maintenanceRemindersTable.acUnitId,
      reminderDate: maintenanceRemindersTable.reminderDate,
      description: maintenanceRemindersTable.description,
      status: maintenanceRemindersTable.status,
      notes: maintenanceRemindersTable.notes,
      createdAt: maintenanceRemindersTable.createdAt,
    })
    .from(maintenanceRemindersTable)
    .leftJoin(customersTable, eq(maintenanceRemindersTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(maintenanceRemindersTable.reminderDate);

  res.json(reminders.map(r => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  })));
});

router.post("/maintenance-reminders", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateMaintenanceReminderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [reminder] = await db.insert(maintenanceRemindersTable).values(parsed.data).returning();
  res.status(201).json({
    ...reminder,
    customerName: null,
    createdAt: reminder.createdAt instanceof Date ? reminder.createdAt.toISOString() : reminder.createdAt,
  });
});

router.get("/maintenance-reminders/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [reminder] = await db
    .select({
      id: maintenanceRemindersTable.id,
      customerId: maintenanceRemindersTable.customerId,
      customerName: customersTable.name,
      acUnitId: maintenanceRemindersTable.acUnitId,
      reminderDate: maintenanceRemindersTable.reminderDate,
      description: maintenanceRemindersTable.description,
      status: maintenanceRemindersTable.status,
      notes: maintenanceRemindersTable.notes,
      createdAt: maintenanceRemindersTable.createdAt,
    })
    .from(maintenanceRemindersTable)
    .leftJoin(customersTable, eq(maintenanceRemindersTable.customerId, customersTable.id))
    .where(eq(maintenanceRemindersTable.id, id));

  if (!reminder) {
    res.status(404).json({ error: "找不到保養提醒" });
    return;
  }
  res.json({
    ...reminder,
    createdAt: reminder.createdAt instanceof Date ? reminder.createdAt.toISOString() : reminder.createdAt,
  });
});

router.patch("/maintenance-reminders/:id", requireRole(...PATCH_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const role = req.user?.role;
  let bodyToParse = req.body as Record<string, unknown>;
  if (role === "technician") {
    bodyToParse = { status: bodyToParse["status"] };
  }

  const parsed = UpdateMaintenanceReminderBody.safeParse(bodyToParse);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [reminder] = await db.update(maintenanceRemindersTable).set(parsed.data).where(eq(maintenanceRemindersTable.id, id)).returning();
  if (!reminder) {
    res.status(404).json({ error: "找不到保養提醒" });
    return;
  }
  res.json({
    ...reminder,
    customerName: null,
    createdAt: reminder.createdAt instanceof Date ? reminder.createdAt.toISOString() : reminder.createdAt,
  });
});

router.delete("/maintenance-reminders/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [reminder] = await db.delete(maintenanceRemindersTable).where(eq(maintenanceRemindersTable.id, id)).returning();
  if (!reminder) {
    res.status(404).json({ error: "找不到保養提醒" });
    return;
  }
  res.sendStatus(204);
});

export default router;
