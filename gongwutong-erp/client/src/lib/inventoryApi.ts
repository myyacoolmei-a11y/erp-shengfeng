import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type { InventoryStatus, InventoryTxReason } from "../../../shared/inventoryConstants";

export type InventoryItem = {
  id: number;
  brand: string | null;
  category: string | null;
  itemName: string;
  model: string | null;
  serialNumber: string | null;
  unit: string;
  warehouseLocation: string | null;
  status: InventoryStatus | string;
  costPrice: string | null;
  notes: string | null;
  quantity: number;
  createdAt: string;
  updatedAt: string;
};

export type InventoryTransaction = {
  id: number;
  inventoryItemId: number;
  reason: InventoryTxReason | string;
  quantityChange: number;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
};

export type InventoryItemInput = {
  brand?: string | null;
  category?: string | null;
  itemName: string;
  model?: string | null;
  serialNumber?: string | null;
  unit?: string | null;
  warehouseLocation?: string | null;
  status?: InventoryStatus | string;
  costPrice?: string | number | null;
  notes?: string | null;
};

export type InventoryTxInput = {
  reason: InventoryTxReason | string;
  quantityChange: number;
  notes?: string | null;
};

export type ListInventoryParams = {
  brand?: string;
  model?: string;
  status?: string;
  warehouse?: string;
};

export async function listInventoryItems(params: ListInventoryParams = {}): Promise<InventoryItem[]> {
  const qs = new URLSearchParams();
  if (params.brand) qs.set("brand", params.brand);
  if (params.model) qs.set("model", params.model);
  if (params.status) qs.set("status", params.status);
  if (params.warehouse) qs.set("warehouse", params.warehouse);
  const q = qs.toString();
  return customFetch(`/api/inventory-items${q ? `?${q}` : ""}`);
}

export async function createInventoryItem(data: InventoryItemInput): Promise<InventoryItem> {
  return customFetch("/api/inventory-items", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateInventoryItem(
  id: number,
  data: Partial<InventoryItemInput>,
): Promise<InventoryItem> {
  return customFetch(`/api/inventory-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteInventoryItem(id: number): Promise<void> {
  return customFetch(`/api/inventory-items/${id}`, { method: "DELETE" });
}

export async function listInventoryTransactions(itemId: number): Promise<InventoryTransaction[]> {
  return customFetch(`/api/inventory-items/${itemId}/transactions`);
}

export async function createInventoryTransaction(
  itemId: number,
  data: InventoryTxInput,
): Promise<{ transaction: InventoryTransaction; quantity: number; item: InventoryItem }> {
  return customFetch(`/api/inventory-items/${itemId}/transactions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
