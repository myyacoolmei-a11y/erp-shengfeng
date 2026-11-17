import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  BackfillStep,
  CompletionChecklist,
  FieldStatus,
  PauseInterval,
} from "../../../shared/fieldProgressConstants";
import {
  BACKFILL_STEP_LABELS,
  BACKFILL_STEPS,
  COMPLETION_CHECKLIST_LABELS,
  COMPLETION_CHECKLIST_KEYS,
  emptyCompletionChecklist,
  FIELD_STATUS_LABELS,
  isChecklistComplete,
  ONSITE_STALE_MINUTES,
  PAUSE_REASONS,
  TRAVEL_REMIND_MINUTES,
  UNABLE_REASONS,
} from "../../../shared/fieldProgressConstants";

export type { FieldStatus, CompletionChecklist, PauseInterval, BackfillStep };
export {
  UNABLE_REASONS,
  PAUSE_REASONS,
  BACKFILL_STEPS,
  BACKFILL_STEP_LABELS,
  COMPLETION_CHECKLIST_KEYS,
  COMPLETION_CHECKLIST_LABELS,
  FIELD_STATUS_LABELS,
  emptyCompletionChecklist,
  isChecklistComplete,
  TRAVEL_REMIND_MINUTES,
  ONSITE_STALE_MINUTES,
};

export interface FieldProgressRecord {
  id: number;
  workOrderId: number;
  engineerUserId: number;
  engineerName: string;
  fieldStatus: FieldStatus;
  fieldStatusLabel: string;
  departedAt: string | null;
  arrivedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  completedAt: string | null;
  pauseReason: string | null;
  pauseNote: string | null;
  pauseTotalMinutes: number;
  pauseIntervals: PauseInterval[];
  unableToCompleteAt: string | null;
  unableReason: string | null;
  unableNote: string | null;
  travelDurationMinutes: number | null;
  workDurationMinutes: number | null;
  totalDurationMinutes: number | null;
  travelDurationLabel: string;
  workDurationLabel: string;
  totalDurationLabel: string;
  completedBy: number | null;
  completionChecklist: CompletionChecklist | null;
  workflowStatus: string | null;
  lastActionBy: number | null;
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

export function taipeiNowParts(): { date: string; minutes: number } {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = time.split(":").map(Number);
  return { date, minutes: (h ?? 0) * 60 + (m ?? 0) };
}

export function parseScheduledMinutes(scheduledTime: string | null | undefined): number | null {
  if (!scheduledTime) return null;
  const m = String(scheduledTime).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function daysOverdue(scheduledDate: string | null | undefined, today = taipeiToday()): number {
  if (!scheduledDate || scheduledDate >= today) return 0;
  const a = new Date(`${scheduledDate}T00:00:00+08:00`).getTime();
  const b = new Date(`${today}T00:00:00+08:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function addDaysTaipei(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export type FieldReminderKind =
  | "depart_soon"
  | "not_departed"
  | "confirm_arrive"
  | "update_status"
  | "unclosed_today"
  | null;

export function computeFieldReminder(params: {
  scheduledDate: string | null | undefined;
  scheduledTime: string | null | undefined;
  progress: FieldProgressRecord | null | undefined;
}): { kind: FieldReminderKind; message: string | null; severity: "yellow" | "red" | null } {
  const status = params.progress?.fieldStatus ?? "pending";
  if (status === "completed") return { kind: null, message: null, severity: null };

  const { date: today, minutes: nowMin } = taipeiNowParts();
  const schedDate = params.scheduledDate ?? null;
  const schedMin = parseScheduledMinutes(params.scheduledTime);

  if (status === "pending" && schedDate === today && schedMin != null) {
    if (nowMin >= schedMin) {
      return { kind: "not_departed", message: "尚未出發", severity: "red" };
    }
    if (nowMin >= schedMin - 15) {
      return { kind: "depart_soon", message: "預定施工前 15 分鐘，請記得出發", severity: "yellow" };
    }
  }

  if (status === "pending" && schedDate && schedDate < today) {
    return { kind: "not_departed", message: "尚未出發（逾期）", severity: "red" };
  }

  if (status === "en_route" && params.progress?.departedAt) {
    const departed = new Date(params.progress.departedAt).getTime();
    if (Date.now() - departed > TRAVEL_REMIND_MINUTES * 60_000) {
      return { kind: "confirm_arrive", message: "請確認是否已到場", severity: "yellow" };
    }
  }

  if (status === "in_progress" && params.progress?.arrivedAt) {
    const arrived = new Date(params.progress.arrivedAt).getTime();
    if (Date.now() - arrived > ONSITE_STALE_MINUTES * 60_000) {
      return { kind: "update_status", message: "請更新施工狀態", severity: "yellow" };
    }
  }

  if (
    status !== "completed" &&
    schedDate === today &&
    nowMin >= 18 * 60
  ) {
    return { kind: "unclosed_today", message: "今日未關閉案件", severity: "red" };
  }

  return { kind: null, message: null, severity: null };
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

export async function pauseFieldProgress(
  workOrderId: number,
  data: { reason: string; note?: string },
): Promise<FieldProgressRecord> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/pause`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function resumeFieldProgress(workOrderId: number): Promise<FieldProgressRecord> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/resume`, { method: "POST" });
}

export async function completeFieldProgress(
  workOrderId: number,
  checklist: CompletionChecklist,
): Promise<FieldProgressRecord> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/complete`, {
    method: "POST",
    body: JSON.stringify({ checklist }),
  });
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

export async function requestFieldProgressBackfill(
  workOrderId: number,
  data: {
    missedStep: BackfillStep;
    requestedTime: string;
    reason: string;
    note?: string;
  },
): Promise<unknown> {
  return customFetch(`/api/work-orders/${workOrderId}/field-progress/backfill-request`, {
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
