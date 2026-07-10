import { db, auditLogsTable } from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import { auditActor } from "../receivables/receivablePaymentUtils.ts";

export async function writeAuditLog(opts: {
  action: string;
  entityType: string;
  entityId: number;
  user: JwtPayload;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const actor = auditActor(opts.user);
  await db.insert(auditLogsTable).values({
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId,
    userId: actor.userId,
    userDisplayName: actor.userDisplayName,
    reason: opts.reason ?? null,
    metadata: opts.metadata ?? null,
  });
}
