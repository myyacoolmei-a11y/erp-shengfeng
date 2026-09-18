import type { CompletionChecklist, FieldStatus, PauseInterval } from "../../../shared/fieldProgressConstants.ts";
import {
  FIELD_STATUS_LABELS,
  PAUSE_REASONS,
  UNABLE_REASONS,
} from "../../../shared/fieldProgressConstants.ts";

export { PAUSE_REASONS, UNABLE_REASONS, FIELD_STATUS_LABELS };
export type { UnableReason } from "../../../shared/fieldProgressConstants.ts";

export {
  buildUserAssignmentContext,
  isWorkOrderAssignedToContext,
  isWorkOrderAssignedToEmployeeName,
  isFieldProgressOperator,
  isFieldProgressAdmin,
  isWorkOrderListAdmin,
  isEngineerRole,
  getLinkedEmployeeId,
  shouldFilterWorkOrdersByAssignment,
  canUserAccessWorkOrder,
  describeWorkOrderListQuery,
  explainEmptyWorkOrderList,
  logWorkOrderAccess,
  deriveAssignedFromTechnicians,
  type UserAssignmentContext,
  type WorkOrderAssignmentFields,
} from "./workOrderAssignment.ts";

export function diffMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} 分鐘`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} 小時 ${m} 分鐘` : `${h} 小時`;
}

export function isoOrNull(v: Date | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export function taipeiDateString(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export function deriveFieldStatus(row: {
  fieldStatus?: string | null;
  departedAt: Date | null;
  arrivedAt: Date | null;
  pausedAt: Date | null;
  resumedAt: Date | null;
  completedAt: Date | null;
}): FieldStatus {
  if (row.completedAt) return "completed";
  if (row.fieldStatus === "paused") return "paused";
  if (
    row.pausedAt &&
    (!row.resumedAt || row.pausedAt.getTime() > row.resumedAt.getTime())
  ) {
    return "paused";
  }
  if (row.fieldStatus === "in_progress" || row.arrivedAt) return "in_progress";
  if (row.fieldStatus === "en_route" || row.departedAt) return "en_route";
  return "pending";
}

export type FieldProgressRow = {
  id: number;
  workOrderId: number;
  engineerUserId: number;
  engineerName: string;
  fieldStatus?: string | null;
  departedAt: Date | null;
  arrivedAt: Date | null;
  pausedAt?: Date | null;
  resumedAt?: Date | null;
  completedAt: Date | null;
  pauseReason?: string | null;
  pauseNote?: string | null;
  pauseTotalMinutes?: number | null;
  pauseIntervals?: PauseInterval[] | null;
  unableToCompleteAt: Date | null;
  unableReason: string | null;
  unableNote: string | null;
  travelDurationMinutes: number | null;
  workDurationMinutes: number | null;
  totalDurationMinutes: number | null;
  completedBy?: number | null;
  completionChecklist?: CompletionChecklist | null;
  workflowStatus?: string | null;
  lastActionBy?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeFieldProgress(row: FieldProgressRow) {
  const fieldStatus = deriveFieldStatus({
    fieldStatus: row.fieldStatus,
    departedAt: row.departedAt,
    arrivedAt: row.arrivedAt,
    pausedAt: row.pausedAt ?? null,
    resumedAt: row.resumedAt ?? null,
    completedAt: row.completedAt,
  });

  return {
    id: row.id,
    workOrderId: row.workOrderId,
    engineerUserId: row.engineerUserId,
    engineerName: row.engineerName,
    fieldStatus,
    fieldStatusLabel: FIELD_STATUS_LABELS[fieldStatus],
    departedAt: isoOrNull(row.departedAt),
    arrivedAt: isoOrNull(row.arrivedAt),
    pausedAt: isoOrNull(row.pausedAt ?? null),
    resumedAt: isoOrNull(row.resumedAt ?? null),
    completedAt: isoOrNull(row.completedAt),
    pauseReason: row.pauseReason ?? null,
    pauseNote: row.pauseNote ?? null,
    pauseTotalMinutes: row.pauseTotalMinutes ?? 0,
    pauseIntervals: Array.isArray(row.pauseIntervals) ? row.pauseIntervals : [],
    unableToCompleteAt: isoOrNull(row.unableToCompleteAt),
    unableReason: row.unableReason,
    unableNote: row.unableNote,
    travelDurationMinutes: row.travelDurationMinutes,
    workDurationMinutes: row.workDurationMinutes,
    totalDurationMinutes: row.totalDurationMinutes,
    travelDurationLabel: formatDurationMinutes(row.travelDurationMinutes),
    workDurationLabel: formatDurationMinutes(row.workDurationMinutes),
    totalDurationLabel: formatDurationMinutes(row.totalDurationMinutes),
    completedBy: row.completedBy ?? null,
    completionChecklist: row.completionChecklist ?? null,
    workflowStatus: row.workflowStatus ?? null,
    lastActionBy: row.lastActionBy ?? null,
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
  };
}

export function serializeFieldProgressSnapshot(row: {
  id: number;
  workOrderId: number;
  engineerUserId: number;
  engineerName: string;
  departedAt: Date | null;
  arrivedAt: Date | null;
  completedAt: Date | null;
  unableToCompleteAt: Date | null;
  unableReason: string | null;
  unableNote: string | null;
  travelDurationMinutes: number | null;
  workDurationMinutes: number | null;
  totalDurationMinutes: number | null;
  archivedAt: Date;
}) {
  return {
    ...serializeFieldProgress({
      ...row,
      fieldStatus: row.completedAt ? "completed" : "pending",
      pausedAt: null,
      resumedAt: null,
      pauseReason: null,
      pauseNote: null,
      pauseTotalMinutes: 0,
      pauseIntervals: [],
      createdAt: row.archivedAt,
      updatedAt: row.archivedAt,
    }),
    archivedAt: isoOrNull(row.archivedAt),
  };
}

/** Compute durations subtracting accumulated pause minutes from on-site work. */
export function computeDurations(params: {
  departedAt: Date;
  arrivedAt: Date;
  completedAt: Date;
  pauseTotalMinutes: number;
  openPauseStartedAt?: Date | null;
}) {
  const travelDurationMinutes = diffMinutes(params.departedAt, params.arrivedAt);
  let pauseTotal = params.pauseTotalMinutes;
  if (params.openPauseStartedAt) {
    pauseTotal += diffMinutes(params.openPauseStartedAt, params.completedAt);
  }
  const rawWork = diffMinutes(params.arrivedAt, params.completedAt);
  const workDurationMinutes = Math.max(0, rawWork - pauseTotal);
  const totalDurationMinutes = diffMinutes(params.departedAt, params.completedAt);
  return { travelDurationMinutes, workDurationMinutes, totalDurationMinutes, pauseTotalMinutes: pauseTotal };
}
