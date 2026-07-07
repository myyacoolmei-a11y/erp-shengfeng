import { and, eq, gte, lt, lte, inArray } from "drizzle-orm";
import {
  db,
  employeesTable,
  quotesTable,
  workOrdersTable,
} from "@workspace/db";

const WON_STATUSES = ["已接受", "已完成"] as const;

export interface SalesPerformance {
  quoteCount: number;
  quoteAmount: number;
  wonCount: number;
  wonAmount: number;
  winRate: number;
  avgTicket: number;
  performanceAmount: number;
}

export interface TechnicianPerformance {
  installCount: number;
  maintenanceCount: number;
  repairCount: number;
  completedWorkOrderCount: number;
}

export interface EmployeePerformanceRow {
  employeeId: number;
  employeeName: string;
  position: string;
  month: string;
  sales: SalesPerformance;
  technician: TechnicianPerformance;
}

function parseMonth(month: string): { year: number; mon: number; start: Date; endExclusive: Date; startDate: string; endDate: string } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error("Invalid month format, expected YYYY-MM");
  }
  const start = new Date(y, m - 1, 1);
  const endExclusive = new Date(y, m, 1);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    year: y,
    mon: m,
    start,
    endExclusive,
    startDate: `${y}-${String(m).padStart(2, "0")}-01`,
    endDate: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function quoteAmount(q: { finalAmount: string | null; amount: string | null }): number {
  const raw = q.finalAmount ?? q.amount ?? "0";
  return parseFloat(String(raw)) || 0;
}

function isWorkOrderAssignedTo(wo: {
  assignedTo: string | null;
  assistantTo: string | null;
  technicians: string | null;
}, employeeName: string): boolean {
  if (wo.assignedTo === employeeName || wo.assistantTo === employeeName) return true;
  if (!wo.technicians) return false;
  try {
    const techs = JSON.parse(wo.technicians);
    return Array.isArray(techs) && techs.includes(employeeName);
  } catch {
    return false;
  }
}

export function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function computeEmployeePerformance(
  employee: { id: number; name: string; position: string },
  month: string,
): Promise<EmployeePerformanceRow> {
  const range = parseMonth(month);

  const monthQuotes = await db
    .select({
      id: quotesTable.id,
      status: quotesTable.status,
      amount: quotesTable.amount,
      finalAmount: quotesTable.finalAmount,
    })
    .from(quotesTable)
    .where(and(
      eq(quotesTable.salesRepId, employee.id),
      gte(quotesTable.createdAt, range.start),
      lt(quotesTable.createdAt, range.endExclusive),
    ));

  const quoteIds = monthQuotes.map(q => q.id);
  let quoteIdsWithWorkOrder = new Set<number>();
  if (quoteIds.length > 0) {
    const linked = await db
      .select({ quoteId: workOrdersTable.quoteId })
      .from(workOrdersTable)
      .where(inArray(workOrdersTable.quoteId, quoteIds));
    quoteIdsWithWorkOrder = new Set(linked.map(r => r.quoteId).filter((id): id is number => id != null));
  }

  const wonQuotes = monthQuotes.filter(q =>
    WON_STATUSES.includes(q.status as typeof WON_STATUSES[number]) || quoteIdsWithWorkOrder.has(q.id),
  );

  const quoteCount = monthQuotes.length;
  const quoteAmountTotal = monthQuotes.reduce((s, q) => s + quoteAmount(q), 0);
  const wonCount = wonQuotes.length;
  const wonAmount = wonQuotes.reduce((s, q) => s + quoteAmount(q), 0);

  const completedWorkOrders = await db
    .select({
      id: workOrdersTable.id,
      projectType: workOrdersTable.projectType,
      assignedTo: workOrdersTable.assignedTo,
      assistantTo: workOrdersTable.assistantTo,
      technicians: workOrdersTable.technicians,
      completedDate: workOrdersTable.completedDate,
    })
    .from(workOrdersTable)
    .where(and(
      eq(workOrdersTable.status, "已完成"),
      gte(workOrdersTable.completedDate, range.startDate),
      lte(workOrdersTable.completedDate, range.endDate),
    ));

  const assignedWOs = completedWorkOrders.filter(wo => isWorkOrderAssignedTo(wo, employee.name));

  const installCount = assignedWOs.filter(wo => wo.projectType === "新裝").length;
  const woMaintenanceCount = assignedWOs.filter(wo => wo.projectType === "保養" || wo.projectType === "保固服務").length;
  const repairCount = assignedWOs.filter(wo => wo.projectType === "維修").length;

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    position: employee.position,
    month,
    sales: {
      quoteCount,
      quoteAmount: quoteAmountTotal,
      wonCount,
      wonAmount,
      winRate: quoteCount > 0 ? wonCount / quoteCount : 0,
      avgTicket: wonCount > 0 ? wonAmount / wonCount : 0,
      performanceAmount: wonAmount,
    },
    technician: {
      installCount,
      maintenanceCount: woMaintenanceCount,
      repairCount,
      completedWorkOrderCount: assignedWOs.length,
    },
  };
}

export async function listEmployeePerformance(month: string): Promise<EmployeePerformanceRow[]> {
  const employees = await db.select().from(employeesTable).orderBy(employeesTable.name);
  const rows: EmployeePerformanceRow[] = [];
  for (const emp of employees) {
    rows.push(await computeEmployeePerformance(emp, month));
  }
  return rows;
}
