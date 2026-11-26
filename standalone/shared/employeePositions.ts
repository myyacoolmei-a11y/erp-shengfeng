/** Employee responsibilities are separate from account permissions. */
export function splitPositions(value: string | null | undefined): string[] {
  return (value ?? '').split(/[、,，/]+/).map(v => v.trim()).filter(Boolean);
}
export function hasEmployeePosition(value: string | null | undefined, position: string): boolean {
  return splitPositions(value).includes(position);
}
export function samePersonKey(e: { id: number; name: string; phone?: string | null }): string {
  const phone = (e.phone ?? '').replace(/[^0-9]/g, '');
  return phone ? `${e.name.trim().replace(/\s+/g, '').toLocaleLowerCase()}|${phone}` : `id:${e.id}`;
}
/** Select only eligible original records; do not merge or rewrite database IDs. */
export function employeeOptions<T extends { id: number; name: string; phone?: string | null; position?: string | null; status: string }>(employees: readonly T[] | undefined, position?: string): T[] {
  const selected = new Map<string, T>();
  for (const e of employees ?? []) {
    if (!['在職', '配合'].includes(e.status) || !e.name.trim()) continue;
    if (position && !hasEmployeePosition(e.position, position)) continue;
    const key = samePersonKey(e);
    const old = selected.get(key);
    if (!old || (old.status !== '在職' && e.status === '在職')) selected.set(key, e);
  }
  return [...selected.values()];
}
