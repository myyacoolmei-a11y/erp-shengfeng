import { Router, type IRouter } from "express";
import { eq, ilike, or, and, asc, SQL } from "drizzle-orm";
import { db, productsTable, productUsageTypesTable, wholesaleProductsTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";
import {
  serializeProduct,
  fetchUsageTypesByProductIds,
  resolveWholesaleUnitPrice,
} from "../lib/productCatalog";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant", "distributor"];
const WRITE_ROLES = ["super_admin", "owner", "admin"];

const priceField = () =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.string().optional(),
  );

const WholesaleProductUpdate = z.object({
  wholesalePrice: priceField().nullable().optional(),
  minQuantity: z.coerce.number().int().min(1).optional(),
  wholesaleNote: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

function serializeWholesaleListItem(
  product: typeof productsTable.$inferSelect,
  wholesale: typeof wholesaleProductsTable.$inferSelect,
  usageTypes: string[],
) {
  const base = serializeProduct(product, usageTypes as any, {
    wholesalePrice: wholesale.wholesalePrice ?? null,
    minQuantity: wholesale.minQuantity,
    wholesaleNote: wholesale.wholesaleNote ?? null,
    isEnabled: wholesale.isEnabled,
    sortOrder: wholesale.sortOrder,
  });
  return {
    ...base,
    wholesaleProductId: wholesale.id,
    wholesalePrice: wholesale.wholesalePrice ?? null,
    minQuantity: wholesale.minQuantity,
    wholesaleNote: wholesale.wholesaleNote ?? null,
    isEnabled: wholesale.isEnabled,
    sortOrder: wholesale.sortOrder,
    effectivePrice: resolveWholesaleUnitPrice(
      {
        wholesalePrice: wholesale.wholesalePrice ?? null,
        minQuantity: wholesale.minQuantity,
        wholesaleNote: wholesale.wholesaleNote ?? null,
        isEnabled: wholesale.isEnabled,
        sortOrder: wholesale.sortOrder,
      },
      product.retailPrice ?? null,
    ),
  };
}

router.get("/wholesale/products", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const isEnabled = typeof req.query.isEnabled === "string" ? req.query.isEnabled : undefined;
  const forSelection = req.query.forSelection === "true";

  const conditions: SQL[] = [
    eq(productUsageTypesTable.usageType, "wholesale_sale"),
    eq(productsTable.isActive, true),
  ];

  if (forSelection) {
    conditions.push(eq(wholesaleProductsTable.isEnabled, true));
  } else if (isEnabled === "true") {
    conditions.push(eq(wholesaleProductsTable.isEnabled, true));
  } else if (isEnabled === "false") {
    conditions.push(eq(wholesaleProductsTable.isEnabled, false));
  }

  if (search) {
    conditions.push(
      or(
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.brand, `%${search}%`),
        ilike(productsTable.model, `%${search}%`),
      )!,
    );
  }

  const rows = await db
    .select({ product: productsTable, wholesale: wholesaleProductsTable })
    .from(wholesaleProductsTable)
    .innerJoin(productsTable, eq(wholesaleProductsTable.productId, productsTable.id))
    .innerJoin(
      productUsageTypesTable,
      and(
        eq(productUsageTypesTable.productId, productsTable.id),
        eq(productUsageTypesTable.usageType, "wholesale_sale"),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(wholesaleProductsTable.sortOrder), asc(productsTable.name));

  const productIds = rows.map(r => r.product.id);
  const usageMap = await fetchUsageTypesByProductIds(productIds);

  res.json(
    rows.map(r =>
      serializeWholesaleListItem(
        r.product,
        r.wholesale,
        usageMap.get(r.product.id) ?? ["wholesale_sale"],
      ),
    ),
  );
});

router.patch("/wholesale/products/:productId", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;
  const productId = parseInt(raw, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }

  const parsed = WholesaleProductUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(wholesaleProductsTable)
    .where(eq(wholesaleProductsTable.productId, productId));

  if (!existing) {
    res.status(404).json({ error: "找不到批發商品設定" });
    return;
  }

  const data = parsed.data;
  const price =
    data.wholesalePrice === "" || data.wholesalePrice === undefined
      ? existing.wholesalePrice
      : data.wholesalePrice == null
        ? null
        : String(data.wholesalePrice);

  const [updated] = await db
    .update(wholesaleProductsTable)
    .set({
      wholesalePrice: price,
      minQuantity: data.minQuantity ?? existing.minQuantity,
      wholesaleNote: data.wholesaleNote !== undefined ? data.wholesaleNote : existing.wholesaleNote,
      isEnabled: data.isEnabled ?? existing.isEnabled,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(wholesaleProductsTable.productId, productId))
    .returning();

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "找不到商品" }); return; }

  const usageMap = await fetchUsageTypesByProductIds([productId]);
  res.json(
    serializeWholesaleListItem(
      product,
      updated,
      usageMap.get(productId) ?? [],
    ),
  );
});

export default router;
