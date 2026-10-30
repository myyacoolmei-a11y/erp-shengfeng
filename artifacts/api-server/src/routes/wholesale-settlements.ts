import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { db, wholesaleOrdersTable, wholesaleOrderItemsTable, wholesaleReceivablesTable, productsTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const ROLES = ["super_admin", "owner", "admin", "sales", "accountant"] as const;

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

const ACTIVE_STATUSES = ["已出貨"];

// GET /wholesale/settlements/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
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

  // Only receivables tied to orders in this date range belong to this settlement.
  // Customer-wide historical receivables must never be mixed into a monthly statement.
  const selectedOrders = await db.select({
    id: wholesaleOrdersTable.id,
    customerId: wholesaleOrdersTable.customerId,
    total: wholesaleOrdersTable.total,
  }).from(wholesaleOrdersTable).where(and(...conditions));
  const orderIds = selectedOrders.map(o => o.id);
  const receivedByOrder = new Map<number, number>();
  if (orderIds.length) {
    const receivables = await db.select({
      orderId: wholesaleReceivablesTable.orderId,
      receivedAmount: wholesaleReceivablesTable.receivedAmount,
    }).from(wholesaleReceivablesTable).where(inArray(wholesaleReceivablesTable.orderId, orderIds));
    for (const rec of receivables) {
      if (rec.orderId == null) continue;
      receivedByOrder.set(rec.orderId, (receivedByOrder.get(rec.orderId) ?? 0) + Number(rec.receivedAmount ?? 0));
    }
  }
  const receivedByCustomer = new Map<number, number>();
  for (const order of selectedOrders) {
    const cid = order.customerId ?? 0;
    receivedByCustomer.set(cid, (receivedByCustomer.get(cid) ?? 0) + (receivedByOrder.get(order.id) ?? 0));
  }
  const result = rows.map(r => {
    const cid = r.customerId ?? 0;
    const received = receivedByCustomer.get(cid) ?? 0;
    const amount = Number(r.totalAmount ?? 0);
    return {
      customerId: cid,
      customerName: r.customerName ?? "未知客戶",
      orderCount: r.orderCount,
      totalAmount: amount,
      receivableAmount: amount - received,
      receivedAmount: received,
    };
  });

  res.json(result);
});

// GET /wholesale/settlements/:customerId?from=&to=
// Returns orders WITH items (including product spec) for item-level detail
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
    gte(wholesaleOrdersTable.orderDate, from),
    lte(wholesaleOrdersTable.orderDate, to),
    inArray(wholesaleOrdersTable.status, ACTIVE_STATUSES),
  ];

  if (customerId === 0) {
    conditions.push(sql`${wholesaleOrdersTable.customerId} IS NULL`);
  } else {
    conditions.push(eq(wholesaleOrdersTable.customerId, customerId));
  }

  const rows = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(and(...conditions))
    .orderBy(wholesaleOrdersTable.orderDate, wholesaleOrdersTable.id);

  // Fetch items for each order, joining products to get spec
  const ordersWithItems = await Promise.all(
    rows.map(async (order) => {
      const items = await db
        .select({
          id: wholesaleOrderItemsTable.id,
          orderId: wholesaleOrderItemsTable.orderId,
          productId: wholesaleOrderItemsTable.productId,
          productName: wholesaleOrderItemsTable.productName,
          brand: wholesaleOrderItemsTable.brand,
          model: wholesaleOrderItemsTable.model,
          unit: wholesaleOrderItemsTable.unit,
          qty: wholesaleOrderItemsTable.qty,
          unitPrice: wholesaleOrderItemsTable.unitPrice,
          discount: wholesaleOrderItemsTable.discount,
          amount: wholesaleOrderItemsTable.amount,
          sortOrder: wholesaleOrderItemsTable.sortOrder,
          spec: productsTable.spec,
        })
        .from(wholesaleOrderItemsTable)
        .leftJoin(productsTable, eq(wholesaleOrderItemsTable.productId, productsTable.id))
        .where(eq(wholesaleOrderItemsTable.orderId, order.id))
        .orderBy(wholesaleOrderItemsTable.sortOrder);
      return { ...order, items };
    })
  );

  res.json(ordersWithItems);
});

export default router;
