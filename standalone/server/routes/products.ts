import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc, SQL } from "drizzle-orm";
import { db, productsTable, productUsageTypesTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";
import {
  enrichProducts,
  setProductUsageTypes,
  upsertWholesaleProduct,
  usageTypeFilterCondition,
  serializeProduct,
  fetchUsageTypesByProductIds,
  fetchWholesaleByProductIds,
} from "../lib/productCatalog";
import { isProductUsageType, PRODUCT_USAGE_TYPES, type ProductUsageType } from "../../shared/productUsageTypes";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant", "distributor"];
const WRITE_ROLES = ["super_admin", "owner", "admin"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

const priceField = () =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.string().optional(),
  );

const WholesaleSettingsInput = z.object({
  wholesalePrice: priceField().nullable().optional(),
  minQuantity: z.coerce.number().int().min(1).optional(),
  wholesaleNote: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const ProductInput = z.object({
  brand: z.string().optional(),
  category: z.string().optional(),
  name: z.string().min(1),
  model: z.string().optional(),
  spec: z.string().optional(),
  unit: z.string().optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
  costPrice: priceField(),
  retailPrice: priceField(),
  minPrice: priceField(),
  taxIncluded: z.boolean().optional(),
  stockQty: z.coerce.number().int().optional(),
  safetyStock: z.coerce.number().int().optional().nullable(),
  warehouseLocation: z.string().optional(),
  coolingCapacity: z.string().optional(),
  heatingCapacity: z.string().optional(),
  cspf: z.string().optional(),
  energyEfficiency: z.string().optional(),
  voltage: z.string().optional(),
  refrigerant: z.string().optional(),
  warrantyMonths: z.coerce.number().int().optional().nullable(),
  notes: z.string().optional(),
  usageTypes: z.array(z.enum(PRODUCT_USAGE_TYPES)).optional(),
  wholesaleSettings: WholesaleSettingsInput.optional(),
});

const UpdateProductInput = ProductInput.partial();

function generateProductNumber(id: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `PRD-${y}${m}-${String(id).padStart(4, "0")}`;
}

async function loadProductDetail(id: number) {
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) return null;
  const usageMap = await fetchUsageTypesByProductIds([id]);
  const wholesaleMap = await fetchWholesaleByProductIds([id]);
  return serializeProduct(product, usageMap.get(id) ?? [], wholesaleMap.get(id) ?? null);
}

async function applyUsageAndWholesale(
  productId: number,
  usageTypes: ProductUsageType[] | undefined,
  wholesaleSettings: z.infer<typeof WholesaleSettingsInput> | undefined,
) {
  if (usageTypes !== undefined) {
    await setProductUsageTypes(productId, usageTypes);
  }
  const hasWholesale = (usageTypes ?? []).includes("wholesale_sale");
  if (wholesaleSettings !== undefined || usageTypes !== undefined) {
    await upsertWholesaleProduct(productId, wholesaleSettings ?? {}, hasWholesale);
  }
}

router.get("/products", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const brand = typeof req.query.brand === "string" ? req.query.brand : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const isActive = typeof req.query.isActive === "string" ? req.query.isActive : undefined;
  const usageType = typeof req.query.usageType === "string" ? req.query.usageType : undefined;

  const conditions: SQL[] = [];

  if (search) {
    conditions.push(
      or(
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.brand, `%${search}%`),
        ilike(productsTable.model, `%${search}%`),
        ilike(productsTable.productNumber, `%${search}%`),
      )!,
    );
  }
  if (brand) conditions.push(eq(productsTable.brand, brand));
  if (category) conditions.push(eq(productsTable.category, category));
  if (isActive === "true") conditions.push(eq(productsTable.isActive, true));
  if (isActive === "false") conditions.push(eq(productsTable.isActive, false));

  let query = db
    .select({ product: productsTable })
    .from(productsTable)
    .$dynamic();

  if (usageType && isProductUsageType(usageType)) {
    query = query.innerJoin(
      productUsageTypesTable,
      and(
        eq(productUsageTypesTable.productId, productsTable.id),
        usageTypeFilterCondition(usageType)!,
      ),
    );
  }

  const rows = await query
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(productsTable.createdAt));

  const products = rows.map(r => r.product);
  res.json(await enrichProducts(products));
});

router.post("/products", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = ProductInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { usageTypes, wholesaleSettings, ...productData } = parsed.data;
  const [product] = await db.insert(productsTable).values(productData).returning();
  const productNumber = generateProductNumber(product.id);
  const [updated] = await db
    .update(productsTable)
    .set({ productNumber })
    .where(eq(productsTable.id, product.id))
    .returning();

  const effectiveUsage =
    usageTypes ??
    (["engineering_quote"] as ProductUsageType[]);

  await applyUsageAndWholesale(updated.id, effectiveUsage, wholesaleSettings);

  const detail = await loadProductDetail(updated.id);
  res.status(201).json(detail);
});

router.get("/products/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const detail = await loadProductDetail(id);
  if (!detail) { res.status(404).json({ error: "找不到商品" }); return; }
  res.json(detail);
});

router.patch("/products/:id", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProductInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { usageTypes, wholesaleSettings, ...productData } = parsed.data;

  let updated;
  if (Object.keys(productData).length > 0) {
    [updated] = await db
      .update(productsTable)
      .set({ ...productData, updatedAt: new Date() })
      .where(eq(productsTable.id, id))
      .returning();
  } else {
    [updated] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  }

  if (!updated) { res.status(404).json({ error: "找不到商品" }); return; }

  if (usageTypes !== undefined || wholesaleSettings !== undefined) {
    let effectiveUsage = usageTypes;
    if (effectiveUsage === undefined && wholesaleSettings !== undefined) {
      const usageMap = await fetchUsageTypesByProductIds([id]);
      effectiveUsage = usageMap.get(id) ?? [];
    }
    await applyUsageAndWholesale(id, effectiveUsage, wholesaleSettings);
  }

  const detail = await loadProductDetail(id);
  res.json(detail);
});

router.delete("/products/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).send();
});

export default router;
