/** Product usage type codes (stored in product_usage_types.usage_type). */
export const PRODUCT_USAGE_TYPES = [
  "engineering_quote",
  "wholesale_sale",
  "repair_part",
  "maintenance_service",
] as const;

export type ProductUsageType = (typeof PRODUCT_USAGE_TYPES)[number];

export const PRODUCT_USAGE_LABELS: Record<ProductUsageType, string> = {
  engineering_quote: "工程報價",
  wholesale_sale: "批發銷售",
  repair_part: "維修零件",
  maintenance_service: "保養服務",
};

export function isProductUsageType(v: string): v is ProductUsageType {
  return (PRODUCT_USAGE_TYPES as readonly string[]).includes(v);
}
