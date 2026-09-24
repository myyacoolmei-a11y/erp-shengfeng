import { pool } from "@workspace/db";
import type { JwtPayload } from "../auth";
import { shouldApplyOwnDataFilter } from "../../../shared/userPermissions.ts";
import {
  companyStatus,
  dueDateFromTerms,
  monthRange,
  orderPayStatus,
  round2,
  type WholesaleCompanyStatus,
  type WholesaleOrderPayStatus,
} from "../../../shared/wholesaleAccount.ts";

export interface CustomerSummaryRow {
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
}

export interface CustomerMonthOrderRow {
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
}

function named(sql: string, values: Record<string, unknown>): { text: string; values: unknown[] } {
  const keys = Object.keys(values).sort((a, b) => b.length - a.length);
  const out: unknown[] = [];
  let text = sql;
  keys.forEach((key) => {
    const idx = `$${out.length + 1}`;
    text = text.split(`$${key}`).join(idx);
    out.push(values[key]);
  });
  return { text, values: out };
}

export async function listCustomerSummaries(opts: {
  month: string;
  search?: string;
  salesUser?: string;
  user?: JwtPayload;
}): Promise<CustomerSummaryRow[]> {
  const { start, end } = monthRange(opts.month);
  const search = opts.search?.trim() ?? "";
  const salesUser = opts.salesUser?.trim() && opts.salesUser !== "全部業務" ? opts.salesUser.trim() : "";
  const own = opts.user && shouldApplyOwnDataFilter(opts.user) ? opts.user : null;

  const sql = `
    WITH bounds AS (
      SELECT $start::date AS month_start, $end::date AS month_end
    ),
    paid AS (
      SELECT
        a.order_id,
        COALESCE(SUM(a.allocated_amount::numeric), 0) AS paid_all,
        COALESCE(SUM(a.allocated_amount::numeric) FILTER (
          WHERE p.payment_date < (SELECT month_start FROM bounds)
        ), 0) AS paid_before
      FROM wholesale_payment_allocations a
      JOIN wholesale_payments p ON p.id = a.payment_id
      GROUP BY a.order_id
    ),
    month_pay AS (
      SELECT customer_id, COALESCE(SUM(amount::numeric), 0) AS paid_in_month
      FROM wholesale_payments
      WHERE payment_date >= (SELECT month_start FROM bounds)
        AND payment_date <= (SELECT month_end FROM bounds)
      GROUP BY customer_id
    ),
    customers AS (
      SELECT
        c.id,
        c.company_name,
        c.payment_terms,
        c.sales_user_id,
        u.display_name AS sales_user_name
      FROM wholesale_customers c
      LEFT JOIN users u ON u.id = c.sales_user_id
    ),
    grouped AS (
      SELECT
        o.customer_id AS customer_id,
        CASE
          WHEN o.customer_id IS NULL THEN '未綁定批發客戶'
          ELSE COALESCE(c.company_name, NULLIF(MAX(o.customer_name), ''), '未綁定批發客戶')
        END AS customer_name,
        BOOL_OR(o.customer_id IS NULL) AS unbound,
        COUNT(*) FILTER (
          WHERE o.order_date >= (SELECT month_start FROM bounds)
            AND o.order_date <= (SELECT month_end FROM bounds)
        )::int AS order_count,
        COALESCE(SUM(o.total::numeric) FILTER (
          WHERE o.order_date >= (SELECT month_start FROM bounds)
            AND o.order_date <= (SELECT month_end FROM bounds)
        ), 0) AS monthly_sales,
        COALESCE(SUM(COALESCE(paid.paid_all, 0)) FILTER (
          WHERE o.order_date >= (SELECT month_start FROM bounds)
            AND o.order_date <= (SELECT month_end FROM bounds)
        ), 0) AS monthly_order_paid,
        COALESCE(SUM(
          GREATEST(o.total::numeric - COALESCE(paid.paid_before, 0), 0)
        ) FILTER (WHERE o.order_date < (SELECT month_start FROM bounds)), 0) AS previous_outstanding,
        MAX(o.order_date) FILTER (
          WHERE o.order_date >= (SELECT month_start FROM bounds)
            AND o.order_date <= (SELECT month_end FROM bounds)
        ) AS last_order_date,
        MAX(o.order_date) AS last_order_any,
        MAX(NULLIF(o.salesperson, '')) AS salesperson,
        MAX(c.payment_terms) AS payment_terms,
        MAX(c.sales_user_id) AS sales_user_id,
        MAX(c.sales_user_name) AS sales_user_name
      FROM wholesale_orders o
      LEFT JOIN paid ON paid.order_id = o.id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE COALESCE(o.status, '') NOT IN ('草稿', '已取消')
      GROUP BY o.customer_id, c.company_name
    )
    SELECT
      g.customer_id,
      g.customer_name,
      g.unbound,
      g.order_count,
      g.monthly_sales,
      g.monthly_order_paid,
      GREATEST(g.monthly_sales - g.monthly_order_paid, 0) AS monthly_outstanding,
      g.previous_outstanding,
      COALESCE(mp.paid_in_month, 0) AS monthly_paid,
      g.previous_outstanding + g.monthly_sales - COALESCE(mp.paid_in_month, 0) AS total_outstanding,
      COALESCE(g.last_order_date, g.last_order_any) AS last_order_date,
      COALESCE(g.sales_user_name, g.salesperson) AS sales_user,
      g.sales_user_id,
      g.payment_terms
    FROM grouped g
    LEFT JOIN month_pay mp ON mp.customer_id = g.customer_id
    WHERE (
        g.order_count > 0
        OR g.previous_outstanding > 0.009
        OR COALESCE(mp.paid_in_month, 0) > 0.009
      )
      ${search ? "AND g.customer_name ILIKE $search" : ""}
      ${salesUser ? "AND COALESCE(g.sales_user_name, g.salesperson, '') = $salesUser" : ""}
      ${own ? "AND (g.sales_user_id = $ownId OR COALESCE(g.salesperson, '') = $ownName OR COALESCE(g.sales_user_name, '') = $ownName)" : ""}
    ORDER BY g.customer_name ASC NULLS LAST
  `;

  const { text, values } = named(sql, {
    start,
    end,
    ...(search ? { search: `%${search}%` } : {}),
    ...(salesUser ? { salesUser } : {}),
    ...(own ? { ownId: own.id, ownName: own.displayName } : {}),
  });

  const { rows } = await pool.query(text, values);
  return rows.map((r: any) => {
    const previousOutstanding = round2(Number(r.previous_outstanding ?? 0));
    const monthlySales = round2(Number(r.monthly_sales ?? 0));
    const monthlyPaid = round2(Number(r.monthly_paid ?? 0));
    const monthlyOrderPaid = round2(Number(r.monthly_order_paid ?? 0));
    const totalOutstanding = round2(Number(r.total_outstanding ?? previousOutstanding + monthlySales - monthlyPaid));
    const terms = r.payment_terms ?? null;
    return {
      customerId: r.customer_id == null ? null : Number(r.customer_id),
      customerName: r.customer_name || "未綁定批發客戶",
      unbound: Boolean(r.unbound) || r.customer_id == null,
      orderCount: Number(r.order_count ?? 0),
      monthlySales,
      monthlyPaid,
      monthlyOutstanding: round2(Number(r.monthly_outstanding ?? Math.max(monthlySales - monthlyOrderPaid, 0))),
      previousOutstanding,
      totalOutstanding,
      lastOrderDate: r.last_order_date ?? null,
      salesUser: r.sales_user ?? null,
      salesUserId: r.sales_user_id == null ? null : Number(r.sales_user_id),
      paymentTerms: terms,
      dueDate: dueDateFromTerms(end, terms),
      status: companyStatus(totalOutstanding, monthlyPaid > 0 || monthlyOrderPaid > 0),
    };
  });
}

export async function listCustomerMonthOrders(opts: {
  customerId: number | null;
  month: string;
  user?: JwtPayload;
}): Promise<{
  customer: Record<string, unknown> | null;
  summary: CustomerSummaryRow | null;
  orders: CustomerMonthOrderRow[];
}> {
  const { start, end } = monthRange(opts.month);
  const summaries = await listCustomerSummaries({ month: opts.month, user: opts.user });
  const summary = summaries.find((s) =>
    opts.customerId == null ? s.customerId == null : s.customerId === opts.customerId,
  ) ?? null;

  let customer: Record<string, unknown> | null = null;
  if (opts.customerId != null) {
    const { rows } = await pool.query(
      `SELECT c.*, u.display_name AS sales_user_name
       FROM wholesale_customers c
       LEFT JOIN users u ON u.id = c.sales_user_id
       WHERE c.id = $1`,
      [opts.customerId],
    );
    customer = rows[0] ?? null;
    if (customer && opts.user && shouldApplyOwnDataFilter(opts.user)) {
      const name = opts.user?.displayName ?? "";
      if (customer.sales_user_id !== opts.user?.id && customer.sales_user_name !== name) {
        const owned = await pool.query(
          `SELECT 1 FROM wholesale_orders WHERE customer_id = $1 AND salesperson = $2 LIMIT 1`,
          [opts.customerId, name],
        );
        if (!owned.rowCount) {
          return { customer: null, summary: null, orders: [] };
        }
      }
    }
  }

  const params: unknown[] = [start, end];
  const idClause = opts.customerId == null
    ? "o.customer_id IS NULL"
    : (params.push(opts.customerId), "o.customer_id = $3");

  const { rows } = await pool.query(
    `
    SELECT
      o.id,
      o.order_date,
      o.order_number,
      o.total,
      o.status,
      o.customer_id,
      COALESCE(SUM(a.allocated_amount::numeric), 0) AS paid_amount,
      COALESCE(SUM(i.qty), 0)::int AS qty,
      (
        SELECT string_agg(
          CASE WHEN it.qty > 1 THEN it.product_name || ' ×' || it.qty ELSE it.product_name END,
          '、' ORDER BY it.sort_order
        )
        FROM wholesale_order_items it WHERE it.order_id = o.id
      ) AS item_summary
    FROM wholesale_orders o
    LEFT JOIN wholesale_payment_allocations a ON a.order_id = o.id
    LEFT JOIN wholesale_order_items i ON i.order_id = o.id
    WHERE ${idClause}
      AND o.order_date >= $1 AND o.order_date <= $2
      AND COALESCE(o.status, '') NOT IN ('草稿', '已取消')
    GROUP BY o.id
    ORDER BY o.order_date ASC, o.id ASC
    `,
    params,
  );

  const orders: CustomerMonthOrderRow[] = rows.map((r: any) => {
    const orderTotal = round2(Number(r.total ?? 0));
    const paidAmount = round2(Number(r.paid_amount ?? 0));
    const remainingAmount = round2(Math.max(orderTotal - paidAmount, 0));
    return {
      orderId: Number(r.id),
      orderDate: r.order_date,
      orderNumber: r.order_number,
      itemSummary: r.item_summary || "—",
      qty: Number(r.qty ?? 0),
      orderTotal,
      paidAmount,
      remainingAmount,
      payStatus: orderPayStatus(paidAmount, remainingAmount),
      status: r.status,
      unbound: r.customer_id == null,
    };
  });

  return { customer, summary, orders };
}

export async function getCustomerStatement(opts: {
  customerId: number;
  month: string;
  user?: JwtPayload;
}) {
  const { start, end, label } = monthRange(opts.month);
  const { customer, summary, orders } = await listCustomerMonthOrders(opts);
  if (!customer) return null;

  const { rows: lines } = await pool.query(
    `
    SELECT
      o.order_date,
      o.order_number,
      i.product_name,
      i.qty,
      i.unit_price,
      i.amount
    FROM wholesale_orders o
    JOIN wholesale_order_items i ON i.order_id = o.id
    WHERE o.customer_id = $1
      AND o.order_date >= $2 AND o.order_date <= $3
      AND COALESCE(o.status, '') NOT IN ('草稿', '已取消')
    ORDER BY o.order_date, o.id, i.sort_order
    `,
    [opts.customerId, start, end],
  );

  return {
    month: opts.month,
    monthLabel: label,
    from: start,
    to: end,
    customer: {
      id: customer.id,
      companyName: customer.company_name,
      taxId: customer.tax_id ?? customer.billing_tax_id,
      contactPerson: customer.contact_person,
      phone: customer.mobile || customer.telephone,
      address: customer.address,
      billingCompanyName: customer.billing_company_name,
      billingTaxId: customer.billing_tax_id,
      billingAddress: customer.billing_address,
      invoiceEmail: customer.invoice_email,
      paymentTerms: customer.payment_terms,
      salesUser: customer.sales_user_name ?? null,
    },
    previousOutstanding: summary?.previousOutstanding ?? 0,
    monthlySales: summary?.monthlySales ?? 0,
    monthlyPaid: summary?.monthlyPaid ?? 0,
    totalOutstanding: summary?.totalOutstanding ?? 0,
    orderCount: summary?.orderCount ?? 0,
    orders,
    lines: lines.map((r: any) => ({
      orderDate: r.order_date,
      orderNumber: r.order_number,
      productName: r.product_name,
      qty: Number(r.qty ?? 0),
      unitPrice: round2(Number(r.unit_price ?? 0)),
      amount: round2(Number(r.amount ?? 0)),
    })),
  };
}

export async function listUnpaidOrders(customerId: number): Promise<CustomerMonthOrderRow[]> {
  const { rows } = await pool.query(
    `
    SELECT
      o.id,
      o.order_date,
      o.order_number,
      o.total,
      o.status,
      o.customer_id,
      COALESCE(SUM(a.allocated_amount::numeric), 0) AS paid_amount,
      COALESCE(SUM(i.qty), 0)::int AS qty,
      (
        SELECT string_agg(
          CASE WHEN it.qty > 1 THEN it.product_name || ' ×' || it.qty ELSE it.product_name END,
          '、' ORDER BY it.sort_order
        )
        FROM wholesale_order_items it WHERE it.order_id = o.id
      ) AS item_summary
    FROM wholesale_orders o
    LEFT JOIN wholesale_payment_allocations a ON a.order_id = o.id
    LEFT JOIN wholesale_order_items i ON i.order_id = o.id
    WHERE o.customer_id = $1
      AND COALESCE(o.status, '') NOT IN ('草稿', '已取消')
    GROUP BY o.id
    HAVING o.total::numeric - COALESCE(SUM(a.allocated_amount::numeric), 0) > 0.009
    ORDER BY o.order_date ASC, o.id ASC
    `,
    [customerId],
  );

  return rows.map((r: any) => {
    const orderTotal = round2(Number(r.total ?? 0));
    const paidAmount = round2(Number(r.paid_amount ?? 0));
    const remainingAmount = round2(Math.max(orderTotal - paidAmount, 0));
    return {
      orderId: Number(r.id),
      orderDate: r.order_date,
      orderNumber: r.order_number,
      itemSummary: r.item_summary || "—",
      qty: Number(r.qty ?? 0),
      orderTotal,
      paidAmount,
      remainingAmount,
      payStatus: orderPayStatus(paidAmount, remainingAmount),
      status: r.status,
      unbound: r.customer_id == null,
    };
  });
}

export async function listSalesOptions(): Promise<{ id: number | null; name: string }[]> {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (name) id, name FROM (
      SELECT u.id, u.display_name AS name
      FROM users u
      WHERE u.is_active = true
        AND (
          u.role = 'sales'
          OR COALESCE(u.roles, ARRAY[]::text[]) && ARRAY['sales']::text[]
          OR COALESCE(u.title, '') ILIKE '%業務%'
        )
      UNION
      SELECT u.id, u.display_name AS name
      FROM wholesale_customers c
      JOIN users u ON u.id = c.sales_user_id
      UNION
      SELECT NULL::int AS id, salesperson AS name
      FROM wholesale_orders
      WHERE salesperson IS NOT NULL AND btrim(salesperson) <> ''
    ) x
    WHERE name IS NOT NULL AND btrim(name) <> ''
    ORDER BY name, id NULLS LAST
  `);
  return rows.map((r: any) => ({ id: r.id == null ? null : Number(r.id), name: r.name }));
}

export async function syncReceivableForOrder(orderId: number): Promise<void> {
  const { rows } = await pool.query(
    `
    SELECT o.id, o.order_number, o.customer_id, o.customer_name, o.total,
      COALESCE((SELECT SUM(allocated_amount::numeric) FROM wholesale_payment_allocations WHERE order_id = o.id), 0) AS paid
    FROM wholesale_orders o
    WHERE o.id = $1
    `,
    [orderId],
  );
  const o = rows[0];
  if (!o) return;
  const total = round2(Number(o.total ?? 0));
  const paid = round2(Number(o.paid ?? 0));
  const remaining = round2(Math.max(total - paid, 0));
  const status = orderPayStatus(paid, remaining);
  const mapped = status === "已結清" ? "已收款" : status === "部分收款" ? "部分收款" : "未收款";
  const existing = await pool.query(`SELECT id FROM wholesale_receivables WHERE order_id = $1`, [orderId]);
  if (existing.rowCount) {
    await pool.query(
      `UPDATE wholesale_receivables
       SET received_amount = $1, payment_status = $2, paid_date = CASE WHEN $3 <= 0 THEN CURRENT_DATE ELSE paid_date END, updated_at = now()
       WHERE order_id = $4`,
      [String(paid), mapped, remaining, orderId],
    );
  }
}
