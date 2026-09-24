import { customFetch } from "../../../shared/api-client/custom-fetch.ts";

export type WholesaleCompanyStatus = "未結帳" | "部分收款" | "已結清";
export type WholesaleOrderPayStatus = "未收款" | "部分收款" | "已結清";

export type CustomerSummary = {
  customerId: number | null;
  customerName: string;
  unbound: boolean;
  orderCount: number;
  monthlySales: number;
  monthlyPaid: number;
  monthlyOutstanding: number;
  previousOutstanding: number;
  totalOutstanding: number;
  lastOrderDate: string | null;
  salesUser: string | null;
  salesUserId: number | null;
  paymentTerms: string | null;
  dueDate: string | null;
  status: WholesaleCompanyStatus;
};

export type CustomerMonthOrder = {
  orderId: number;
  orderDate: string;
  orderNumber: string | null;
  itemSummary: string;
  qty: number;
  orderTotal: number;
  paidAmount: number;
  remainingAmount: number;
  payStatus: WholesaleOrderPayStatus;
  status: string;
  unbound: boolean;
};

export type CustomerOrdersPayload = {
  customer: any | null;
  summary: CustomerSummary | null;
  orders: CustomerMonthOrder[];
};

export type StatementLine = {
  orderDate: string;
  orderNumber: string | null;
  productName: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

export type CustomerStatement = {
  month: string;
  monthLabel: string;
  from: string;
  to: string;
  customer: {
    id: number;
    companyName: string;
    taxId: string | null;
    contactPerson: string | null;
    phone: string | null;
    address: string | null;
    billingCompanyName: string | null;
    billingTaxId: string | null;
    billingAddress: string | null;
    invoiceEmail: string | null;
    paymentTerms: string | null;
    salesUser: string | null;
  };
  previousOutstanding: number;
  monthlySales: number;
  monthlyPaid: number;
  totalOutstanding: number;
  orderCount: number;
  orders: CustomerMonthOrder[];
  lines: StatementLine[];
};

export function fetchCustomerSummary(params: { month: string; search?: string; salesUser?: string }) {
  const qs = new URLSearchParams({ month: params.month });
  if (params.search) qs.set("search", params.search);
  if (params.salesUser && params.salesUser !== "全部業務") qs.set("salesUser", params.salesUser);
  return customFetch<CustomerSummary[]>(`/api/wholesale/customers/summary?${qs.toString()}`);
}

export function fetchCustomerOrders(customerId: number | "unbound", month: string) {
  return customFetch<CustomerOrdersPayload>(`/api/wholesale/customers/${customerId}/orders?month=${month}`);
}

export function fetchCustomerStatement(customerId: number, month: string) {
  return customFetch<CustomerStatement>(`/api/wholesale/customers/${customerId}/statement?month=${month}`);
}

export function fetchWholesaleSalesOptions() {
  return customFetch<{ id: number | null; name: string }[]>("/api/wholesale/customers/sales-options");
}

export function createWholesaleAccountPayment(body: {
  customerId: number;
  paymentDate: string;
  amount: number;
  paymentMethod?: string;
  note?: string;
  allocations: { orderId: number; allocatedAmount: number }[];
}) {
  return customFetch("/api/wholesale/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchCustomerPayments(customerId: number) {
  return customFetch<any[]>(`/api/wholesale/payments?customerId=${customerId}`);
}

export function fetchUnpaidOrders(customerId: number) {
  return customFetch<CustomerMonthOrder[]>(`/api/wholesale/customers/${customerId}/unpaid-orders`);
}

export function fmtTwd(n: number | string | null | undefined) {
  const num = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  if (!Number.isFinite(num)) return "NT$ 0";
  return `NT$ ${Math.round(num).toLocaleString()}`;
}

export function fmtDateSlash(d: string | null | undefined) {
  if (!d) return "—";
  return String(d).slice(0, 10).replace(/-/g, "/");
}

export function errMessage(err: unknown, fallback = "操作失敗") {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
