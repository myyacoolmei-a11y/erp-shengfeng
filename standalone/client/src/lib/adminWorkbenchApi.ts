import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  SubsidyPipelineStatus,
  SubsidyType,
} from "../../../shared/adminWorkflowConstants.ts";

export type AdminWorkbenchItem = {
  workOrderId: number;
  workOrderNumber?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  installAddress?: string | null;
  mobilePhone?: string | null;
  telephone?: string | null;
  engineerName?: string;
  quoteId?: number | null;
  completedAt?: string | null;
  hasPhotos?: boolean;
  hasSignature?: boolean;
  hasMaterials?: boolean;
  anomalyNote?: string | null;
  quoteOriginalAmount?: string;
  extraAmount?: string;
  discountAmount?: string;
  finalAmount?: string;
  invoiceNeeded?: boolean;
  billTo?: string | null;
  expectedPaymentDate?: string | null;
  receivableId?: number | null;
  totalAmount?: string;
  receivedAmount?: string;
  unpaidAmount?: string;
  paymentStatus?: string | null;
  overdueDays?: number | null;
  engineeringStatus?: string;
  engineeringStatusLabel?: string;
  receivableStatus?: string;
  receivableStatusLabel?: string;
  subsidyType?: SubsidyType;
  subsidyTypeLabel?: string;
  subsidyPipelineStatus?: SubsidyPipelineStatus | null;
  subsidyStatusLabel?: string;
  canClose?: boolean;
  closeBlockers?: string[];
  adminWorkflowStatus?: string | null;
  adminWorkflowLabel?: string | null;
  subsidyApplicationId?: number | null;
  closeOverrideAt?: string | null;
};

export type AdminWorkbenchData = {
  today: string;
  alerts: {
    hasOverdue: boolean;
    hasDueToday: boolean;
    overdueCount: number;
    dueTodayCount: number;
  };
  counts: Record<string, number>;
  sections: {
    pendingConstructionConfirm: AdminWorkbenchItem[];
    pendingCreateReceivable: AdminWorkbenchItem[];
    noDueDate: AdminWorkbenchItem[];
    collectionSoon: AdminWorkbenchItem[];
    collectionToday: AdminWorkbenchItem[];
    collectionOverdue: AdminWorkbenchItem[];
    collectionPartial: AdminWorkbenchItem[];
    subsidyLinkNotSent: AdminWorkbenchItem[];
    subsidyAwaitingUpload: AdminWorkbenchItem[];
    subsidyDocsIncomplete: AdminWorkbenchItem[];
    subsidyDocsComplete: AdminWorkbenchItem[];
    subsidyPendingApply: AdminWorkbenchItem[];
    pendingClose: AdminWorkbenchItem[];
    closed: AdminWorkbenchItem[];
  };
  todayStats: {
    confirmedToday: number;
    receivableCreatedToday: number;
    paidToday: number;
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
    subsidyType?: SubsidyType;
    note?: string;
  },
) {
  return customFetch<{ receivableId: number }>(`/api/admin-workbench/${workOrderId}/mark-billed`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

export function setAdminSubsidyType(workOrderId: number, subsidyType: SubsidyType, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/subsidy-type`, {
    method: "POST",
    body: JSON.stringify({ subsidyType, note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function advanceAdminSubsidyPipeline(
  workOrderId: number,
  status: SubsidyPipelineStatus,
  note?: string,
) {
  return customFetch(`/api/admin-workbench/${workOrderId}/subsidy-pipeline`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
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

export function approveAdminCloseOverride(workOrderId: number, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/close-override`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function completeAdminClose(workOrderId: number, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/complete-close`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}
