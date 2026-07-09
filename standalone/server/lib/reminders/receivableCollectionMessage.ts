import type {
  ReceivableReminderCategory,
  ReceivableReminderItem,
  ReceivableReminderSummary,
} from "../../../shared/reminders/types.ts";
import { addDays, diffDays, taipeiToday } from "./dateUtils.ts";

function fmtAmt(n: number): string {
  return `NT$${Math.round(n).toLocaleString("zh-TW")}`;
}

function paymentLabelFromNotes(notes: string | null | undefined, paymentMethod: string | null | undefined): string {
  const text = `${notes ?? ""} ${paymentMethod ?? ""}`;
  if (/尾款/.test(text)) return "尾款";
  if (/訂金|定金/.test(text)) return "訂金";
  if (/工程款/.test(text)) return "工程款";
  if (/分期/.test(text)) return "分期款";
  if (paymentMethod?.trim()) return paymentMethod.trim();
  return "款項";
}

function statusLine(item: ReceivableReminderItem): string {
  if (item.category === "overdue") {
    return `已逾期 ${item.overdueDays} 天`;
  }
  if (item.category === "due_today") {
    return "今天到期";
  }
  const days = item.daysUntilDue;
  return days <= 1 ? "明天到期" : `${days} 天內到期`;
}

export function buildReceivableCollectionMessage(
  summary: ReceivableReminderSummary,
  appBaseUrl: string,
): string {
  const lines: string[] = [
    "💰【晟風 AI 收款秘書】",
    "",
    `今日共有 ${summary.total} 筆款項需要追蹤。`,
    "",
    `🔴 已逾期：${summary.overdue} 筆`,
    `🟠 今日到期：${summary.dueToday} 筆`,
    `🟢 三天內到期：${summary.dueSoon} 筆`,
    "",
    "────────────",
  ];

  const order: ReceivableReminderCategory[] = ["overdue", "due_today", "due_soon"];
  const sorted = [...summary.items].sort((a, b) => {
    const ai = order.indexOf(a.category);
    const bi = order.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.expectedPaymentDate.localeCompare(b.expectedPaymentDate);
  });

  const maxItems = 25;
  for (const item of sorted.slice(0, maxItems)) {
    lines.push(
      "",
      item.customerName || "—",
      `${item.paymentLabel} ${fmtAmt(item.unpaidAmount)}`,
      statusLine(item),
    );
  }

  if (sorted.length > maxItems) {
    lines.push("", `…還有 ${sorted.length - maxItems} 筆，請至 ERP 查看`);
  }

  lines.push("", "────────────", "");
  const base = appBaseUrl.replace(/\/+$/, "");
  lines.push(base ? `👉 ${base}/receivables` : "👉 請登入 ERP 查看應收帳款");
  lines.push("", "點擊即可開啟 ERP 查看案件。");

  return lines.join("\n");
}

export function categorizeReceivable(
  expectedPaymentDate: string,
  today = taipeiToday(),
): ReceivableReminderCategory | null {
  if (expectedPaymentDate < today) return "overdue";
  if (expectedPaymentDate === today) return "due_today";
  const limit = addDays(today, 3);
  if (expectedPaymentDate > today && expectedPaymentDate <= limit) return "due_soon";
  return null;
}

export function mapReceivableRow(
  row: {
    id: number;
    customerName: string | null;
    projectName: string | null;
    totalAmount: string | number | null;
    receivedAmount: string | number | null;
    expectedPaymentDate: string | null;
    paymentMethod: string | null;
    notes: string | null;
    salesRepName: string | null;
    contactPhone: string | null;
  },
  appBaseUrl: string,
  today = taipeiToday(),
): ReceivableReminderItem | null {
  if (!row.expectedPaymentDate) return null;

  const category = categorizeReceivable(row.expectedPaymentDate, today);
  if (!category) return null;

  const total = parseFloat(String(row.totalAmount ?? "0"));
  const received = parseFloat(String(row.receivedAmount ?? "0"));
  const unpaid = Math.max(0, total - received);
  if (unpaid <= 0) return null;

  const base = appBaseUrl.replace(/\/+$/, "");
  const erpUrl = base ? `${base}/receivables?receivableId=${row.id}` : `/receivables?receivableId=${row.id}`;

  return {
    id: row.id,
    customerName: row.customerName ?? "—",
    projectName: row.projectName ?? "—",
    totalAmount: total,
    receivedAmount: received,
    unpaidAmount: unpaid,
    paymentLabel: paymentLabelFromNotes(row.notes, row.paymentMethod),
    paymentMethod: row.paymentMethod,
    expectedPaymentDate: row.expectedPaymentDate,
    overdueDays: category === "overdue" ? diffDays(row.expectedPaymentDate, today) : 0,
    daysUntilDue: category === "due_soon" ? diffDays(today, row.expectedPaymentDate) : 0,
    salesRepName: row.salesRepName,
    contactPhone: row.contactPhone,
    erpUrl,
    category,
  };
}

export function summarizeItems(items: ReceivableReminderItem[]): ReceivableReminderSummary {
  return {
    total: items.length,
    overdue: items.filter(i => i.category === "overdue").length,
    dueToday: items.filter(i => i.category === "due_today").length,
    dueSoon: items.filter(i => i.category === "due_soon").length,
    items,
  };
}
