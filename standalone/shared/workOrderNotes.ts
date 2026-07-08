const CATEGORY_TO_PROJECT: Record<string, string> = {
  "裝新機": "新裝",
  "保養": "保養",
  "維修": "維修",
  "移機": "遷機",
  "拆機": "清洗",
  "冷媒工程": "新裝",
  "配管工程": "新裝",
  "其他": "新裝",
};

export function categoryToProjectType(category: string | null | undefined): string {
  return CATEGORY_TO_PROJECT[category ?? ""] ?? "新裝";
}

/** Remove legacy quote-item price blocks from work order notes (no pricing on WO). */
export function stripQuotePricingFromNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  const marker = "報價項目：";
  const idx = notes.indexOf(marker);
  if (idx >= 0) return notes.slice(0, idx).replace(/\n+$/, "").trim();
  return notes
    .split("\n")
    .filter(line => !/@[\d,]+(\s*=|$)/.test(line))
    .join("\n")
    .trim();
}
