/**
 * 派工單管理頁籤分類 — 前端列表與 API ?status= 共用。
 * 不改 DB 既有 status 值：待派工／施工中／進行中 一律歸入「待施工」。
 */

export const ADMIN_FILTER_TABS = ["待施工", "異常／暫停", "施工完成", "歷史紀錄"] as const;
export type AdminFilterTab = (typeof ADMIN_FILTER_TABS)[number];

const WO_COMPLETED = new Set(["已完成", "已結案"]);

const PENDING_STATUSES = new Set([
  "待施工",
  "待派工",
  "待處理",
  "施工中",
  "進行中",
]);

const PAUSED_STATUSES = new Set(["異常／暫停", "已取消", "暫停", "異常"]);

export function normalizeWoStatus(status: string | null | undefined): string {
  if (!status) return "待施工";
  if (status === "待處理") return "待施工";
  if (status === "進行中") return "施工中";
  if (status === "已取消" || status === "暫停" || status === "異常") return "異常／暫停";
  return status;
}

export function tabForWorkOrder(
  order: { status?: string | null; fieldStatus?: string | null; unableToCompleteAt?: string | null },
): AdminFilterTab {
  const s = normalizeWoStatus(order.status);
  if (s === "已結案") return "歷史紀錄";
  if (s === "已完成") return "施工完成";
  if (s === "異常／暫停" || order.fieldStatus === "paused" || order.unableToCompleteAt) {
    return "異常／暫停";
  }
  return "待施工";
}

export function matchesAdminFilter(
  order: { status?: string | null; fieldStatus?: string | null; unableToCompleteAt?: string | null },
  tab: AdminFilterTab,
): boolean {
  return tabForWorkOrder(order) === tab;
}

/** Expand a tab name or legacy status into DB status values the list API should include. */
export function statusesForListFilter(status: string | null | undefined): string[] {
  const raw = (status ?? "").trim();
  if (!raw) return [];

  if (raw === "施工完成" || raw === "已完成") return ["已完成"];
  if (raw === "歷史紀錄" || raw === "已結案") return ["已結案"];
  if (raw === "異常／暫停" || PAUSED_STATUSES.has(raw)) {
    return ["異常／暫停", "已取消", "暫停", "異常"];
  }
  if (raw === "待施工" || raw === "待派工" || raw === "施工中" || PENDING_STATUSES.has(raw)) {
    return ["待施工", "待派工", "待處理", "施工中", "進行中"];
  }
  return [raw];
}

/** Card badge: 待派工／施工中 顯示為待施工，不另立狀態。 */
export function listStatusBadge(status: string | null | undefined): string {
  const tab = tabForWorkOrder({ status });
  if (tab === "待施工") return "待施工";
  if (tab === "施工完成") return "已完成";
  if (tab === "歷史紀錄") return "已結案";
  return "異常／暫停";
}

export type ConstructionProgressLabel = "未開始" | "出發中" | "已到場" | "暫停施工" | "已完成";

export function constructionProgressLabel(
  fieldStatus: string | null | undefined,
): ConstructionProgressLabel {
  if (fieldStatus === "en_route") return "出發中";
  if (fieldStatus === "in_progress") return "已到場";
  if (fieldStatus === "paused") return "暫停施工";
  if (fieldStatus === "completed") return "已完成";
  return "未開始";
}

export function pickFieldStatus(
  rows: Array<{ fieldStatus?: string | null }>,
): string | null {
  if (!rows.length) return null;
  const statuses = rows.map((r) => r.fieldStatus ?? "pending");
  if (statuses.includes("paused")) return "paused";
  if (statuses.includes("in_progress")) return "in_progress";
  if (statuses.includes("en_route")) return "en_route";
  if (statuses.includes("completed")) return "completed";
  return statuses[0] ?? null;
}

export { WO_COMPLETED, PENDING_STATUSES };
