/** Field construction workflow (engineer dashboard). */

export const FIELD_STATUSES = [
  "pending",
  "en_route",
  "in_progress",
  "paused",
  "completed",
] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const FIELD_STATUS_LABELS: Record<FieldStatus, string> = {
  pending: "待出發",
  en_route: "出發中",
  in_progress: "施工中",
  paused: "暫停施工",
  completed: "已完成",
};

export const PAUSE_REASONS = [
  "客戶不在",
  "缺料",
  "天候因素",
  "現場條件不符",
  "等待原廠",
  "其他",
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export const UNABLE_REASONS = ["客戶不在", "客戶要求改期", "缺料", "其他"] as const;
export type UnableReason = (typeof UNABLE_REASONS)[number];

export const COMPLETION_CHECKLIST_KEYS = [
  "siteDone",
  "signed",
  "warranty",
  "materials",
  "photos",
] as const;
export type CompletionChecklistKey = (typeof COMPLETION_CHECKLIST_KEYS)[number];

export const COMPLETION_CHECKLIST_LABELS: Record<CompletionChecklistKey, string> = {
  siteDone: "已完成現場施工",
  signed: "客戶已在紙本派工單簽名",
  warranty: "保固書已填寫／交付",
  materials: "使用機器與材料數量已確認",
  photos: "施工照片已傳到公司指定 LINE 群組",
};

export type CompletionChecklist = Record<CompletionChecklistKey, boolean>;

export function emptyCompletionChecklist(): CompletionChecklist {
  return {
    siteDone: false,
    signed: false,
    warranty: false,
    materials: false,
    photos: false,
  };
}

export function isChecklistComplete(c: CompletionChecklist | null | undefined): boolean {
  if (!c) return false;
  return COMPLETION_CHECKLIST_KEYS.every((k) => c[k] === true);
}

export const BACKFILL_STEPS = [
  "depart",
  "arrive",
  "pause",
  "resume",
  "complete",
] as const;
export type BackfillStep = (typeof BACKFILL_STEPS)[number];

export const BACKFILL_STEP_LABELS: Record<BackfillStep, string> = {
  depart: "出發中",
  arrive: "已到場",
  pause: "暫停施工",
  resume: "恢復施工",
  complete: "施工完成",
};

export const WORKFLOW_STATUSES = ["pending_admin", "admin_done"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface PauseInterval {
  pausedAt: string;
  resumedAt: string | null;
  reason: string;
  note: string | null;
}

/** Reasonable travel time before reminding engineer to mark arrived (minutes). */
export const TRAVEL_REMIND_MINUTES = 90;
/** On-site work without update reminder (minutes). */
export const ONSITE_STALE_MINUTES = 180;
