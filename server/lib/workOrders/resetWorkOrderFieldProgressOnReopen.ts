import { eq } from "drizzle-orm";
import {
  db,
  workOrderFieldProgressTable,
  fieldProgressSnapshotsTable,
  type WorkOrderFieldProgress,
} from "@workspace/db";
import { logger } from "../logger.ts";

function hasProgressActivity(row: WorkOrderFieldProgress): boolean {
  return !!(
    row.departedAt ||
    row.arrivedAt ||
    row.completedAt ||
    row.unableToCompleteAt ||
    row.pausedAt
  );
}

/** Archive current progress rows, then reset all engineers to a fresh pending state. */
export async function resetWorkOrderFieldProgressOnReopen(workOrderId: number): Promise<number> {
  const rows = await db
    .select()
    .from(workOrderFieldProgressTable)
    .where(eq(workOrderFieldProgressTable.workOrderId, workOrderId));

  if (rows.length === 0) return 0;

  const now = new Date();

  for (const row of rows) {
    if (!hasProgressActivity(row)) continue;

    await db.insert(fieldProgressSnapshotsTable).values({
      workOrderId: row.workOrderId,
      engineerUserId: row.engineerUserId,
      engineerName: row.engineerName,
      departedAt: row.departedAt,
      arrivedAt: row.arrivedAt,
      completedAt: row.completedAt,
      unableToCompleteAt: row.unableToCompleteAt,
      unableReason: row.unableReason,
      unableNote: row.unableNote,
      travelDurationMinutes: row.travelDurationMinutes,
      workDurationMinutes: row.workDurationMinutes,
      totalDurationMinutes: row.totalDurationMinutes,
      sourceProgressId: row.id,
      archivedAt: now,
    });
  }

  await db
    .update(workOrderFieldProgressTable)
    .set({
      fieldStatus: "pending",
      departedAt: null,
      arrivedAt: null,
      pausedAt: null,
      resumedAt: null,
      completedAt: null,
      pauseReason: null,
      pauseNote: null,
      pauseTotalMinutes: 0,
      pauseIntervals: [],
      unableToCompleteAt: null,
      unableReason: null,
      unableNote: null,
      travelDurationMinutes: null,
      workDurationMinutes: null,
      totalDurationMinutes: null,
      completedBy: null,
      completionChecklist: null,
      workflowStatus: null,
      lastActionBy: null,
      updatedAt: now,
    })
    .where(eq(workOrderFieldProgressTable.workOrderId, workOrderId));

  logger.info({ workOrderId, engineerCount: rows.length }, "field progress reset on work order reopen");
  return rows.length;
}
