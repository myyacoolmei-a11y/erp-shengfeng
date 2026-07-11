import { Router, type IRouter } from "express";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import {
  db,
  repairCasesTable,
  repairCasePhotosTable,
  customersTable,
  employeesTable,
} from "@workspace/db";
import { CreateRepairCaseBody, UpdateRepairCaseBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import { shouldApplyOwnDataFilter } from "../../shared/userPermissions.ts";
import { buildUserAssignmentContext } from "../lib/workOrders/workOrderAssignment.ts";
import {
  canAccessRepairCase,
  assertRepairCaseDataAccess,
} from "../lib/dataPermissionAccess.ts";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "engineer", "technician", "sales"];
const WRITE_ROLES = ["super_admin", "owner", "admin", "engineer"];
const PATCH_ROLES = ["super_admin", "owner", "admin", "engineer", "technician"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

function mapRepairCase(row: {
  id: number;
  repairNo: string | null;
  source: string;
  customerId: number | null;
  tempCustomerName: string | null;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  siteAddress: string | null;
  brand: string | null;
  model: string | null;
  quantity: number | null;
  problemDescription: string | null;
  status: string;
  priority: string;
  appointmentDate: string | null;
  appointmentTime: string | null;
  employeeId: number | null;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  customerName?: string | null;
  employeeName?: string | null;
}) {
  return {
    ...row,
    customerName: row.customerName ?? row.tempCustomerName ?? null,
    employeeName: row.employeeName ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

const caseSelect = {
  id: repairCasesTable.id,
  repairNo: repairCasesTable.repairNo,
  source: repairCasesTable.source,
  customerId: repairCasesTable.customerId,
  tempCustomerName: repairCasesTable.tempCustomerName,
  contactName: repairCasesTable.contactName,
  phone: repairCasesTable.phone,
  address: repairCasesTable.address,
  siteAddress: repairCasesTable.siteAddress,
  brand: repairCasesTable.brand,
  model: repairCasesTable.model,
  quantity: repairCasesTable.quantity,
  problemDescription: repairCasesTable.problemDescription,
  status: repairCasesTable.status,
  priority: repairCasesTable.priority,
  appointmentDate: repairCasesTable.appointmentDate,
  appointmentTime: repairCasesTable.appointmentTime,
  employeeId: repairCasesTable.employeeId,
  notes: repairCasesTable.notes,
  createdAt: repairCasesTable.createdAt,
  updatedAt: repairCasesTable.updatedAt,
  customerName: customersTable.name,
  employeeName: employeesTable.name,
};

async function loadPhotos(repairCaseId: number) {
  return db
    .select()
    .from(repairCasePhotosTable)
    .where(eq(repairCasePhotosTable.repairCaseId, repairCaseId))
    .orderBy(repairCasePhotosTable.sortOrder);
}

function generateRepairNo(id: number, createdAt: Date | string) {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `RC-${y}${m}${day}-${String(id).padStart(4, "0")}`;
}

router.get("/repair-cases", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const { search, status, source } = req.query as { search?: string; status?: string; source?: string };
  const conditions = [];

  if (status && status !== "全部") conditions.push(eq(repairCasesTable.status, status));
  if (source && source !== "全部") conditions.push(eq(repairCasesTable.source, source));

  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(or(
      ilike(repairCasesTable.repairNo, q),
      ilike(customersTable.name, q),
      ilike(repairCasesTable.tempCustomerName, q),
      ilike(repairCasesTable.phone, q),
      ilike(employeesTable.name, q),
      ilike(repairCasesTable.status, q),
    ));
  }

  const rows = await db
    .select(caseSelect)
    .from(repairCasesTable)
    .leftJoin(customersTable, eq(repairCasesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(repairCasesTable.employeeId, employeesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(repairCasesTable.createdAt));

  let filtered = rows;
  if (req.user && shouldApplyOwnDataFilter(req.user)) {
    const ctx = await buildUserAssignmentContext(req.user);
    filtered = rows.filter(r => canAccessRepairCase(req.user!, r, ctx));
  }

  res.json(filtered.map(mapRepairCase));
});

router.post("/repair-cases", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateRepairCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { photos, ...data } = parsed.data;
  const [created] = await db.insert(repairCasesTable).values(data).returning();
  const repairNo = generateRepairNo(created.id, created.createdAt);
  const [row] = await db
    .update(repairCasesTable)
    .set({ repairNo })
    .where(eq(repairCasesTable.id, created.id))
    .returning();

  if (photos && photos.length > 0) {
    await db.insert(repairCasePhotosTable).values(
      photos.map((url, idx) => ({
        repairCaseId: created.id,
        url,
        sortOrder: idx,
      })),
    );
  }

  const [enriched] = await db
    .select(caseSelect)
    .from(repairCasesTable)
    .leftJoin(customersTable, eq(repairCasesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(repairCasesTable.employeeId, employeesTable.id))
    .where(eq(repairCasesTable.id, row.id));

  const photoRows = await loadPhotos(row.id);
  res.status(201).json({
    ...mapRepairCase(enriched ?? { ...row, customerName: null, employeeName: null }),
    photos: photoRows.map(p => ({
      id: p.id,
      repairCaseId: p.repairCaseId,
      url: p.url,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    })),
  });
});

router.get("/repair-cases/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select(caseSelect)
    .from(repairCasesTable)
    .leftJoin(customersTable, eq(repairCasesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(repairCasesTable.employeeId, employeesTable.id))
    .where(eq(repairCasesTable.id, id));

  if (!row) { res.status(404).json({ error: "找不到維修案件" }); return; }

  if (req.user) {
    const access = await assertRepairCaseDataAccess(req.user, row);
    if (!access.ok) { res.status(403).json({ error: access.message }); return; }
  }

  const photoRows = await loadPhotos(id);
  res.json({
    ...mapRepairCase(row),
    photos: photoRows.map(p => ({
      id: p.id,
      repairCaseId: p.repairCaseId,
      url: p.url,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    })),
  });
});

router.patch("/repair-cases/:id", requireRole(...PATCH_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select(caseSelect)
    .from(repairCasesTable)
    .leftJoin(customersTable, eq(repairCasesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(repairCasesTable.employeeId, employeesTable.id))
    .where(eq(repairCasesTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到維修案件" }); return; }

  if (req.user) {
    const access = await assertRepairCaseDataAccess(req.user, existing);
    if (!access.ok) { res.status(403).json({ error: access.message }); return; }
  }

  const parsed = UpdateRepairCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { photos, ...data } = parsed.data;
  const [updated] = await db
    .update(repairCasesTable)
    .set(data)
    .where(eq(repairCasesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "找不到維修案件" }); return; }

  if (photos !== undefined) {
    await db.delete(repairCasePhotosTable).where(eq(repairCasePhotosTable.repairCaseId, id));
    if (photos.length > 0) {
      await db.insert(repairCasePhotosTable).values(
        photos.map((url, idx) => ({ repairCaseId: id, url, sortOrder: idx })),
      );
    }
  }

  const [enriched] = await db
    .select(caseSelect)
    .from(repairCasesTable)
    .leftJoin(customersTable, eq(repairCasesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(repairCasesTable.employeeId, employeesTable.id))
    .where(eq(repairCasesTable.id, id));

  const photoRows = await loadPhotos(id);
  res.json({
    ...mapRepairCase(enriched ?? { ...updated, customerName: null, employeeName: null }),
    photos: photoRows.map(p => ({
      id: p.id,
      repairCaseId: p.repairCaseId,
      url: p.url,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    })),
  });
});

router.delete("/repair-cases/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select(caseSelect)
    .from(repairCasesTable)
    .leftJoin(customersTable, eq(repairCasesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(repairCasesTable.employeeId, employeesTable.id))
    .where(eq(repairCasesTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到維修案件" }); return; }

  if (req.user) {
    const access = await assertRepairCaseDataAccess(req.user, existing);
    if (!access.ok) { res.status(403).json({ error: access.message }); return; }
  }

  const [deleted] = await db.delete(repairCasesTable).where(eq(repairCasesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "找不到維修案件" }); return; }
  res.sendStatus(204);
});

export default router;
