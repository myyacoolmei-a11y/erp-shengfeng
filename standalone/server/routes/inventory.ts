import { Router, type IRouter } from "express";
import { eq, and, ilike, desc, sql, inArray, SQL, ne } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  inventoryTransactionsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireFeature } from "../lib/auth";
import { logger } from "../lib/logger";
import {
  INVENTORY_STATUSES,
  INVENTORY_TX_REASONS,
  defaultTxSign,
} from "../../shared/inventoryConstants";

const router: IRouter = Router();
/** 擁有 inventory 功能權限即可查看／新增／編輯／異動（不再依 role 擋行政） */
router.use("/inventory-items", requireFeature("inventory"));

/** 空白字串／純空白 → null；勿把 null 交給 z.coerce.string()（會變成字串 "null"） */
function emptyToNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * 進貨成本：空白／null → null；非法數字 → 驗證失敗。
 * 不可使用 z.coerce.string() 處理 null（會變成 "null" 字串寫入 numeric 造成 500）。
 */
const CostPriceInput = z.any().transform((v, ctx): string | null => {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      ctx.addIssue({ code: "custom", message: "進貨成本格式錯誤" });
      return z.NEVER;
    }
    return v.toFixed(2);
  }
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: "進貨成本格式錯誤" });
    return z.NEVER;
  }
  return n.toFixed(2);
});

const ItemInput = z.object({
  brand: z.preprocess(emptyToNull, z.string().nullable().optional()),
  category: z.preprocess(emptyToNull, z.string().nullable().optional()),
  itemName: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1, "品項名稱必填"),
  ),
  model: z.preprocess(emptyToNull, z.string().nullable().optional()),
  serialNumber: z.preprocess(emptyToNull, z.string().nullable().optional()),
  unit: z.preprocess(emptyToNull, z.string().nullable().optional()),
  warehouseLocation: z.preprocess(emptyToNull, z.string().nullable().optional()),
  status: z.enum(INVENTORY_STATUSES, { error: "庫存狀態無效" }).optional(),
  costPrice: CostPriceInput.optional(),
  notes: z.preprocess(emptyToNull, z.string().nullable().optional()),
  initialQuantity: z.coerce.number().int().min(0).optional(),
  supplier: z.string().trim().max(250).optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

const UpdateItemInput = ItemInput.partial().refine(
  (data) => !("quantity" in data) && !("stockQty" in data),
  { message: "數量不可直接修改，請使用庫存異動" },
);

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505",
  );
}

/** 品牌＋品項＋型號重複檢查（空白品牌／型號視為相同空值） */
async function findDuplicateItem(opts: {
  brand: string | null;
  itemName: string;
  model: string | null;
  excludeId?: number;
}): Promise<boolean> {
  const brandKey = opts.brand?.trim() || "";
  const modelKey = opts.model?.trim() || "";
  const conditions: SQL[] = [
    eq(inventoryItemsTable.itemName, opts.itemName),
    sql`coalesce(${inventoryItemsTable.brand}, '') = ${brandKey}`,
    sql`coalesce(${inventoryItemsTable.model}, '') = ${modelKey}`,
  ];
  if (opts.excludeId != null) {
    conditions.push(ne(inventoryItemsTable.id, opts.excludeId));
  }
  const [row] = await db
    .select({ id: inventoryItemsTable.id })
    .from(inventoryItemsTable)
    .where(and(...conditions))
    .limit(1);
  return !!row;
}

function logInventoryError(err: unknown, context: string): void {
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error(
    { err, stack, event: "inventory_error", context },
    `inventory ${context} failed`,
  );
}

const TxInput = z.object({
  reason: z.enum(INVENTORY_TX_REASONS),
  quantityChange: z.coerce.number().int().refine((n) => n !== 0, "異動數量不可為 0"),
  notes: z.string().optional().nullable(),
  supplier: z.string().trim().max(250).optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
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

router.get("/inventory-items", async (req, res): Promise<void> => {
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

router.get("/inventory-items/:id", async (req, res): Promise<void> => {
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

router.post("/inventory-items", async (req, res): Promise<void> => {
  const parsed = ItemInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" });
    return;
  }
  const d = parsed.data;
  const brand = d.brand ?? null;
  const model = d.model ?? null;
  const itemName = d.itemName;
  try {
    const result = await db.transaction(async (tx) => {
      // Serialize item creation/restocking so two concurrent receipts cannot create duplicates.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(73192601)`);
      const normalize = (v: string | null | undefined) => (v || "").trim().toLowerCase();
      const candidates = await tx.select().from(inventoryItemsTable).where(and(
        sql`lower(btrim(coalesce(${inventoryItemsTable.brand}, ''))) = ${normalize(brand)}`,
        model ? sql`lower(btrim(coalesce(${inventoryItemsTable.model}, ''))) = ${normalize(model)}` : and(sql`coalesce(${inventoryItemsTable.model}, '') = ''`, sql`lower(btrim(${inventoryItemsTable.itemName})) = ${normalize(itemName)}`),
      )).for("update");
      const matches = candidates.filter(i => normalize(i.serialNumber) === normalize(d.serialNumber) && normalize(i.unit) === normalize(d.unit || "台") && normalize(i.warehouseLocation) === normalize(d.warehouseLocation));
      if (matches.length > 1 || (candidates.length && !matches.length)) return { conflict: true as const };
      let item = matches[0];
      const existing = !!item;
      if (existing && (!d.initialQuantity || !["庫存中", "待出貨", "已出貨"].includes(item.status))) return { conflict: true as const };
      if (!item) {
        [item] = await tx.insert(inventoryItemsTable).values({brand, category:d.category ?? null,itemName,model,serialNumber:d.serialNumber ?? null,unit:d.unit || "台",warehouseLocation:d.warehouseLocation ?? null,status:d.status || "庫存中",costPrice:d.costPrice ?? null,notes:d.notes ?? null}).returning();
      } else {
        [item] = await tx.update(inventoryItemsTable).set({updatedAt:new Date(), ...(item.status === "已出貨" ? {status:"庫存中"} : {})}).where(eq(inventoryItemsTable.id,item.id)).returning();
      }
      if (d.initialQuantity) await tx.insert(inventoryTransactionsTable).values({inventoryItemId:item.id,reason:"進貨",quantityChange:d.initialQuantity,supplier:d.supplier || null,occurredAt:d.occurredAt ? new Date(d.occurredAt) : new Date(),notes:d.notes || null,createdBy:req.user?.id ?? null});
      const [{qty}] = await tx.select({qty:sql<number>`coalesce(sum(${inventoryTransactionsTable.quantityChange}),0)::int`}).from(inventoryTransactionsTable).where(eq(inventoryTransactionsTable.inventoryItemId,item.id));
      return { conflict:false as const, item, qty:Number(qty), existing };
    });
    if (result.conflict) { res.status(409).json({error:"已有相近品項或狀態不符，請從庫存清單選擇正確品項後登記進貨，避免混入不同序號、單位或倉庫。"}); return; }
    res.status(result.existing ? 200 : 201).json(serializeItem(result.item,result.qty));
  } catch (err) {
    logInventoryError(err, "create");
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "此庫存品項已存在" });
      return;
    }
    res.status(500).json({ error: "新增庫存品項失敗，請稍後再試" });
  }
});

router.patch("/inventory-items/:id", async (req, res): Promise<void> => {
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
  if (d.brand !== undefined) patch.brand = d.brand;
  if (d.category !== undefined) patch.category = d.category;
  if (d.itemName !== undefined) patch.itemName = d.itemName;
  if (d.model !== undefined) patch.model = d.model;
  if (d.serialNumber !== undefined) patch.serialNumber = d.serialNumber;
  if (d.unit !== undefined) patch.unit = d.unit || "台";
  if (d.warehouseLocation !== undefined) patch.warehouseLocation = d.warehouseLocation;
  if (d.status !== undefined) patch.status = d.status;
  if (d.costPrice !== undefined) patch.costPrice = d.costPrice;
  if (d.notes !== undefined) patch.notes = d.notes;

  try {
    if (d.brand !== undefined || d.itemName !== undefined || d.model !== undefined) {
      const [existing] = await db
        .select()
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "找不到庫存品項" });
        return;
      }
      const dup = await findDuplicateItem({
        brand: d.brand !== undefined ? (d.brand ?? null) : existing.brand,
        itemName: d.itemName ?? existing.itemName,
        model: d.model !== undefined ? (d.model ?? null) : existing.model,
        excludeId: id,
      });
      if (dup) {
        res.status(409).json({ error: "此庫存品項已存在" });
        return;
      }
    }

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
  } catch (err) {
    logInventoryError(err, "update");
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "此庫存品項已存在" });
      return;
    }
    res.status(500).json({ error: "更新庫存品項失敗，請稍後再試" });
  }
});

router.delete("/inventory-items/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "無效的 ID" });
    return;
  }
  const [history] = await db.select({id: inventoryTransactionsTable.id}).from(inventoryTransactionsTable).where(eq(inventoryTransactionsTable.inventoryItemId,id)).limit(1);
  if (history) { res.status(409).json({error:"已有異動紀錄，不可刪除品項"}); return; }
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

    const sign = defaultTxSign(parsed.data.reason);
    if(sign && Math.sign(parsed.data.quantityChange)!==sign){res.status(400).json({error:"異動方向與原因不符"});return;}
    try {
      const result = await db.transaction(async tx => {
        const [locked] = await tx.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id,id)).for("update");
        if (!locked) throw new Error("找不到庫存品項");
        const [{qty}] = await tx.select({qty: sql<number>`coalesce(sum(${inventoryTransactionsTable.quantityChange}),0)::int`}).from(inventoryTransactionsTable).where(eq(inventoryTransactionsTable.inventoryItemId,id));
        const nextQty = Number(qty) + parsed.data.quantityChange;
        if (nextQty < 0) throw new Error("庫存不足");
        const [created] = await tx.insert(inventoryTransactionsTable).values({inventoryItemId:id, reason:parsed.data.reason, quantityChange:parsed.data.quantityChange, notes:parsed.data.notes || null, supplier:parsed.data.supplier || null, occurredAt:parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(), createdBy:req.user?.id ?? null}).returning();
        await tx.update(inventoryItemsTable).set({updatedAt:new Date(), ...(parsed.data.reason === "進貨" && locked.status === "已出貨" ? {status:"庫存中"} : {})}).where(eq(inventoryItemsTable.id,id));
        return {transaction:created, quantity:nextQty, item:serializeItem(locked,nextQty)};
      });
      res.status(201).json(result);
    } catch(err) { logInventoryError(err,"transaction"); res.status(400).json({error:err instanceof Error && err.message === "庫存不足" ? err.message : "庫存異動失敗"}); }
  },
);

export default router;
