import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  AssistedProgram,
  SubsidyPipelineStatus,
  SubsidyType,
} from "../../../shared/adminWorkflowConstants.ts";
import type { SubsidyDisplayStatus } from "../../../shared/subsidyDocs.ts";

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
  subsidyType?: SubsidyType | null;
  subsidyTypeLabel?: string;
  assistedProgram?: AssistedProgram | null;
  assistedProgramLabel?: string | null;
  subsidyPipelineStatus?: SubsidyPipelineStatus | null;
  subsidyStatusLabel?: string;
  canClose?: boolean;
  closeBlockers?: string[];
  adminWorkflowStatus?: string | null;
  adminWorkflowLabel?: string | null;
  subsidyApplicationId?: number | null;
  closeOverrideAt?: string | null;
  uploadLinkToken?: string | null;
  uploadLinkSentAt?: string | null;
  uploadUrl?: string | null;
  appliedAt?: string | null;
  appliedBy?: number | null;
  missingDocs?: string[];
  missingDocLabels?: string[];
  uploadedDocCount?: number;
  lastUploadAt?: string | null;
  needsManualReview?: boolean;
  aiTips?: string[];
  subsidyDisplayStatus?: SubsidyDisplayStatus;
  /** Display-only: completed + receivable but no subsidy_applications row */
  virtualPendingConfirmation?: boolean;
  needsSubsidy?: boolean;
  canMarkApplied?: boolean;
  canCloseReady?: boolean;
  customerDocumentCount?: number;
  customerDocuments?: Array<{
    id: number;
    docType: string;
    docTypeLabel?: string | null;
    fileName: string | null;
    fileUrl: string | null;
    status: string;
    note: string | null;
    uploadedAt: string | null;
  }>;
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
    subsidyPendingConfirmation: AdminWorkbenchItem[];
    subsidyLinkNotSent: AdminWorkbenchItem[];
    subsidyAwaitingUpload: AdminWorkbenchItem[];
    subsidyDocsIncomplete: AdminWorkbenchItem[];
    subsidyAwaitingManualReview: AdminWorkbenchItem[];
    subsidyDocsComplete: AdminWorkbenchItem[];
    subsidyPendingApply: AdminWorkbenchItem[];
    subsidyApplied: AdminWorkbenchItem[];
    subsidySettled: AdminWorkbenchItem[];
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
    expectedPaymentDate?: string | null;
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

export function setAdminExpectedPaymentDate(workOrderId: number, expectedPaymentDate: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/expected-payment-date`, {
    method: "POST",
    body: JSON.stringify({ expectedPaymentDate }),
    headers: { "Content-Type": "application/json" },
  });
}

export function setAdminSubsidyType(
  workOrderId: number,
  subsidyType: SubsidyType,
  opts?: { assistedProgram?: AssistedProgram | null; note?: string },
) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/subsidy-type`, {
    method: "POST",
    body: JSON.stringify({
      subsidyType,
      assistedProgram: opts?.assistedProgram,
      note: opts?.note,
    }),
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

export function unmarkAdminSubsidyApplied(workOrderId: number, note?: string) {
  return customFetch(`/api/admin-workbench/${workOrderId}/subsidy-unmark-applied`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function confirmAdminSubsidyDocs(workOrderId: number, note?: string) {
  return customFetch(`/api/admin-workbench/${workOrderId}/subsidy-manual-confirm`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function regenerateAdminSubsidyToken(workOrderId: number, force = false) {
  return customFetch<{ token: string; uploadUrl: string; regenerated: boolean }>(
    `/api/admin-workbench/${workOrderId}/subsidy-regenerate-token`,
    {
      method: "POST",
      body: JSON.stringify({ force }),
      headers: { "Content-Type": "application/json" },
    },
  );
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

export function cancelAdminPaid(workOrderId: number, reason?: string) {
  return customFetch<{ paymentStatus: string }>(`/api/admin-workbench/${workOrderId}/cancel-paid`, {
    method: "POST",
    body: JSON.stringify({ reason }),
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

export function reopenAdminClosed(workOrderId: number, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/reopen`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}
