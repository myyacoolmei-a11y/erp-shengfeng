import { COMPANY, esc, fmtMoney } from "./brand-config";
import type { CustomerStatement } from "@/lib/wholesaleAccountApi";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return d.replace(/-/g, "/");
}

export function buildWholesaleMonthlyStatementHtml(stmt: CustomerStatement): string {
  const c = stmt.customer;
  const rows = stmt.lines.map(line => `
    <tr>
      <td>${esc(fmtDate(line.orderDate))}</td>
      <td>${esc(line.orderNumber ?? "—")}</td>
      <td>${esc(line.productName)}</td>
      <td style="text-align:center">${line.qty}</td>
      <td style="text-align:right">${fmtMoney(line.unitPrice)}</td>
      <td style="text-align:right">${fmtMoney(line.amount)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>批發月結對帳單 — ${esc(c.companyName)}</title>
<style>
  body{font-family:'Microsoft JhengHei','Heiti TC',sans-serif;color:#111;margin:0;padding:16mm;font-size:12px}
  h1{font-size:20px;letter-spacing:4px;margin:0 0 4px;text-align:center}
  .sub{text-align:center;color:#555;margin-bottom:16px}
  .meta p{margin:2px 0}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{border:1px solid #000;padding:6px;font-size:12px}
  th{background:#f3f3f3;text-align:left}
  .tot{width:280px;margin-left:auto;font-size:13px}
  .tot div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ddd}
  .tot .grand{font-weight:700;font-size:15px;border-bottom:none;margin-top:6px}
</style>
</head>
<body>
  <h1>${esc(COMPANY.name)}</h1>
  <p class="sub">批發月結對帳單</p>
  <div class="meta">
    <p><strong>客戶：</strong>${esc(c.billingCompanyName || c.companyName)}</p>
    <p><strong>統編：</strong>${esc(c.billingTaxId || c.taxId || "—")}</p>
    <p><strong>月份：</strong>${esc(stmt.monthLabel)}</p>
  </div>
  <div class="meta" style="margin-top:10px">
    <p>期初未收：${fmtMoney(stmt.previousOutstanding)}</p>
    <p>本期出貨：${fmtMoney(stmt.monthlySales)}</p>
    <p>本期收款：${fmtMoney(stmt.monthlyPaid)}</p>
    <p><strong>本期應收：${fmtMoney(stmt.totalOutstanding)}</strong></p>
  </div>
  <table>
    <thead>
      <tr>
        <th>日期</th><th>出貨單號</th><th>商品</th>
        <th style="text-align:center">數量</th>
        <th style="text-align:right">單價</th>
        <th style="text-align:right">金額</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="6" style="text-align:center">本月無出貨明細</td></tr>`}
    </tbody>
  </table>
  <div class="tot">
    <div><span>本期出貨合計</span><span>${fmtMoney(stmt.monthlySales)}</span></div>
    <div><span>已收款</span><span>${fmtMoney(stmt.monthlyPaid)}</span></div>
    <div><span>前期未收</span><span>${fmtMoney(stmt.previousOutstanding)}</span></div>
    <div class="grand"><span>本期應付總額</span><span>${fmtMoney(stmt.totalOutstanding)}</span></div>
  </div>
</body>
</html>`;
}
