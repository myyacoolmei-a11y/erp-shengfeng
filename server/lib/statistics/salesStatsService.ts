/**
 * 業務統計查詢：讀取現有報價／派工／應收／維修，依報價來源 ID 去重。
 * 不寫入、不改 schema。
 */
import { and, gte, isNull, lt, lte, or } from "drizzle-orm";
import {
  db,
  quotesTable,
  quoteItemsTable,
  workOrdersTable,
  receivablesTable,
  paymentsTable,
  repairCasesTable,
  usersTable,
  employeesTable,
  customersTable,
} from "@workspace/db";
import { isQuoteWon } from "../../../shared/quoteStatus.ts";
import { computeQuoteDisplayTotal } from "../quoteTotals";
import { buildRepairCaseSalesOptions } from "../repairCases/salesOptions.ts";
import {
  aggregateSalesStats,
  casePaymentStatus,
  dateInRange,
  mapSalesCaseCategory,
  matchesSalesFilter,
  quoteCaseKey,
  receivableCaseKey,
  repairCaseKey,
  resolveSalesIdentity,
  timestampToTaipeiDate,
  toMoneyNumber,
  workOrderCaseKey,
  type SalesOption,
  type SalesStatCase,
  type SalesStatsResult,
  UNASSIGNED_SALES_KEY,
  UNASSIGNED_SALES_NAME,
} from "../../../shared/salesStats.ts";

export type { SalesStatsResult, SalesOption };

function taipeiRangeBounds(from: string, to: string): { startTs: Date; endTsExclusive: Date } {
  const startTs = new Date(`${from}T00:00:00+08:00`);
  const endTsExclusive = new Date(`${to}T00:00:00+08:00`);
  endTsExclusive.setTime(endTsExclusive.getTime() + 24 * 60 * 60 * 1000);
  return { startTs, endTsExclusive };
}

function pickUserForEmployee(
  users: Array<{
    id: number;
    displayName: string;
    linkedEmployeeId: number | null;
    role: string | null;
    roles: string[] | null;
    isActive: boolean | null;
  }>,
): Map<number, { id: number; displayName: string }> {
  const ranked = [...users].sort((a, b) => {
    const aSales = a.role === "sales" || (Array.isArray(a.roles) && a.roles.includes("sales"));
    const bSales = b.role === "sales" || (Array.isArray(b.roles) && b.roles.includes("sales"));
    if (aSales !== bSales) return aSales ? -1 : 1;
    if (Boolean(a.isActive) !== Boolean(b.isActive)) return a.isActive ? -1 : 1;
    return a.id - b.id;
  });
  const map = new Map<number, { id: number; displayName: string }>();
  for (const user of ranked) {
    if (user.linkedEmployeeId == null) continue;
    if (map.has(user.linkedEmployeeId)) continue;
    map.set(user.linkedEmployeeId, { id: user.id, displayName: user.displayName });
  }
  return map;
}

function quoteContent(
  title: string,
  items: Array<{ itemName?: string | null; brand?: string | null; model?: string | null; quantity?: unknown }>,
): string {
  const named = items
    .map((item) => {
      const qty = toMoneyNumber(item.quantity);
      const label = [item.brand, item.model, item.itemName].filter((p) => (p ?? "").trim()).join(" ").trim();
      if (!label) return "";
      return qty > 1 ? `${label} ${qty} 台` : label;
    })
    .filter(Boolean);
  if (named.length) return named.slice(0, 3).join("、");
  return title.trim() || "—";
}

export async function computeSalesStats(input: {
  from: string;
  to: string;
  salesUserId?: string | null;
}): Promise<SalesStatsResult & { salesOptions: SalesOption[] }> {
  const { from, to } = input;
  const { startTs, endTsExclusive } = taipeiRangeBounds(from, to);

  const [quoteRows, itemRows, workOrders, receivables, payments, repairs, users, employees, customers] = await Promise.all([
    db
      .select({
        id: quotesTable.id,
        customerId: quotesTable.customerId,
        customerName: quotesTable.customerName,
        contactPerson: quotesTable.contactPerson,
        title: quotesTable.title,
        description: quotesTable.description,
        amount: quotesTable.amount,
        discountAmount: quotesTable.discountAmount,
        finalAmount: quotesTable.finalAmount,
        taxType: quotesTable.taxType,
        status: quotesTable.status,
        salesRepId: quotesTable.salesRepId,
        wonAt: quotesTable.wonAt,
        createdAt: quotesTable.createdAt,
      })
      .from(quotesTable)
      .where(and(gte(quotesTable.wonAt, startTs), lt(quotesTable.wonAt, endTsExclusive))),
    db
      .select({
        quoteId: quoteItemsTable.quoteId,
        category: quoteItemsTable.category,
        itemName: quoteItemsTable.itemName,
        brand: quoteItemsTable.brand,
        model: quoteItemsTable.model,
        quantity: quoteItemsTable.quantity,
        subtotal: quoteItemsTable.subtotal,
        sortOrder: quoteItemsTable.sortOrder,
      })
      .from(quoteItemsTable),
    db
      .select({
        id: workOrdersTable.id,
        quoteId: workOrdersTable.quoteId,
        customerId: workOrdersTable.customerId,
        customerName: workOrdersTable.customerName,
        title: workOrdersTable.title,
        status: workOrdersTable.status,
        projectType: workOrdersTable.projectType,
        scheduledDate: workOrdersTable.scheduledDate,
        createdAt: workOrdersTable.createdAt,
      })
      .from(workOrdersTable),
    db
      .select({
        id: receivablesTable.id,
        customerId: receivablesTable.customerId,
        workOrderId: receivablesTable.workOrderId,
        projectName: receivablesTable.projectName,
        projectType: receivablesTable.projectType,
        totalAmount: receivablesTable.totalAmount,
        receivedAmount: receivablesTable.receivedAmount,
        paymentStatus: receivablesTable.paymentStatus,
        createdAt: receivablesTable.createdAt,
      })
      .from(receivablesTable),
    db
      .select({
        id: paymentsTable.id,
        quoteId: paymentsTable.quoteId,
        workOrderId: paymentsTable.workOrderId,
        receivableId: paymentsTable.receivableId,
        amount: paymentsTable.amount,
        reversedAt: paymentsTable.reversedAt,
      })
      .from(paymentsTable)
      .where(isNull(paymentsTable.reversedAt)),
    db
      .select({
        id: repairCasesTable.id,
        customerId: repairCasesTable.customerId,
        tempCustomerName: repairCasesTable.tempCustomerName,
        contactName: repairCasesTable.contactName,
        brand: repairCasesTable.brand,
        model: repairCasesTable.model,
        problemDescription: repairCasesTable.problemDescription,
        status: repairCasesTable.status,
        salesUserId: repairCasesTable.salesUserId,
        appointmentDate: repairCasesTable.appointmentDate,
        createdAt: repairCasesTable.createdAt,
      })
      .from(repairCasesTable)
      .where(
        and(
          or(
            and(
              gte(repairCasesTable.appointmentDate, from),
              lte(repairCasesTable.appointmentDate, to),
            ),
            and(isNull(repairCasesTable.appointmentDate), gte(repairCasesTable.createdAt, startTs), lt(repairCasesTable.createdAt, endTsExclusive)),
          ),
        ),
      ),
    db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        role: usersTable.role,
        roles: usersTable.roles,
        isActive: usersTable.isActive,
        linkedEmployeeId: usersTable.linkedEmployeeId,
      })
      .from(usersTable),
    db.select({ id: employeesTable.id, name: employeesTable.name, position: employeesTable.position }).from(employeesTable),
    db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        primarySalesRepId: customersTable.primarySalesRepId,
      })
      .from(customersTable),
  ]);

  const userById = new Map(users.map((u) => [u.id, { id: u.id, displayName: u.displayName }]));
  const userByEmployeeId = pickUserForEmployee(users);
  const employeeById = new Map(employees.map((e) => [e.id, { id: e.id, name: e.name, position: e.position }]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const identityMaps = { userById, userByEmployeeId, employeeById };

  const itemsByQuote = new Map<number, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByQuote.get(item.quoteId) ?? [];
    list.push(item);
    itemsByQuote.set(item.quoteId, list);
  }
  for (const list of itemsByQuote.values()) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const wosByQuote = new Map<number, typeof workOrders>();
  const woById = new Map<number, (typeof workOrders)[number]>();
  for (const wo of workOrders) {
    woById.set(wo.id, wo);
    if (wo.quoteId != null) {
      const list = wosByQuote.get(wo.quoteId) ?? [];
      list.push(wo);
      wosByQuote.set(wo.quoteId, list);
    }
  }

  const recvsByWo = new Map<number, typeof receivables>();
  for (const recv of receivables) {
    if (recv.workOrderId == null) continue;
    const list = recvsByWo.get(recv.workOrderId) ?? [];
    list.push(recv);
    recvsByWo.set(recv.workOrderId, list);
  }

  function paymentSum(filter: (p: (typeof payments)[number]) => boolean): number {
    let sum = 0;
    for (const p of payments) {
      if (p.reversedAt) continue;
      if (filter(p)) sum += toMoneyNumber(p.amount);
    }
    return sum;
  }

  function recvsForWorkOrders(woIds: number[]) {
    const out: typeof receivables = [];
    for (const id of woIds) {
      const list = recvsByWo.get(id);
      if (list) out.push(...list);
    }
    return out;
  }

  function customerName(
    customerId: number | null | undefined,
    fallback?: string | null,
  ): string {
    if (customerId != null) {
      const name = customerById.get(customerId)?.name?.trim();
      if (name) return name;
    }
    return (fallback ?? "").trim() || "—";
  }

  function salesFromQuoteOrCustomer(salesRepId: number | null, customerId: number | null) {
    const fromQuote = resolveSalesIdentity({
      salesRepId,
      ...identityMaps,
    });
    if (fromQuote.salesKey !== UNASSIGNED_SALES_KEY) return fromQuote;
    const primary = customerId != null ? customerById.get(customerId)?.primarySalesRepId ?? null : null;
    return resolveSalesIdentity({
      salesRepId: primary ?? null,
      ...identityMaps,
    });
  }

  const cases: SalesStatCase[] = [];
  const consumedWoIds = new Set<number>();
  const consumedRecvIds = new Set<number>();

  for (const quote of quoteRows) {
    if (!isQuoteWon(quote.status)) continue;
    const wonDate = timestampToTaipeiDate(quote.wonAt);
    if (!dateInRange(wonDate, from, to)) continue;

    const items = itemsByQuote.get(quote.id) ?? [];
    const linkedWos = wosByQuote.get(quote.id) ?? [];
    for (const wo of linkedWos) consumedWoIds.add(wo.id);
    const recvs = recvsForWorkOrders(linkedWos.map((w) => w.id));
    for (const recv of recvs) consumedRecvIds.add(recv.id);

    const wonAmount = computeQuoteDisplayTotal(quote, items);
    const receivedFromAr = recvs.reduce((s, r) => s + toMoneyNumber(r.receivedAmount), 0);
    const receivedAmount =
      recvs.length > 0
        ? receivedFromAr
        : paymentSum((p) => p.quoteId === quote.id || linkedWos.some((w) => w.id === p.workOrderId));

    const firstCategory =
      items.find((i) => (i.category ?? "").trim() && (i.category ?? "").trim() !== "其他")?.category ??
      items[0]?.category ??
      linkedWos[0]?.projectType ??
      recvs[0]?.projectType ??
      null;

    const sales = salesFromQuoteOrCustomer(quote.salesRepId ?? null, quote.customerId ?? null);
    const fallbackStatus = recvs[0]?.paymentStatus ?? quote.status;
    cases.push({
      caseKey: quoteCaseKey(quote.id),
      ...sales,
      date: wonDate ?? from,
      customerName: customerName(quote.customerId, quote.customerName || quote.contactPerson),
      category: mapSalesCaseCategory(firstCategory, "quote"),
      content: quoteContent(quote.title, items),
      wonAmount,
      receivedAmount,
      status: casePaymentStatus(wonAmount, receivedAmount, fallbackStatus),
    });
  }

  for (const wo of workOrders) {
    if (wo.quoteId != null) continue;
    if (consumedWoIds.has(wo.id)) continue;
    const recvs = recvsByWo.get(wo.id) ?? [];
    const date = wo.scheduledDate ?? timestampToTaipeiDate(wo.createdAt);
    if (!dateInRange(date, from, to)) continue;
    for (const recv of recvs) consumedRecvIds.add(recv.id);
    consumedWoIds.add(wo.id);

    const wonAmount = recvs.length > 0
      ? recvs.reduce((s, r) => s + toMoneyNumber(r.totalAmount), 0)
      : 0;
    const receivedAmount = recvs.length > 0
      ? recvs.reduce((s, r) => s + toMoneyNumber(r.receivedAmount), 0)
      : paymentSum((p) => p.workOrderId === wo.id);

    const sales = salesFromQuoteOrCustomer(null, wo.customerId ?? null);
    cases.push({
      caseKey: workOrderCaseKey(wo.id),
      ...sales,
      date: date ?? from,
      customerName: customerName(wo.customerId, wo.customerName),
      category: mapSalesCaseCategory(wo.projectType ?? recvs[0]?.projectType, "work_order"),
      content: (wo.title || recvs[0]?.projectName || "").trim() || "—",
      wonAmount,
      receivedAmount,
      status: casePaymentStatus(wonAmount, receivedAmount, recvs[0]?.paymentStatus ?? wo.status),
    });
  }

  for (const recv of receivables) {
    if (consumedRecvIds.has(recv.id)) continue;
    if (recv.workOrderId != null) {
      const wo = woById.get(recv.workOrderId);
      if (wo?.quoteId != null) continue;
      if (consumedWoIds.has(recv.workOrderId)) continue;
    }
    const date = timestampToTaipeiDate(recv.createdAt);
    if (!dateInRange(date, from, to)) continue;
    consumedRecvIds.add(recv.id);

    const wonAmount = toMoneyNumber(recv.totalAmount);
    const receivedAmount = toMoneyNumber(recv.receivedAmount);
    const sales = salesFromQuoteOrCustomer(null, recv.customerId ?? null);
    cases.push({
      caseKey: receivableCaseKey(recv.id),
      ...sales,
      date: date ?? from,
      customerName: customerName(recv.customerId, recv.projectName),
      category: mapSalesCaseCategory(recv.projectType, "receivable"),
      content: (recv.projectName ?? "").trim() || "—",
      wonAmount,
      receivedAmount,
      status: casePaymentStatus(wonAmount, receivedAmount, recv.paymentStatus),
    });
  }

  for (const repair of repairs) {
    if (repair.status === "已取消") continue;
    const date = repair.appointmentDate || timestampToTaipeiDate(repair.createdAt);
    if (!dateInRange(date, from, to)) continue;
    const sales = resolveSalesIdentity({
      salesUserId: repair.salesUserId ?? null,
      ...identityMaps,
    });
    const content =
      (repair.problemDescription ?? "").trim() ||
      [repair.brand, repair.model].filter((p) => (p ?? "").trim()).join(" ").trim() ||
      "維修";
    cases.push({
      caseKey: repairCaseKey(repair.id),
      ...sales,
      date: date ?? from,
      customerName: customerName(
        repair.customerId,
        repair.tempCustomerName || repair.contactName,
      ),
      category: mapSalesCaseCategory(null, "repair"),
      content,
      wonAmount: 0,
      receivedAmount: 0,
      status: repair.status || "待派工",
    });
  }

  const filtered = cases.filter((c) => matchesSalesFilter(c, input.salesUserId));
  const result = aggregateSalesStats(filtered, { from, to });

  const salesOptions = buildRepairCaseSalesOptions({
    users: users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      role: u.role,
      roles: u.roles,
      isActive: u.isActive,
      employeePosition: u.linkedEmployeeId != null ? employeeById.get(u.linkedEmployeeId)?.position ?? null : null,
      employeeName: u.linkedEmployeeId != null ? employeeById.get(u.linkedEmployeeId)?.name ?? null : null,
    })),
  });

  return { ...result, salesOptions };
}

export { UNASSIGNED_SALES_KEY, UNASSIGNED_SALES_NAME };
