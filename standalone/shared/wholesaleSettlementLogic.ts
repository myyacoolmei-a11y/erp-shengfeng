import {
  deriveWholesalePaymentStatus,
  parseMoney,
  remainingAmount,
  type WholesalePaymentStatus,
} from "./wholesalePaymentMath.ts";

export const WHOLESALE_SETTLEMENT_ACTIVE_STATUS = "已出貨";

export function normalizeWholesaleCompanyName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

export interface WholesaleCustomerRef {
  id: number;
  companyName: string;
}

export interface WholesaleSettlementOrderInput {
  id: number;
  orderNumber?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  orderDate: string;
  expectedDelivery?: string | null;
  status: string;
  subtotal?: string | number | null;
  taxRate?: string | number | null;
  taxAmount?: string | number | null;
  shippingFee?: string | number | null;
  total: string | number | null;
}

export interface WholesaleSettlementSummaryRow {
  customerId: number;
  customerName: string;
  orderCount: number;
  totalAmount: number;
  receivedAmount: number;
  receivableAmount: number;
  paymentStatus: WholesalePaymentStatus;
}

export function buildCustomerLookupMaps(customers: WholesaleCustomerRef[]) {
  const customerById = new Map<number, string>();
  const customerByNormName = new Map<string, WholesaleCustomerRef>();
  for (const c of customers) {
    const cleanName = (c.companyName ?? "").trim();
    if (!cleanName) continue;
    customerById.set(c.id, cleanName);
    const norm = normalizeWholesaleCompanyName(cleanName);
    if (norm && !customerByNormName.has(norm)) {
      customerByNormName.set(norm, { id: c.id, companyName: cleanName });
    }
  }
  return { customerById, customerByNormName };
}

export function resolveOrderCompanyIdentity(
  order: { customerId?: number | null; customerName?: string | null },
  customerById: Map<number, string>,
  customerByNormName: Map<string, WholesaleCustomerRef>,
): { groupKey: string; customerId: number; customerName: string } {
  const rawName = (order.customerName ?? "").trim();
  const normOrderName = normalizeWholesaleCompanyName(rawName);
  const rawId = order.customerId != null && order.customerId > 0 ? order.customerId : 0;

  if (rawId > 0) {
    const linkedName = customerById.get(rawId);
    if (rawName && linkedName && normOrderName !== normalizeWholesaleCompanyName(linkedName)) {
      const matchedByName = customerByNormName.get(normOrderName);
      if (matchedByName) {
        return {
          groupKey: `id:${matchedByName.id}`,
          customerId: matchedByName.id,
          customerName: matchedByName.companyName,
        };
      }
      return {
        groupKey: `name:${normOrderName}`,
        customerId: 0,
        customerName: rawName,
      };
    }
    return {
      groupKey: `id:${rawId}`,
      customerId: rawId,
      customerName: rawName || linkedName || "未知客戶",
    };
  }

  if (normOrderName && normOrderName !== normalizeWholesaleCompanyName("未知客戶")) {
    const matched = customerByNormName.get(normOrderName);
    if (matched) {
      return {
        groupKey: `id:${matched.id}`,
        customerId: matched.id,
        customerName: rawName || matched.companyName,
      };
    }
    return {
      groupKey: `name:${normOrderName}`,
      customerId: 0,
      customerName: rawName,
    };
  }

  return {
    groupKey: "name:__unknown__",
    customerId: 0,
    customerName: "未知客戶",
  };
}

export function isOrderInSettlementRange(
  order: Pick<WholesaleSettlementOrderInput, "orderDate" | "status">,
  from: string,
  to: string,
): boolean {
  const status = (order.status ?? "").trim();
  if (status !== WHOLESALE_SETTLEMENT_ACTIVE_STATUS) return false;
  const d = (order.orderDate ?? "").trim();
  if (!d) return false;
  return d >= from && d <= to;
}

export function explainOrderSettlementEligibility(
  order: WholesaleSettlementOrderInput,
  from: string,
  to: string,
): { included: boolean; reason: string } {
  const status = (order.status ?? "").trim();
  const orderDate = (order.orderDate ?? "").trim();
  if (status !== WHOLESALE_SETTLEMENT_ACTIVE_STATUS) {
    return {
      included: false,
      reason: `出貨狀態為「${status || "未設定"}」，尚未標記為「已出貨」`,
    };
  }
  if (!orderDate) {
    return {
      included: false,
      reason: "缺少訂單日期（orderDate）",
    };
  }
  if (orderDate < from || orderDate > to) {
    const expHint = order.expectedDelivery
      ? `（預計交貨日為 ${order.expectedDelivery}，但月結以訂單日期 orderDate 為準）`
      : "";
    return {
      included: false,
      reason: `訂單日期 ${orderDate} 不在查詢區間 ${from} ～ ${to} 內${expHint}`,
    };
  }
  return {
    included: true,
    reason: `訂單日期 ${orderDate} 在查詢區間 ${from} ～ ${to} 內，且狀態為「已出貨」`,
  };
}

export function aggregateWholesaleSettlementSummary(
  orders: WholesaleSettlementOrderInput[],
  receivedByOrderId: Map<number, number>,
  customers: WholesaleCustomerRef[] = [],
  dateRange?: { from: string; to: string },
): WholesaleSettlementSummaryRow[] {
  const { customerById, customerByNormName } = buildCustomerLookupMaps(customers);
  const byGroup = new Map<
    string,
    {
      customerId: number;
      customerName: string;
      orderCount: number;
      totalAmount: number;
      receivedAmount: number;
    }
  >();

  for (const order of orders) {
    if (dateRange && !isOrderInSettlementRange(order, dateRange.from, dateRange.to)) {
      continue;
    }
    const identity = resolveOrderCompanyIdentity(order, customerById, customerByNormName);
    const existing = byGroup.get(identity.groupKey) ?? {
      customerId: identity.customerId,
      customerName: identity.customerName,
      orderCount: 0,
      totalAmount: 0,
      receivedAmount: 0,
    };
    existing.orderCount += 1;
    existing.totalAmount = parseMoney(existing.totalAmount + parseMoney(order.total));
    existing.receivedAmount = parseMoney(existing.receivedAmount + parseMoney(receivedByOrderId.get(order.id) ?? 0));
    if (existing.customerId === 0 && identity.customerId > 0) {
      existing.customerId = identity.customerId;
    }
    if ((!existing.customerName || existing.customerName === "未知客戶") && identity.customerName) {
      existing.customerName = identity.customerName;
    }
    byGroup.set(identity.groupKey, existing);
  }

  return [...byGroup.values()]
    .map((row) => {
      const receivableAmount = remainingAmount(row.totalAmount, row.receivedAmount);
      return {
        customerId: row.customerId,
        customerName: row.customerName,
        orderCount: row.orderCount,
        totalAmount: row.totalAmount,
        receivedAmount: row.receivedAmount,
        receivableAmount,
        paymentStatus: deriveWholesalePaymentStatus(row.receivedAmount, row.totalAmount),
      };
    })
    .sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      return a.customerName.localeCompare(b.customerName, "zh-TW");
    });
}

export function doesOrderMatchSettlementCustomer(
  order: { customerId?: number | null; customerName?: string | null },
  targetCustomerId: number,
  targetCustomerName: string | undefined,
  customers: WholesaleCustomerRef[] = [],
): boolean {
  const { customerById, customerByNormName } = buildCustomerLookupMaps(customers);
  const identity = resolveOrderCompanyIdentity(order, customerById, customerByNormName);
  const normTargetName = normalizeWholesaleCompanyName(targetCustomerName);

  if (targetCustomerId > 0) {
    if (identity.customerId === targetCustomerId) {
      if (normTargetName && normalizeWholesaleCompanyName(identity.customerName) !== normTargetName) {
        return false;
      }
      return true;
    }
    return false;
  }

  if (normTargetName) {
    return normalizeWholesaleCompanyName(identity.customerName) === normTargetName;
  }
  return identity.customerId === 0;
}

export function computeStatementTotalsFromOrders(
  orders: Array<{
    subtotal?: string | number | null;
    taxAmount?: string | number | null;
    shippingFee?: string | number | null;
    total?: string | number | null;
    orderAmount?: number | null;
    receivedAmount?: string | number | null;
  }>,
): {
  subtotal: number;
  taxAmount: number;
  shippingFee: number;
  total: number;
  receivedAmount: number;
  receivableAmount: number;
} {
  let subtotal = 0;
  let taxAmount = 0;
  let shippingFee = 0;
  let total = 0;
  let receivedAmount = 0;

  for (const o of orders) {
    const orderTotal = parseMoney(o.orderAmount ?? o.total);
    const orderTax = parseMoney(o.taxAmount ?? 0);
    const orderShipping = parseMoney(o.shippingFee ?? 0);
    const orderSub = o.subtotal != null ? parseMoney(o.subtotal) : parseMoney(orderTotal - orderTax - orderShipping);
    const orderReceived = parseMoney(o.receivedAmount ?? 0);

    subtotal = parseMoney(subtotal + orderSub);
    taxAmount = parseMoney(taxAmount + orderTax);
    shippingFee = parseMoney(shippingFee + orderShipping);
    total = parseMoney(total + orderTotal);
    receivedAmount = parseMoney(receivedAmount + orderReceived);
  }

  return {
    subtotal,
    taxAmount,
    shippingFee,
    total,
    receivedAmount,
    receivableAmount: remainingAmount(total, receivedAmount),
  };
}
