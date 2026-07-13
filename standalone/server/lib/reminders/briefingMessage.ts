function fmtAmt(n: number): string {
  return `NT$${Math.round(n).toLocaleString("zh-TW")}`;
}

function receivableDueLabel(item: { isOverdue: boolean; overdueDays: number; daysUntilDue: number; expectedPaymentDate: string | null }): string {
  if (item.isOverdue) return `已逾期 ${item.overdueDays} 天`;
  if (item.expectedPaymentDate && item.daysUntilDue > 0) return `剩 ${item.daysUntilDue} 天`;
  if (item.expectedPaymentDate) return "今日到期";
  return "未設定到期日";
}

const MAX_ITEMS = 15;

export function buildPersonalizedMorningBriefingMessage(
  prefs: {
    receiveMorningBriefing: boolean;
    receiveAccountsReceivable: boolean;
    receiveQuoteFollowUp: boolean;
  },
  data: {
    pendingDispatch: Array<{ customerName: string; projectName: string; quoteDate: string; waitingDays: number }>;
    receivables: Array<{ customerName: string; unpaidAmount: number; isOverdue: boolean; overdueDays: number; daysUntilDue: number; expectedPaymentDate: string | null }>;
    quoteFollowUps: Array<{ customerName: string; quoteAmount: number; waitingDays: number }>;
  },
): string | null {
  const includeDispatch = prefs.receiveMorningBriefing;
  const includeReceivables = prefs.receiveAccountsReceivable;
  const includeQuotes = prefs.receiveQuoteFollowUp;

  if (!includeDispatch && !includeReceivables && !includeQuotes) {
    return null;
  }

  const hasDispatch = includeDispatch && data.pendingDispatch.length > 0;
  const hasReceivables = includeReceivables && data.receivables.length > 0;
  const hasQuotes = includeQuotes && data.quoteFollowUps.length > 0;

  if (!hasDispatch && !hasReceivables && !hasQuotes) {
    return "📊 晟風 AI 每日晨報\n\n✅ 今日沒有需要提醒的案件。";
  }

  const lines: string[] = ["📊 晟風 AI 每日晨報", ""];

  if (includeDispatch) {
    lines.push("① 待派工案件（已報價、未建立派工單）");
    if (data.pendingDispatch.length === 0) {
      lines.push("（本項無待處理案件）");
    } else {
      for (const item of data.pendingDispatch.slice(0, MAX_ITEMS)) {
        lines.push(
          "",
          `・${item.customerName}`,
          `  ${item.projectName}`,
          `  報價日期：${item.quoteDate}`,
          `  已等待 ${item.waitingDays} 天`,
        );
      }
      if (data.pendingDispatch.length > MAX_ITEMS) {
        lines.push("", `…還有 ${data.pendingDispatch.length - MAX_ITEMS} 筆`);
      }
    }
    lines.push("", "────────────", "");
  }

  if (includeReceivables) {
    lines.push("② 應收帳款");
    if (data.receivables.length === 0) {
      lines.push("（本項無待處理案件）");
    } else {
      const totalUnpaid = data.receivables.reduce((sum, item) => sum + item.unpaidAmount, 0);
      lines.push(
        `未收款總筆數：${data.receivables.length} 筆`,
        `未收總金額：${fmtAmt(totalUnpaid)}`,
        "",
      );
      for (const item of data.receivables.slice(0, MAX_ITEMS)) {
        lines.push(
          `・${item.customerName}`,
          `  應收 ${fmtAmt(item.unpaidAmount)}`,
          `  ${receivableDueLabel(item)}`,
        );
      }
      if (data.receivables.length > MAX_ITEMS) {
        lines.push("", `…還有 ${data.receivables.length - MAX_ITEMS} 筆`);
      }
    }
    lines.push("", "────────────", "");
  }

  if (includeQuotes) {
    lines.push("③ 報價追蹤（已送出・未成交・未取消・未派工）");
    if (data.quoteFollowUps.length === 0) {
      lines.push("（本項無待處理案件）");
    } else {
      for (const item of data.quoteFollowUps.slice(0, MAX_ITEMS)) {
        lines.push(
          "",
          `・${item.customerName}`,
          `  報價 ${fmtAmt(item.quoteAmount)}`,
          `  已等待 ${item.waitingDays} 天`,
        );
      }
      if (data.quoteFollowUps.length > MAX_ITEMS) {
        lines.push("", `…還有 ${data.quoteFollowUps.length - MAX_ITEMS} 筆`);
      }
    }
  }

  return lines.join("\n");
}

export function buildMorningBriefingMessage(data: {
  pendingDispatch: Array<{ customerName: string; projectName: string; quoteDate: string; waitingDays: number }>;
  receivables: Array<{ customerName: string; unpaidAmount: number; isOverdue: boolean; overdueDays: number; daysUntilDue: number; expectedPaymentDate: string | null }>;
  quoteFollowUps: Array<{ customerName: string; quoteAmount: number; waitingDays: number }>;
}): string {
  const hasAny =
    data.pendingDispatch.length > 0 ||
    data.receivables.length > 0 ||
    data.quoteFollowUps.length > 0;

  if (!hasAny) {
    return "📊 晟風 AI 每日晨報\n\n✅ 今日沒有需要提醒的案件。";
  }

  const lines: string[] = ["📊 晟風 AI 每日晨報", ""];

  lines.push("① 待派工案件（已報價、未建立派工單）");
  if (data.pendingDispatch.length === 0) {
    lines.push("（本項無待處理案件）");
  } else {
    for (const item of data.pendingDispatch.slice(0, MAX_ITEMS)) {
      lines.push(
        "",
        `・${item.customerName}`,
        `  ${item.projectName}`,
        `  報價日期：${item.quoteDate}`,
        `  已等待 ${item.waitingDays} 天`,
      );
    }
    if (data.pendingDispatch.length > MAX_ITEMS) {
      lines.push("", `…還有 ${data.pendingDispatch.length - MAX_ITEMS} 筆`);
    }
  }

  lines.push("", "────────────", "");
  lines.push("② 應收帳款");

  if (data.receivables.length === 0) {
    lines.push("（本項無待處理案件）");
  } else {
    const totalUnpaid = data.receivables.reduce((sum, item) => sum + item.unpaidAmount, 0);
    lines.push(
      `未收款總筆數：${data.receivables.length} 筆`,
      `未收總金額：${fmtAmt(totalUnpaid)}`,
      "",
    );
    for (const item of data.receivables.slice(0, MAX_ITEMS)) {
      lines.push(
        `・${item.customerName}`,
        `  應收 ${fmtAmt(item.unpaidAmount)}`,
        `  ${receivableDueLabel(item)}`,
      );
    }
    if (data.receivables.length > MAX_ITEMS) {
      lines.push("", `…還有 ${data.receivables.length - MAX_ITEMS} 筆`);
    }
  }

  lines.push("", "────────────", "");
  lines.push("③ 報價追蹤（已送出・未成交・未取消・未派工）");

  if (data.quoteFollowUps.length === 0) {
    lines.push("（本項無待處理案件）");
  } else {
    for (const item of data.quoteFollowUps.slice(0, MAX_ITEMS)) {
      lines.push(
        "",
        `・${item.customerName}`,
        `  報價 ${fmtAmt(item.quoteAmount)}`,
        `  已等待 ${item.waitingDays} 天`,
      );
    }
    if (data.quoteFollowUps.length > MAX_ITEMS) {
      lines.push("", `…還有 ${data.quoteFollowUps.length - MAX_ITEMS} 筆`);
    }
  }

  return lines.join("\n");
}

export function buildEveningReminderMessage(
  receivables: Array<{ customerName: string; unpaidAmount: number; isOverdue: boolean; overdueDays: number; daysUntilDue: number; expectedPaymentDate: string | null }>,
): string {
  if (receivables.length === 0) {
    return "💰 晚間收款提醒\n\n✅ 今日沒有需要提醒的案件。";
  }

  const totalUnpaid = receivables.reduce((sum, item) => sum + item.unpaidAmount, 0);
  const lines: string[] = ["💰 晚間收款提醒", "", "今日仍未收款：", ""];

  for (const item of receivables.slice(0, MAX_ITEMS)) {
    lines.push(
      `・${item.customerName}`,
      `  應收 ${fmtAmt(item.unpaidAmount)}`,
      `  ${receivableDueLabel(item)}`,
      "",
    );
  }

  if (receivables.length > MAX_ITEMS) {
    lines.push(`…還有 ${receivables.length - MAX_ITEMS} 筆`, "");
  }

  lines.push(
    "────────────",
    "今日未收款：",
    `${receivables.length} 筆`,
    "未收總金額：",
    fmtAmt(totalUnpaid),
  );

  return lines.join("\n");
}
