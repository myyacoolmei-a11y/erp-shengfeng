import { and, eq, ilike, or } from "drizzle-orm";
import { db, productsTable, productUsageTypesTable } from "@workspace/db";
import { usageTypeFilterCondition } from "../productCatalog.ts";
import type { ParsedVoiceItem } from "../../../shared/voice/types.ts";

function scoreProduct(
  product: { brand: string | null; name: string; model: string | null },
  item: ParsedVoiceItem,
): number {
  let score = 0;
  const ib = (item.brand ?? "").toLowerCase();
  const im = (item.model ?? "").toLowerCase();
  const pb = (product.brand ?? "").toLowerCase();
  const pm = (product.model ?? "").toLowerCase();
  const pn = product.name.toLowerCase();

  if (im && pm && (pm.includes(im) || im.includes(pm))) score += 5;
  if (ib && pb && (pb.includes(ib) || ib.includes(pb))) score += 3;
  if (im && pn.includes(im)) score += 2;
  if (ib && pn.includes(ib)) score += 1;
  return score;
}

export async function matchVoiceItemToProduct(item: ParsedVoiceItem): Promise<ParsedVoiceItem> {
  const searchTerms = [item.model, item.brand, item.itemName].filter(Boolean) as string[];
  if (searchTerms.length === 0) {
    return { ...item, inputMode: "manual", matched: false };
  }

  const primarySearch = item.model || item.itemName || item.brand || "";
  const conditions = searchTerms.flatMap(term => [
    ilike(productsTable.brand, `%${term}%`),
    ilike(productsTable.model, `%${term}%`),
    ilike(productsTable.name, `%${term}%`),
  ]);

  const rows = await db
    .select({ product: productsTable })
    .from(productsTable)
    .innerJoin(
      productUsageTypesTable,
      and(
        eq(productUsageTypesTable.productId, productsTable.id),
        usageTypeFilterCondition("engineering_quote")!,
      ),
    )
    .where(and(eq(productsTable.isActive, true), or(...conditions)))
    .limit(20);

  let best: typeof productsTable.$inferSelect | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const s = scoreProduct(row.product, item);
    if (s > bestScore) {
      bestScore = s;
      best = row.product;
    }
  }

  if (!best || bestScore < 3) {
    return {
      ...item,
      inputMode: "manual",
      matched: false,
      notes: item.notes ?? (primarySearch ? `語音：${primarySearch}` : undefined),
    };
  }

  const unitPrice = best.retailPrice ? parseFloat(best.retailPrice) : 0;
  return {
    ...item,
    productId: best.id,
    brand: best.brand ?? item.brand,
    itemName: best.name ?? item.itemName,
    model: best.model ?? item.model,
    unit: best.unit ?? item.unit ?? "台",
    category: best.category ?? item.category ?? "裝新機",
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    inputMode: "catalog",
    matched: true,
  };
}

export async function matchVoiceItems(items: ParsedVoiceItem[] | undefined): Promise<ParsedVoiceItem[]> {
  if (!items?.length) return [];
  return Promise.all(items.map(matchVoiceItemToProduct));
}
