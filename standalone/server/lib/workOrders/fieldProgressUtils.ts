import type { JwtPayload } from "../auth.ts";

export const UNABLE_REASONS = ["客戶不在", "客戶要求改期", "缺料", "其他"] as const;
export type UnableReason = (typeof UNABLE_REASONS)[number];

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

export function serializeFieldProgress(row: {
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
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    engineerUserId: row.engineerUserId,
    engineerName: row.engineerName,
    departedAt: isoOrNull(row.departedAt),
    arrivedAt: isoOrNull(row.arrivedAt),
    completedAt: isoOrNull(row.completedAt),
    unableToCompleteAt: isoOrNull(row.unableToCompleteAt),
    unableReason: row.unableReason,
    unableNote: row.unableNote,
    travelDurationMinutes: row.travelDurationMinutes,
    workDurationMinutes: row.workDurationMinutes,
    totalDurationMinutes: row.totalDurationMinutes,
    travelDurationLabel: formatDurationMinutes(row.travelDurationMinutes),
    workDurationLabel: formatDurationMinutes(row.workDurationMinutes),
    totalDurationLabel: formatDurationMinutes(row.totalDurationMinutes),
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
      createdAt: row.archivedAt,
      updatedAt: row.archivedAt,
    }),
    archivedAt: isoOrNull(row.archivedAt),
  };
}
