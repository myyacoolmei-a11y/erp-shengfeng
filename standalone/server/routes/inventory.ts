import { Router, type IRouter } from "express";
import { eq, and, ilike, desc, sql, inArray, SQL } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  inventoryTransactionsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireRole, requireFeature } from "../lib/auth";
import {
  INVENTORY_STATUSES,
  INVENTORY_TX_REASONS,
} from "../../shared/inventoryConstants";

const router: IRouter = Router();
router.use(requireFeature("inventory"));

const READ_ROLES = ["super_admin", "owner", "admin"] as const;
const WRITE_ROLES = ["super_admin", "owner", "admin"] as const;

const ItemInput = z.object({
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  itemName: z.string().min(1, "品項名稱必填"),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  warehouseLocation: z.string().optional().nullable(),
  status: z.enum(INVENTORY_STATUSES).optional(),
  costPrice: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.union([z.coerce.string(), z.null()]).optional(),
  ),
  notes: z.string().optional().nullable(),
});

const UpdateItemInput = ItemInput.partial().refine(
  (data) => !("quantity" in data) && !("stockQty" in data),
  { message: "數量不可直接修改，請使用庫存異動" },
);

const TxInput = z.object({
  reason: z.enum(INVENTORY_TX_REASONS),
  quantityChange: z.coerce.number().int().refine((n) => n !== 0, "異動數量不可為 0"),
  notes: z.string().optional().nullable(),
});

async function qtyMapForIds(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      inventoryItemId: inventoryTransactionsTable.inventoryItemId,
      qty: sql<number>`coalesce(sum(${inventoryTransactionsTable.quantityChange}), 0)::int`,
    })
    .from(inventoryTransactionsTable)
    .where(inArray(inventoryTransactionsTable.inventoryItemId, ids))
    .groupBy(inventoryTransactionsTable.inventoryItemId);
  for (const r of rows) map.set(r.inventoryItemId, Number(r.qty) || 0);
  for (const id of ids) if (!map.has(id)) map.set(id, 0);
  return map;
}

function serializeItem(item: typeof inventoryItemsTable.$inferSelect, quantity: number) {
  return { ...item, quantity };
}

router.get("/inventory-items", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const brand = typeof req.query.brand === "string" ? req.query.brand.trim() : "";
  const model = typeof req.query.model === "string" ? req.query.model.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const warehouse = typeof req.query.warehouse === "string" ? req.query.warehouse.trim() : "";

  const conditions: SQL[] = [];
  if (brand) conditions.push(ilike(inventoryItemsTable.brand, `%${brand}%`));
  if (model) conditions.push(ilike(inventoryItemsTable.model, `%${model}%`));
  if (status && (INVENTORY_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(inventoryItemsTable.status, status));
  }
  if (warehouse) conditions.push(ilike(inventoryItemsTable.warehouseLocation, `%${warehouse}%`));

  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(inventoryItemsTable.updatedAt));

  const qty = await qtyMapForIds(items.map((i) => i.id));
  res.json(items.map((i) => serializeItem(i, qty.get(i.id) ?? 0)));
});

router.get("/inventory-items/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "無效的 ID" });
    return;
  }
  const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "找不到庫存品項" });
    return;
  }
  const qty = await qtyMapForIds([id]);
  res.json(serializeItem(item, qty.get(id) ?? 0));
});

router.post("/inventory-items", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = ItemInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" });
    return;
  }
  const d = parsed.data;
  const [created] = await db
    .insert(inventoryItemsTable)
    .values({
      brand: d.brand || null,
      category: d.category || null,
      itemName: d.itemName,
      model: d.model || null,
      serialNumber: d.serialNumber || null,
      unit: d.unit || "台",
      warehouseLocation: d.warehouseLocation || null,
      status: d.status || "庫存中",
      costPrice: d.costPrice ?? null,
      notes: d.notes || null,
    })
    .returning();
  res.status(201).json(serializeItem(created, 0));
});

router.patch("/inventory-items/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "無效的 ID" });
    return;
  }
  if ("quantity" in (req.body ?? {}) || "stockQty" in (req.body ?? {}) || "quantityChange" in (req.body ?? {})) {
    res.status(400).json({ error: "數量不可直接修改，請使用庫存異動" });
    return;
  }
  const parsed = UpdateItemInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" });
    return;
  }
  const d = parsed.data;
  const patch: Partial<typeof inventoryItemsTable.$inferInsert> = {};
  if (d.brand !== undefined) patch.brand = d.brand || null;
  if (d.category !== undefined) patch.category = d.category || null;
  if (d.itemName !== undefined) patch.itemName = d.itemName;
  if (d.model !== undefined) patch.model = d.model || null;
  if (d.serialNumber !== undefined) patch.serialNumber = d.serialNumber || null;
  if (d.unit !== undefined) patch.unit = d.unit || "台";
  if (d.warehouseLocation !== undefined) patch.warehouseLocation = d.warehouseLocation || null;
  if (d.status !== undefined) patch.status = d.status;
  if (d.costPrice !== undefined) patch.costPrice = d.costPrice;
  if (d.notes !== undefined) patch.notes = d.notes || null;

  const [updated] = await db
    .update(inventoryItemsTable)
    .set(patch)
    .where(eq(inventoryItemsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "找不到庫存品項" });
    return;
  }
  const qty = await qtyMapForIds([id]);
  res.json(serializeItem(updated, qty.get(id) ?? 0));
});

router.delete("/inventory-items/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "無效的 ID" });
    return;
  }
  const [deleted] = await db
    .delete(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "找不到庫存品項" });
    return;
  }
  res.status(204).send();
});

router.get(
  "/inventory-items/:id/transactions",
  requireRole(...READ_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "無效的 ID" });
      return;
    }
    const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
    if (!item) {
      res.status(404).json({ error: "找不到庫存品項" });
      return;
    }
    const rows = await db
      .select()
      .from(inventoryTransactionsTable)
      .where(eq(inventoryTransactionsTable.inventoryItemId, id))
      .orderBy(desc(inventoryTransactionsTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/inventory-items/:id/transactions",
  requireRole(...WRITE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "無效的 ID" });
      return;
    }
    const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
    if (!item) {
      res.status(404).json({ error: "找不到庫存品項" });
      return;
    }
    const parsed = TxInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" });
      return;
    }

    const qtyMap = await qtyMapForIds([id]);
    const currentQty = qtyMap.get(id) ?? 0;
    const nextQty = currentQty + parsed.data.quantityChange;
    if (nextQty < 0) {
      res.status(400).json({
        error: `異動後數量不可為負（目前 ${currentQty}，異動 ${parsed.data.quantityChange}）`,
      });
      return;
    }

    const userId = (req as any).user?.id as number | undefined;
    const [created] = await db
      .insert(inventoryTransactionsTable)
      .values({
        inventoryItemId: id,
        reason: parsed.data.reason,
        quantityChange: parsed.data.quantityChange,
        notes: parsed.data.notes || null,
        createdBy: userId ?? null,
      })
      .returning();

    // Touch updatedAt on item
    await db
      .update(inventoryItemsTable)
      .set({ updatedAt: new Date() })
      .where(eq(inventoryItemsTable.id, id));

    res.status(201).json({
      transaction: created,
      quantity: nextQty,
      item: serializeItem(item, nextQty),
    });
  },
);

export default router;
