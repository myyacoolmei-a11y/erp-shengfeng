import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import { CreateEmployeeBody, UpdateEmployeeBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import {
  computeAllEmployeeKpis,
  computeEmployeeKpi,
  parseStatsRange,
  type StatsRangeParams,
} from "../lib/statistics/statisticsService";
import { currentMonthParam } from "../lib/statistics/dateRange";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "distributor", "accountant", "engineer", "technician"];
const WRITE_ROLES = ["super_admin", "owner", "admin"];

function perfParams(query: Record<string, unknown>): StatsRangeParams {
  return {
    period: query.period as string | undefined,
    month: query.month as string | undefined,
    quarter: query.quarter as string | undefined,
    year: query.year as string | undefined,
    from: query.from as string | undefined,
    to: query.to as string | undefined,
  };
}

router.get("/employees", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const { position, status } = req.query as { position?: string; status?: string };
  const conditions = [];
  if (position) conditions.push(eq(employeesTable.position, position));
  if (status) conditions.push(eq(employeesTable.status, status));

  const employees = await db
    .select()
    .from(employeesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(employeesTable.name);

  res.json(employees.map(e => ({
    ...e,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
  })));
});

router.get("/employees/performance", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const params = perfParams(req.query as Record<string, unknown>);
  if (!params.period && !params.month) {
    params.period = "month";
    params.month = currentMonthParam();
  }
  try {
    const range = parseStatsRange(params);
    const rows = await computeAllEmployeeKpis(range);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid period" });
  }
});

router.get("/employees/:id/performance", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const params = perfParams(req.query as Record<string, unknown>);
  if (!params.period && !params.month) {
    params.period = "month";
    params.month = currentMonthParam();
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!employee) { res.status(404).json({ error: "找不到員工" }); return; }

  try {
    const row = await computeEmployeeKpi(employee, params);
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid period" });
  }
});

router.post("/employees", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [employee] = await db.insert(employeesTable).values(parsed.data).returning();
  res.status(201).json({
    ...employee,
    createdAt: employee.createdAt instanceof Date ? employee.createdAt.toISOString() : employee.createdAt,
    updatedAt: employee.updatedAt instanceof Date ? employee.updatedAt.toISOString() : employee.updatedAt,
  });
});

router.get("/employees/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!employee) { res.status(404).json({ error: "找不到員工" }); return; }
  res.json({
    ...employee,
    createdAt: employee.createdAt instanceof Date ? employee.createdAt.toISOString() : employee.createdAt,
    updatedAt: employee.updatedAt instanceof Date ? employee.updatedAt.toISOString() : employee.updatedAt,
  });
});

router.patch("/employees/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [employee] = await db.update(employeesTable).set(parsed.data).where(eq(employeesTable.id, id)).returning();
  if (!employee) { res.status(404).json({ error: "找不到員工" }); return; }
  res.json({
    ...employee,
    createdAt: employee.createdAt instanceof Date ? employee.createdAt.toISOString() : employee.createdAt,
    updatedAt: employee.updatedAt instanceof Date ? employee.updatedAt.toISOString() : employee.updatedAt,
  });
});

router.delete("/employees/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [employee] = await db.delete(employeesTable).where(eq(employeesTable.id, id)).returning();
  if (!employee) { res.status(404).json({ error: "找不到員工" }); return; }
  res.sendStatus(204);
});

export default router;
