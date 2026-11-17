import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type {
  AdminBucket,
  CaseProgressStep,
  EngineeringBucket,
  ProgressTone,
  SalesBucket,
  SubsidyAcceptanceChecklist,
} from "../../../shared/operationCenterConstants.ts";

export type OpBucketCount = { id: string; label: string; count: number };

export type OperationCenterOverview = {
  today: string;
  engineering: OpBucketCount[];
  admin: OpBucketCount[];
  sales: OpBucketCount[];
};

export type OperationCaseItem = {
  workOrderId: number;
  workOrderNumber: string | null;
  customerName: string | null;
  installAddress: string | null;
  mobilePhone: string | null;
  scheduledDate: string | null;
  status: string | null;
  fieldStatus: string | null;
  paymentStatus: string | null;
  totalAmount: string | null;
  unpaidAmount: string | null;
  subsidyPipeline: string | null;
  summary: string;
  progress: Array<{ step: CaseProgressStep; label: string; tone: ProgressTone }>;
  lFolderCreated: boolean;
  mofCompleted: boolean;
  moeaRequired: boolean;
  moeaCompleted: boolean;
  docsComplete: boolean;
  subsidyDone: boolean;
};

export type OperationCenterCases = {
  department: "engineering" | "admin" | "sales";
  bucket: string;
  label: string;
  items: OperationCaseItem[];
};

export type CaseTimelineEntry = {
  at: string;
  operator: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  source: "field_progress" | "audit";
};

export type CaseDetailTimeline = {
  case: OperationCaseItem;
  progress: OperationCaseItem["progress"];
  timeline: CaseTimelineEntry[];
  acceptance: {
    moeaRequired: boolean;
    checklist: SubsidyAcceptanceChecklist | null;
    flags: Record<string, boolean> | null;
    appliedAt: string | null;
    appliedBy: number | null;
  };
};

export function fetchOperationCenter() {
  return customFetch<OperationCenterOverview>("/api/operation-center");
}

export function fetchOperationCenterCases(
  department: "engineering" | "admin" | "sales",
  bucket: EngineeringBucket | AdminBucket | SalesBucket | string,
) {
  return customFetch<OperationCenterCases>(
    `/api/operation-center/cases?department=${encodeURIComponent(department)}&bucket=${encodeURIComponent(bucket)}`,
  );
}

export function fetchCaseTimeline(workOrderId: number) {
  return customFetch<CaseDetailTimeline>(`/api/operation-center/cases/${workOrderId}`);
}

export function updateSubsidyProcessFlags(
  workOrderId: number,
  patch: Partial<{
    lFolderCreated: boolean;
    mofCompleted: boolean;
    moeaRequired: boolean;
    moeaCompleted: boolean;
    adminLineAlbumCreated: boolean;
    mofScreenshotSaved: boolean;
    moeaScreenshotSaved: boolean;
    arAmountConfirmed: boolean;
  }>,
) {
  return customFetch(`/api/admin-workbench/${workOrderId}/subsidy-process-flags`, {
    method: "POST",
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
  });
}

export function confirmSubsidyAcceptance(
  workOrderId: number,
  checklist: SubsidyAcceptanceChecklist,
  note?: string,
) {
  return customFetch(`/api/admin-workbench/${workOrderId}/subsidy-acceptance`, {
    method: "POST",
    body: JSON.stringify({ checklist, note }),
    headers: { "Content-Type": "application/json" },
  });
}
