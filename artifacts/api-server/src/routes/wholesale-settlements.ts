import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { db, wholesaleOrdersTable, wholesaleOrderItemsTable, wholesaleReceivablesTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const ROLES = ["super_admin", "owner", "admin", "sales", "accountant"] as const;

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

const ACTIVE_STATUSES = ["\u5df2\u51fa\u8ca8"];

// GET /wholesale/settlements/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/wholesale/settlements/summary", requireRole(...ROLES), async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "\u9700\u8981 from \u548c to \u53c3\u6578" });
    return;
  }

  const conditions = [
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    inArray(wholesaleOrdersTable.status, ACTIVE_STATUSES),
  ];

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
      customerName: r.customerName ?? "\u672a\u77e5\u5ba2\u6236",
      orderCount: r.orderCount,
      totalAmount: r.totalAmount,
      receivableAmount: rec.totalAmount - rec.receivedAmount,
      receivedAmount: rec.receivedAmount,
    };
  });

  res.json(result);
});

// GET /wholesale/settlements/:customerId?from=&to=
// Returns orders WITH items for item-level detail
router.get("/wholesale/settlements/:customerId", requireRole(...ROLES), async (req, res): Promise<void> => {
  const customerId = parseId(req.params.customerId);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customerId" }); return; }

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!from || !to) {
    res.status(400).json({ error: "\u9700\u8981 from \u548c to \u53c3\u6578" });
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

  // Fetch items for each order
  const ordersWithItems = await Promise.all(
    rows.map(async (order) => {
      const items = await db
        .select()
        .from(wholesaleOrderItemsTable)
        .where(eq(wholesaleOrderItemsTable.orderId, order.id))
        .orderBy(wholesaleOrderItemsTable.sortOrder);
      return { ...order, items };
    })
  );

  res.json(ordersWithItems);
});

export default router;
