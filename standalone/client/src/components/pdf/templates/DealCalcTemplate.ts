import { COMPANY, COLORS, esc, fmtMoney, PDF_LAYOUT_CSS } from "./brand-config";
import type {
  AiExplanationResult,
  BuyerCalcResult,
  DealCalcAgentContact,
  GovernmentBenefitMatch,
  SellerCalcResult,
} from "../../../../../shared/dealCalc/types.ts";

export interface DealCalcPdfData {
  calcType: "buyer" | "seller";
  customerName?: string;
  result: BuyerCalcResult | SellerCalcResult;
  benefits?: GovernmentBenefitMatch[];
  aiExplanation?: AiExplanationResult | null;
  agentContact?: DealCalcAgentContact | null;
}

function benefitRows(benefits: GovernmentBenefitMatch[] = []): string {
  if (!benefits.length) {
    return `<tr><td colspan="3" class="muted">尚無匹配項目，請點選「查看政府優惠」進一步確認。</td></tr>`;
  }
  return benefits
    .map(
      b => `<tr>
        <td>${esc(b.name)}</td>
        <td>${esc(b.statusLabel)}</td>
        <td class="small">${esc(b.mainConditions)}${b.missingData.length ? `<br><span class="muted">缺：${esc(b.missingData.join("、"))}</span>` : ""}</td>
      </tr>`,
    )
    .join("");
}

function buyerRows(result: BuyerCalcResult): string {
  const tc = result.transactionCosts;
  return `
    <tr><td>房屋總價</td><td class="tar fw7">${fmtMoney(result.propertyPrice)}</td></tr>
    <tr><td>頭期款</td><td class="tar">${fmtMoney(result.downPayment)}</td></tr>
    <tr><td>貸款金額</td><td class="tar">${fmtMoney(result.loanAmount)}</td></tr>
    <tr><td>每月房貸</td><td class="tar fw7">${fmtMoney(result.monthlyPayment)}</td></tr>
    <tr><td>貸款年限 / 利率</td><td class="tar">${result.loanTermYears} 年 / ${result.annualInterestRate}%</td></tr>
    <tr><td>契稅（概算）</td><td class="tar">${fmtMoney(tc.deedTax)}</td></tr>
    <tr><td>印花稅（概算）</td><td class="tar">${fmtMoney(tc.stampTax)}</td></tr>
    <tr><td>代書費（概算）</td><td class="tar">${fmtMoney(tc.notaryFee)}</td></tr>
    <tr><td>仲介費（概算）</td><td class="tar">${fmtMoney(tc.agentFee)}</td></tr>
    <tr><td>預估交易成本合計</td><td class="tar fw7">${fmtMoney(tc.total)}</td></tr>
    <tr class="highlight"><td>建議準備現金</td><td class="tar fw7">${fmtMoney(result.suggestedCash)}</td></tr>
  `;
}

function sellerRows(result: SellerCalcResult): string {
  return `
    <tr><td>購入價格</td><td class="tar">${fmtMoney(result.purchasePrice)}</td></tr>
    <tr><td>出售價格</td><td class="tar fw7">${fmtMoney(result.salePrice)}</td></tr>
    <tr><td>持有時間</td><td class="tar">${result.holdingYears} 年</td></tr>
    <tr><td>預估房地合一稅</td><td class="tar">${fmtMoney(result.estimatedCapitalGainsTax)}</td></tr>
    <tr><td>預估土地增值稅</td><td class="tar">${fmtMoney(result.estimatedLandValueIncrementTax)}</td></tr>
    <tr><td>交易費用</td><td class="tar">${fmtMoney(result.transactionFees)}</td></tr>
    <tr><td>仲介費</td><td class="tar">${fmtMoney(result.agentFee)}</td></tr>
    <tr><td>代書費</td><td class="tar">${fmtMoney(result.notaryFee)}</td></tr>
    <tr><td>貸款清償金額</td><td class="tar">${fmtMoney(result.loanPayoff)}</td></tr>
    <tr class="highlight"><td>預估實拿金額</td><td class="tar fw7">${fmtMoney(result.estimatedNetProceeds)}</td></tr>
  `;
}

export function buildDealCalcHtml(data: DealCalcPdfData): string {
  const title = data.calcType === "buyer" ? "購屋試算書" : "售屋試算書";
  const docNo = `DC-${data.calcType === "buyer" ? "B" : "S"}-${Date.now().toString().slice(-8)}`;
  const printDate = new Date().toLocaleDateString("zh-TW");
  const agent = data.agentContact ?? {
    name: COMPANY.bankAccountName,
    phone: COMPANY.phone.replace("Tel：", ""),
    email: COMPANY.email,
    company: COMPANY.name,
  };
  const result = data.result;
  const disclaimers = [
    ...(result.disclaimers ?? []),
    ...(data.aiExplanation?.disclaimers ?? []),
    "實際資格、利率、額度及期限，以主管機關與承貸銀行最新審核結果為準。",
    "本文件不保證核貸、稅額或優惠資格，僅供現場說明參考。",
  ];

  const aiText = data.aiExplanation?.professional ?? data.aiExplanation?.simple ?? "";

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${title} ${docNo}</title>
<style>
${PDF_LAYOUT_CSS}
body{font-family:"Noto Sans TC",sans-serif;color:${COLORS.black};font-size:11pt;line-height:1.5}
.page{width:720px;margin:0 auto;padding:24px 28px;background:#fff}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${COLORS.primary};padding-bottom:12px;margin-bottom:16px}
.hdr h1{font-size:20pt;margin:0;color:${COLORS.black}}
.hdr .sub{font-size:9pt;color:${COLORS.midGray}}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:10pt}
.meta .box{background:${COLORS.bgLight};padding:10px 12px;border-radius:6px}
.section{margin-bottom:14px}
.section h2{font-size:12pt;color:${COLORS.primaryDark};border-left:4px solid ${COLORS.primary};padding-left:8px;margin:0 0 8px}
table{width:100%;border-collapse:collapse;font-size:10pt}
th,td{border:1px solid ${COLORS.borderGray};padding:6px 8px}
th{background:${COLORS.bgLight};text-align:left}
.tar{text-align:right}
.fw7{font-weight:700}
.highlight td{background:#f0fbe8}
.muted{color:${COLORS.lightGray};font-size:9pt}
.ai-box{background:#fafafa;border:1px solid ${COLORS.borderGray};padding:10px 12px;border-radius:6px;white-space:pre-wrap;font-size:9.5pt}
.disclaimer{margin-top:16px;padding:10px;background:#fff8e6;border:1px solid #f0d78c;border-radius:6px;font-size:8.5pt;color:#664d03}
.disclaimer li{margin:2px 0}
.footer{margin-top:20px;padding-top:10px;border-top:1px solid ${COLORS.borderGray};font-size:9pt;color:${COLORS.midGray}}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div>
      <h1>${title}</h1>
      <div class="sub">AI 成交試算中心 · ${esc(COMPANY.shortName)}</div>
    </div>
    <div class="sub" style="text-align:right">
      編號：${docNo}<br>
      列印日期：${printDate}
    </div>
  </div>

  <div class="meta">
    <div class="box">
      <strong>客戶姓名</strong><br>${esc(data.customerName || "—")}
    </div>
    <div class="box">
      <strong>房仲聯絡</strong><br>
      ${esc(agent.name)}<br>
      ${esc(agent.phone)}${agent.email ? `<br>${esc(agent.email)}` : ""}
      ${agent.company ? `<br>${esc(agent.company)}` : ""}
    </div>
  </div>

  <div class="section">
    <h2>試算結果（概算）</h2>
    <table>
      <tbody>
        ${data.calcType === "buyer" ? buyerRows(result as BuyerCalcResult) : sellerRows(result as SellerCalcResult)}
      </tbody>
    </table>
  </div>

  ${data.calcType === "buyer" ? `
  <div class="section">
    <h2>政府優惠提示</h2>
    <table>
      <thead><tr><th>優惠名稱</th><th>狀態</th><th>主要條件</th></tr></thead>
      <tbody>${benefitRows(data.benefits)}</tbody>
    </table>
  </div>` : ""}

  <div class="section">
    <h2>AI 解說（專業版）</h2>
    <div class="ai-box">${esc(aiText)}</div>
  </div>

  <div class="disclaimer">
    <strong>免責聲明</strong>
    <ul>
      ${disclaimers.map(d => `<li>${esc(d)}</li>`).join("")}
    </ul>
  </div>

  <div class="footer">
    ${esc(COMPANY.name)} · ${esc(COMPANY.address)} · ${esc(COMPANY.phone)}
  </div>
</div>
</body>
</html>`;
}
