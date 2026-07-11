import { customFetch } from "../../../shared/api-client/custom-fetch.ts";

export interface FieldProgressRecord {
  id: number;
  workOrderId: number;
  engineerUserId: number;
  engineerName: string;
  departedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  unableToCompleteAt: string | null;
  unableReason: string | null;
  unableNote: string | null;
  travelDurationMinutes: number | null;
  workDurationMinutes: number | null;
  totalDurationMinutes: number | null;
  travelDurationLabel: string;
  workDurationLabel: string;
  totalDurationLabel: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FieldProgressSnapshotRecord extends FieldProgressRecord {
  archivedAt: string | null;
}

export interface WorkHoursStatRow extends FieldProgressRecord {
  date: string;
  workOrderNumber: string;
  customerName: string;
}

export const UNABLE_REASONS = ["客戶不在", "客戶要求改期", "缺料", "其他"] as const;

export function formatTaipeiDateTime(iso: string | null | undefined): string {
  if (!iso) return "尚未記錄";
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function taipeiToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export function isWorkOrderAssignedToUser(
  order: {
    assignedTo?: string | null;
    assistantTo?: string | null;
    technicians?: string | null;
  },
  user: { id: number; displayName: string; username?: string },
): boolean {
  const keys = new Set<string>();
  const displayName = user.displayName?.trim();
  const username = user.username?.trim();
  if (displayName) keys.add(displayName);
  if (username) keys.add(username);
  keys.add(String(user.id));

  const assignedTo = order.assignedTo?.trim();
  const assistantTo = order.assistantTo?.trim();
  if (assignedTo && keys.has(assignedTo)) return true;
  if (assistantTo && keys.has(assistantTo)) return true;

  if (!order.technicians) return false;
  try {
    const techs = JSON.parse(order.technicians);
    if (!Array.isArray(techs)) return false;
    return techs.some((t) => keys.has(String(t).trim()));
  } catch {
    return false;
  }
}

export async function listFieldProgress(workOrderId: number): Promise<FieldProgressRecord[]> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress`);
}

export async function listFieldProgressSnapshots(workOrderId: number): Promise<FieldProgressSnapshotRecord[]> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/snapshots`);
}

export async function listMyFieldProgress(): Promise<FieldProgressRecord[]> {
  return customFetch("/api/field-progress/mine");
}

export async function departFieldProgress(workOrderId: number): Promise<FieldProgressRecord> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/depart`, { method: "POST" });
}

export async function arriveFieldProgress(workOrderId: number): Promise<FieldProgressRecord> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/arrive`, { method: "POST" });
}

export async function completeFieldProgress(workOrderId: number): Promise<FieldProgressRecord> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/complete`, { method: "POST" });
}

export async function reportUnableFieldProgress(
  workOrderId: number,
  data: { reason: string; note?: string },
): Promise<FieldProgressRecord> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/unable`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchWorkHoursStats(params: {
  preset?: "today" | "week" | "month";
  from?: string;
  to?: string;
  engineerUserId?: number;
}): Promise<WorkHoursStatRow[]> {
  const qs = new URLSearchParams();
  if (params.preset) qs.set("preset", params.preset);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.engineerUserId != null) qs.set("engineerUserId", String(params.engineerUserId));
  return customFetch(`/api/work-hours/stats?${qs.toString()}`);
}
