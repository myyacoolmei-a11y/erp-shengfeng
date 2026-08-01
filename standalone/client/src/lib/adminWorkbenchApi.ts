import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  SubsidyInvoiceKind,
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
  receivableId?: number | null;
  totalAmount?: string;
  receivedAmount?: string;
  unpaidAmount?: string;
  paymentStatus?: string | null;
  engineeringStatus?: string;
  engineeringStatusLabel?: string;
  receivableStatus?: string;
  receivableStatusLabel?: string;
  subsidyType?: SubsidyType | null;
  invoiceKind?: SubsidyInvoiceKind | null;
  invoiceKindLabel?: string | null;
  invoiceTitle?: string | null;
  taxId?: string | null;
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
  subsidyCompleted?: boolean;
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
  counts: Record<string, number>;
  sections: {
    pendingConstructionConfirm: AdminWorkbenchItem[];
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

export type AdminCaseDetail = {
  workOrderId: number;
  workOrderNumber?: string | null;
  customerName?: string | null;
  mobilePhone?: string | null;
  telephone?: string | null;
  installAddress?: string | null;
  invoiceTitle?: string | null;
  taxId?: string | null;
  receivableId?: number | null;
  totalAmount?: string;
  receivedAmount?: string;
  unpaidAmount?: string;
  paymentStatus?: string | null;
  invoiceKind?: SubsidyInvoiceKind | null;
  invoiceKindLabel?: string | null;
  subsidyPipelineStatus?: SubsidyPipelineStatus | null;
  subsidyStatusLabel?: string;
  subsidyCompleted?: boolean;
  appliedAt?: string | null;
  uploadUrl?: string | null;
  missingDocLabels?: string[];
  uploadedDocCount?: number;
  lastUploadAt?: string | null;
  aiTips?: string[];
  customerDocuments?: Array<{
    id: number;
    docType: string;
    docTypeLabel?: string | null;
    fileName: string | null;
    fileUrl: string | null;
    status: string;
    uploadedAt: string | null;
  }>;
};

export function fetchAdminWorkbench() {
  return customFetch<AdminWorkbenchData>("/api/admin-workbench");
}

export function fetchAdminCaseDetail(workOrderId: number) {
  return customFetch<AdminCaseDetail>(`/api/admin-workbench/${workOrderId}/case-detail`);
}

export function confirmAdminCompletion(workOrderId: number, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/confirm-completion`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}

export function setAdminSubsidyInvoiceKind(
  workOrderId: number,
  invoiceKind: SubsidyInvoiceKind,
) {
  return customFetch<{ invoiceKind: SubsidyInvoiceKind }>(
    `/api/admin-workbench/${workOrderId}/subsidy-invoice-kind`,
    {
      method: "POST",
      body: JSON.stringify({ invoiceKind }),
      headers: { "Content-Type": "application/json" },
    },
  );
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

export function reopenAdminClosed(workOrderId: number, note?: string) {
  return customFetch<{ ok: true }>(`/api/admin-workbench/${workOrderId}/reopen`, {
    method: "POST",
    body: JSON.stringify({ note }),
    headers: { "Content-Type": "application/json" },
  });
}
