/** Quote lifecycle status helpers (ERP quotes, not wholesale). */

export {
  QUOTE_STATUS_PENDING,
  QUOTE_STATUS_WON,
  QUOTE_STATUS_LOST,
  QUOTE_STATUSES,
  QUOTE_LIST_TABS,
  QUOTE_LOST_REASONS,
  normalizeQuoteStatus,
  isQuoteWon,
  isQuoteLost,
  isQuotePending,
  quoteStatusLabel,
  quoteListTab,
  formatLostReason,
} from "../../shared/quoteStatus";

export type { QuoteLifecycleStatus, QuoteListTab, QuoteLostReason } from "../../shared/quoteStatus";

export function formatQuoteNumber(id: number, createdAt: unknown): string {
  const d = createdAt instanceof Date ? createdAt : createdAt ? new Date(String(createdAt)) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `Q-${ymd}-${String(id).padStart(4, "0")}`;
}
