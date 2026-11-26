import { samePersonKey } from './employeePositions.ts';

export type ReportingEmployee = { id: number; name: string; phone?: string | null; status: string; position: string };
export type ReportingUser = { id: number; linkedEmployeeId: number | null; displayName: string };

/** Reporting aliases only: never modify database IDs or use a name alone to match people. */
export function buildEmployeeReportingIndex(employees: readonly ReportingEmployee[], users: readonly ReportingUser[]) {
  const byId = new Map(employees.map(e => [e.id, e]));
  const rank = (e: ReportingEmployee) => e.status === '在職' ? 0 : e.status === '配合' ? 1 : 2;
  const groups = new Map<string, ReportingEmployee[]>();
  for (const e of employees) {
    const key = samePersonKey(e);
    const list = groups.get(key) ?? [];
    list.push(e); groups.set(key, list);
  }
  const canonical = new Map<number, number>();
  for (const group of groups.values()) {
    const chosen = [...group].sort((a,b) => rank(a)-rank(b) || a.id-b.id)[0];
    for (const e of group) canonical.set(e.id, chosen.id);
  }
  const phone = (e: ReportingEmployee) => (e.phone ?? '').replace(/\D/g, '');
  const name = (s: string) => s.trim().replace(/\s+/g, '').toLocaleLowerCase();
  // A renamed former record can be resolved only with a corroborating linked login
  // and a unique current employee sharing the original phone and login display name.
  for (const e of employees) {
    if (e.status !== '離職' || !phone(e) || canonical.get(e.id) !== e.id) continue;
    const active = employees.filter(x => rank(x) < 2 && phone(x) === phone(e));
    const activeIds = new Set(active.map(x => canonical.get(x.id)!));
    if (activeIds.size !== 1) continue;
    const target = byId.get([...activeIds][0])!;
    if (users.some(u => u.linkedEmployeeId === e.id && name(u.displayName) === name(target.name))) {
      canonical.set(e.id, target.id);
    }
  }
  const employeeId = (id: number | null | undefined): number | null => {
    if (id == null || !byId.has(id)) return null;
    let current = id;
    const seen = new Set<number>();
    while (!seen.has(current)) {
      seen.add(current);
      const next = canonical.get(current) ?? current;
      if (next === current) return current;
      current = next;
    }
    return id;
  };
  const userById = new Map(users.map(u => [u.id,u]));
  const userEmployeeId = (id: number | null | undefined) => id == null ? null : employeeId(userById.get(id)?.linkedEmployeeId);
  return { byId, employeeId, userEmployeeId };
}
