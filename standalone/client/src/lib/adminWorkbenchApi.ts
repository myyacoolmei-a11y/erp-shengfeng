import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type { ArchiveChecklist } from "../../../shared/adminWorkflowConstants.ts";

export type AdminWorkbenchItem = {
  workOrderId: number;
  workOrderNumber?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  installAddress?: string | null;
  mobilePhone?: string | null;
  telephone?: string | null;
  engineerName?: string;
  adminWorkflowStatus: string;
  completedAt?: string | null;
  hasPhotos?: boolean;
  hasSignature?: boolean;
  hasMaterials?: boolean;
  siteDone?: boolean;
  anomalyNote?: string | null;
  quoteOriginalAmount?: string;
  extraAmount?: string;
  discountAmount?: string;
  finalAmount?: string;
  invoiceNeeded?: boolean;
  billTo?: string | null;
  expectedPaymentDate?: string | null;
  needsSubsidy?: boolean;
  subsidyStatus?: string;
  subsidyAppliedAt?: string | null;
  subsidyNote?: string | null;
  receivableId?: number | null;
  totalAmount?: string;
  receivedAmount?: string;
  unpaidAmount?: string;
  billedAt?: string | null;
  paymentStatus?: string | null;
  overdueDays?: number | null;
  archiveChecklist?: ArchiveChecklist | null;
};

export type AdminWorkbenchData = {
  today: string;
  alerts: {
    hasOverdue: boolean;
    hasDueToday: boolean;
    overdueCount: number;
    dueTodayCount: number;
  };
  counts: {
    overdue: number;
    dueToday: number;
    pendingAdminReview: number;
    pendingBilling: number;
    pendingSubsidy: number;
    pendingArchive: number;
    openTodos: number;
  };
  sections: {
    collectionOverdue: AdminWorkbenchItem[];
    collectionToday: AdminWorkbenchItem[];
    collectionSoon: AdminWorkbenchItem[];
    collectionPartial: AdminWorkbenchItem[];
    pendingAdminReview: AdminWorkbenchItem[];
    pendingBilling: AdminWorkbenchItem[];
    pendingSubsidy: AdminWorkbenchItem[];
    pendingArchive: AdminWorkbenchItem[];
  };
  todayStats: {
    confirmedToday: number;
    billedToday: number;
    paidToday: number;
    archivedToday: number;
    closedToday: number;
    openTodos: number;
  };
};

export function fetchAdminWorkbench() {
  return customFetch<AdminWorkbenchData>("/api/admin-workbench");
}

export function confirmAdminCompletion(workOrderId: number, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/confirm-completion`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function markAdminBilled(
  workOrderId: number,
  body: {
    extraAmount?: string;
    discountAmount?: string;
    finalAmount?: string;
    invoiceNeeded?: boolean;
    billTo?: string;
    expectedPaymentDate?: string;
    needsSubsidy?: boolean;
    note?: string;
  },
) {
  return customFetch<{ receivableId: number }>(`/api/admin-workbench/${workOrderId}/mark-billed`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

export function toggleAdminSubsidy(workOrderId: number, applied: boolean, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/subsidy`, {
    method: "POST",
    body: JSON.stringify({ applied, note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function recordAdminPayment(
  workOrderId: number,
  body: { amount: number; paymentDate: string; paymentMethod?: string; notes?: string },
) {
  return customFetch(`/api/admin-workbench/${workOrderId}/payment`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

export function markAdminPaid(workOrderId: number, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/mark-paid`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function completeAdminArchive(
  workOrderId: number,
  checklist: ArchiveChecklist,
  note?: string,
) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/complete-archive`, {
    method: "POST",
    body: JSON.stringify({ checklist, note }),
    headers: { "Content-Type": "application/json" },
  });
}
