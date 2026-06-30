import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc, SQL } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant", "distributor"];
const WRITE_ROLES = ["super_admin", "owner", "admin"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

const priceField = () =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.string().optional());

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
  wholesalePrice: priceField(),
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
});

const UpdateProductInput = ProductInput.partial();

function generateProductNumber(id: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `PRD-${y}${m}-${String(id).padStart(4, "0")}`;
}

router.get("/products", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const brand = typeof req.query.brand === "string" ? req.query.brand : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const isActive = typeof req.query.isActive === "string" ? req.query.isActive : undefined;
  const conditions: SQL[] = [];

  if (search) {
    conditions.push(
      or(
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.brand, `%${search}%`),
        ilike(productsTable.model, `%${search}%`),
        ilike(productsTable.productNumber, `%${search}%`),
      )!
    );
  }
  if (brand) conditions.push(eq(productsTable.brand, brand));
  if (category) conditions.push(eq(productsTable.category, category));
  if (isActive === "true") conditions.push(eq(productsTable.isActive, true));
  if (isActive === "false") conditions.push(eq(productsTable.isActive, false));

  const products = await db
    .select()
    .from(productsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(productsTable.createdAt));

  res.json(products);
});

router.post("/products", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const parsed = ProductInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db.insert(productsTable).values(parsed.data).returning();
  const productNumber = generateProductNumber(product.id);
  const [updated] = await db
    .update(productsTable)
    .set({ productNumber })
    .where(eq(productsTable.id, product.id))
    .returning();
  res.status(201).json(updated);
});

router.get("/products/:id", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "找不到商品" }); return; }
  res.json(product);
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
  const [updated] = await db
    .update(productsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(productsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "找不到商品" }); return; }
  res.json(updated);
});

router.delete("/products/:id", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).send();
});

export default router;
