import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { db, wholesaleOrdersTable, wholesaleReceivablesTable, wholesaleCustomersTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const ROLES = ["super_admin", "owner", "admin", "sales", "accountant"] as const;

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

const ACTIVE_STATUSES = ["已確認", "備貨中", "部分出貨", "已出貨", "已完成"];

// GET /wholesale/settlements/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// 按客戶統計日期區間的訂單總金額
router.get("/wholesale/settlements/summary", requireRole(...ROLES), async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

  const conditions = [
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    inArray(wholesaleOrdersTable.status, ACTIVE_STATUSES),
  ];

  // Group by customer
  const rows = await db
    .select({
      customerId: wholesaleOrdersTable.customerId,
      customerName: wholesaleOrdersTable.customerName,
      orderCount: sql<number>`count(*)::int`,
      totalAmount: sql<number>`coalesce(sum(${wholesaleOrdersTable.total}), 0)::float`,
    })
    .from(wholesaleOrdersTable)
    .where(and(...conditions))
    .groupBy(wholesaleOrdersTable.customerId, wholesaleOrdersTable.customerName)
    .orderBy(desc(sql`sum(${wholesaleOrdersTable.total})`));

  // Fetch all receivables in date range for the same customers
  const customerIds = rows.map((r) => r.customerId).filter(Boolean) as number[];
  let receivableMap = new Map<number, { totalAmount: number; receivedAmount: number }>();

  if (customerIds.length > 0) {
    const receivables = await db
      .select({
        customerId: wholesaleReceivablesTable.customerId,
        totalAmount: wholesaleReceivablesTable.totalAmount,
        receivedAmount: wholesaleReceivablesTable.receivedAmount,
      })
      .from(wholesaleReceivablesTable)
      .where(inArray(wholesaleReceivablesTable.customerId, customerIds));

    for (const r of receivables) {
      if (!r.customerId) continue;
      const existing = receivableMap.get(r.customerId);
      const total = parseFloat(r.totalAmount ?? "0");
      const received = parseFloat(r.receivedAmount ?? "0");
      if (existing) {
        existing.totalAmount += total;
        existing.receivedAmount += received;
      } else {
        receivableMap.set(r.customerId, { totalAmount: total, receivedAmount: received });
      }
    }
  }

  const result = rows.map((r) => {
    const cid = r.customerId ?? 0;
    const rec = receivableMap.get(cid) ?? { totalAmount: 0, receivedAmount: 0 };
    return {
      customerId: cid,
      customerName: r.customerName ?? "未知客戶",
      orderCount: r.orderCount,
      totalAmount: r.totalAmount,
      receivableAmount: rec.totalAmount - rec.receivedAmount,
      receivedAmount: rec.receivedAmount,
    };
  });

  res.json(result);
});

// GET /wholesale/settlements/:customerId?from=&to=
// 單一客戶的訂單明細
router.get("/wholesale/settlements/:customerId", requireRole(...ROLES), async (req, res): Promise<void> => {
  const customerId = parseId(req.params.customerId);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customerId" }); return; }

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

  const conditions = [
    eq(wholesaleOrdersTable.customerId, customerId),
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    inArray(wholesaleOrdersTable.status, ACTIVE_STATUSES),
  ];

  const rows = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(and(...conditions))
    .orderBy(desc(wholesaleOrdersTable.orderDate));

  res.json(rows.map((r) => ({ ...r, items: [] })));
});

export default router;
