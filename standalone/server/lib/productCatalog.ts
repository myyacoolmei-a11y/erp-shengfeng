import { eq, inArray, and, SQL } from "drizzle-orm";
import {
  db,
  productsTable,
  productUsageTypesTable,
  wholesaleProductsTable,
} from "@workspace/db";
import {
  PRODUCT_USAGE_TYPES,
  type ProductUsageType,
  isProductUsageType,
} from "../../shared/productUsageTypes";

export type WholesaleSettingsInput = {
  wholesalePrice?: string | number | null;
  minQuantity?: number;
  wholesaleNote?: string | null;
  isEnabled?: boolean;
  sortOrder?: number;
};

export type WholesaleSettings = {
  wholesalePrice: string | null;
  minQuantity: number;
  wholesaleNote: string | null;
  isEnabled: boolean;
  sortOrder: number;
};

export async function fetchUsageTypesByProductIds(
  productIds: number[],
): Promise<Map<number, ProductUsageType[]>> {
  const map = new Map<number, ProductUsageType[]>();
  if (productIds.length === 0) return map;

  const rows = await db
    .select()
    .from(productUsageTypesTable)
    .where(inArray(productUsageTypesTable.productId, productIds));

  for (const row of rows) {
    if (!isProductUsageType(row.usageType)) continue;
    const arr = map.get(row.productId) ?? [];
    arr.push(row.usageType);
    map.set(row.productId, arr);
  }
  return map;
}

export async function fetchWholesaleByProductIds(
  productIds: number[],
): Promise<Map<number, WholesaleSettings & { id: number }>> {
  const map = new Map<number, WholesaleSettings & { id: number }>();
  if (productIds.length === 0) return map;

  const rows = await db
    .select()
    .from(wholesaleProductsTable)
    .where(inArray(wholesaleProductsTable.productId, productIds));

  for (const row of rows) {
    map.set(row.productId, {
      id: row.id,
      wholesalePrice: row.wholesalePrice ?? null,
      minQuantity: row.minQuantity,
      wholesaleNote: row.wholesaleNote ?? null,
      isEnabled: row.isEnabled,
      sortOrder: row.sortOrder,
    });
  }
  return map;
}

export function serializeWholesaleSettings(
  row: typeof wholesaleProductsTable.$inferSelect | undefined,
): WholesaleSettings | null {
  if (!row) return null;
  return {
    wholesalePrice: row.wholesalePrice ?? null,
    minQuantity: row.minQuantity,
    wholesaleNote: row.wholesaleNote ?? null,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
  };
}

export function serializeProduct(
  product: typeof productsTable.$inferSelect,
  usageTypes: ProductUsageType[] = [],
  wholesale: WholesaleSettings | null = null,
) {
  return {
    id: product.id,
    productNumber: product.productNumber ?? null,
    brand: product.brand ?? null,
    category: product.category ?? null,
    name: product.name,
    model: product.model ?? null,
    spec: product.spec ?? null,
    unit: product.unit ?? null,
    imageUrl: product.imageUrl ?? null,
    isActive: product.isActive,
    costPrice: product.costPrice ?? null,
    retailPrice: product.retailPrice ?? null,
    defaultPrice: product.retailPrice ?? null,
    minPrice: product.minPrice ?? null,
    taxIncluded: product.taxIncluded,
    stockQty: product.stockQty,
    safetyStock: product.safetyStock ?? null,
    warehouseLocation: product.warehouseLocation ?? null,
    coolingCapacity: product.coolingCapacity ?? null,
    heatingCapacity: product.heatingCapacity ?? null,
    cspf: product.cspf ?? null,
    energyEfficiency: product.energyEfficiency ?? null,
    voltage: product.voltage ?? null,
    refrigerant: product.refrigerant ?? null,
    warrantyMonths: product.warrantyMonths ?? null,
    notes: product.notes ?? null,
    usageTypes,
    wholesaleSettings: wholesale,
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
  };
}

export async function enrichProducts(products: typeof productsTable.$inferSelect[]) {
  const ids = products.map(p => p.id);
  const usageMap = await fetchUsageTypesByProductIds(ids);
  const wholesaleMap = await fetchWholesaleByProductIds(ids);
  return products.map(p =>
    serializeProduct(
      p,
      usageMap.get(p.id) ?? [],
      wholesaleMap.get(p.id) ?? null,
    ),
  );
}

export async function setProductUsageTypes(
  productId: number,
  usageTypes: ProductUsageType[],
): Promise<void> {
  const valid = [...new Set(usageTypes.filter(isProductUsageType))];
  await db.delete(productUsageTypesTable).where(eq(productUsageTypesTable.productId, productId));
  if (valid.length === 0) return;
  await db.insert(productUsageTypesTable).values(
    valid.map(usageType => ({ productId, usageType })),
  );
}

export async function upsertWholesaleProduct(
  productId: number,
  settings: WholesaleSettingsInput,
  hasWholesaleUsage: boolean,
): Promise<void> {
  const existing = await db
    .select()
    .from(wholesaleProductsTable)
    .where(eq(wholesaleProductsTable.productId, productId))
    .limit(1);

  const price =
    settings.wholesalePrice === "" || settings.wholesalePrice === undefined
      ? null
      : String(settings.wholesalePrice);

  if (existing.length > 0) {
    await db
      .update(wholesaleProductsTable)
      .set({
        wholesalePrice: price,
        minQuantity: settings.minQuantity ?? existing[0].minQuantity,
        wholesaleNote: settings.wholesaleNote ?? existing[0].wholesaleNote,
        isEnabled: hasWholesaleUsage ? (settings.isEnabled ?? true) : false,
        sortOrder: settings.sortOrder ?? existing[0].sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(wholesaleProductsTable.productId, productId));
    return;
  }

  if (!hasWholesaleUsage && price == null && !settings.wholesaleNote) return;

  await db.insert(wholesaleProductsTable).values({
    productId,
    wholesalePrice: price,
    minQuantity: settings.minQuantity ?? 1,
    wholesaleNote: settings.wholesaleNote ?? null,
    isEnabled: hasWholesaleUsage ? (settings.isEnabled ?? true) : false,
    sortOrder: settings.sortOrder ?? 0,
  });
}

export function usageTypeFilterCondition(usageType: string): SQL | undefined {
  if (!isProductUsageType(usageType)) return undefined;
  return eq(productUsageTypesTable.usageType, usageType);
}

export function resolveWholesaleUnitPrice(
  wholesale: WholesaleSettings | null | undefined,
  retailPrice: string | null | undefined,
): number {
  const wp = wholesale?.wholesalePrice;
  if (wp != null && wp !== "") {
    const n = parseFloat(wp);
    if (!isNaN(n)) return n;
  }
  if (retailPrice != null && retailPrice !== "") {
    const n = parseFloat(retailPrice);
    if (!isNaN(n)) return n;
  }
  return 0;
}

export { PRODUCT_USAGE_TYPES };
