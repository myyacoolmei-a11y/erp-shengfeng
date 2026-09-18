import { customFetch } from "../../../shared/api-client/custom-fetch.ts";

export type CustomerSearchHit = {
  id: number;
  name: string;
  companyName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  mobile?: string | null;
  address?: string | null;
  taxId?: string | null;
  customerCode: string;
};

export type CustomerSearchResult = {
  items: CustomerSearchHit[];
  truncated: boolean;
  limit: number;
};

/** True when query has ≥2 CJK chars or ≥3 digits (search threshold). */
export function meetsCustomerSearchThreshold(q: string): boolean {
  const s = q.trim();
  if (!s) return false;
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  return cjk >= 2 || digits >= 3;
}

export function searchCustomers(q: string) {
  const qs = new URLSearchParams({ q: q.trim() });
  return customFetch<CustomerSearchResult>(`/api/customers/search?${qs.toString()}`);
}

export function listRecentCustomers() {
  return customFetch<{ items: CustomerSearchHit[] }>("/api/customers/recent");
}

export function formatCustomerCode(id: number): string {
  return `C-${String(id).padStart(5, "0")}`;
}
