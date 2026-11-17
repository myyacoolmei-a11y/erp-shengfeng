import type { JwtPayload } from "../auth.ts";

export function derivePaymentStatus(receivedAmount: number, totalAmount: number): string {
  if (receivedAmount <= 0) return "未收款";
  if (receivedAmount >= totalAmount) return "已收款";
  return "部分收款";
}

export function remainingAmount(totalAmount: number, receivedAmount: number): number {
  return Math.max(0, totalAmount - receivedAmount);
}

export function receivablePaymentNotes(receivableId: number, userNotes?: string): string {
  const receivableRef = `應收帳款 #${receivableId}`;
  const trimmed = userNotes?.trim();
  return trimmed ? `${trimmed} (${receivableRef})` : receivableRef;
}

export function legacyReceivableNotesPattern(receivableId: number): string {
  return `(應收帳款 #${receivableId})`;
}

export function auditActor(user: JwtPayload): { userId: number; userDisplayName: string } {
  return {
    userId: user.id,
    userDisplayName: user.displayName || user.username,
  };
}
