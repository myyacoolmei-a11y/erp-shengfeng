import { logoUrl, COMPANY, COLORS, esc, fmtMoney, printFontLinksHtml, PRINT_CJK_FONT_STACK } from "./brand-config";
import { computeQuoteAmounts } from "../quote-amounts";
import { buildQuotationHtml } from "./QuotationTemplate";
import { groupIntentQuoteItems } from "../../../../../shared/quoteIntentLogic.ts";

export function buildPublicQuoteInteractiveHtml(
  quote: any,
  token: string,
  baseOrigin?: string,
  extra?: {
    formalShareUrl?: string | null;
    sourceIntentNumber?: string | null;
  },
): string {
  const docType = quote?.documentType === "intent" ? "intent" : "formal";
  if (docType === "intent") {
    return buildPublicIntentSelectionHtml(quote, token, baseOrigin, extra?.formalShareUrl);
  }
  return buildPublicFormalConfirmHtml(quote, token, baseOrigin, extra?.sourceIntentNumber);
}

function formatQuoteNo(quote: any): string {
  if (quote?.confirmedSnapshot?.quoteNumber) return quote.confirmedSnapshot.quoteNumber;
  const d = quote?.createdAt ? new Date(quote.createdAt) : new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `Q-${ymd}-${String(quote?.id ?? 0).padStart(4, "0")}`;
}

function buildPublicIntentSelectionHtml(
  quote: any,
  token: string,
  baseOrigin?: string,
  formalShareUrl?: string | null,
): string {
  const quoteNo = formatQuoteNo(quote);
  const d = quote?.createdAt ? new Date(quote.createdAt) : new Date();
  const quoteDate = d.toLocaleDateString("zh-TW");
  const taxType = quote?.taxType || "未稅";
  const discountAmount = Math.max(0, Number(quote?.discountAmount ?? 0));
  const versionNo = Number(quote?.confirmedVersion ?? 1);

  const items: any[] = Array.isArray(quote?.items) ? quote.items : [];
  const { candidateGroups, fixedItems } = groupIntentQuoteItems(items, quote?.intentGroups);
  const preselectedIds: number[] = Array.isArray(quote?.customerSelections?.selectedOptionIds)
    ? quote.customerSelections.selectedOptionIds.map((n: any) => Number(n))
    : items.filter((it) => it.isSelected).map((it) => Number(it.id));

  const groupsHtml = candidateGroups
    .map((grp, gIdx) => {
      const badgeText = grp.selectionMode === "multiple" ? "可複選" : "單選方案";
      const reqBadge = grp.required
        ? `<span class="badge badge-req">必選</span>`
        : `<span class="badge badge-opt">選配</span>`;

      const optionsHtml = grp.items
        .map((it) => {
          const id = Number(it.id);
          const qty = Math.max(0.01, Number(it.quantity) || 1);
          const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
          const installFee = Math.max(0, Number(it.installFee) || 0);
          const equipTotal = Math.round(qty * unitPrice);
          const optionTotal = equipTotal + Math.round(installFee);
          const inputType = grp.selectionMode === "multiple" ? "checkbox" : "radio";
          const checked = preselectedIds.includes(id) ? "checked" : "";

          return `
          <label class="option-card" data-option-card="${id}">
            <input
              type="${inputType}"
              name="grp_${esc(grp.groupId)}"
              value="${id}"
              data-group-id="${esc(grp.groupId)}"
              data-group-name="${esc(grp.groupName)}"
              data-required="${grp.required ? "1" : "0"}"
              data-mode="${grp.selectionMode}"
              data-equip-total="${equipTotal}"
              data-install-fee="${Math.round(installFee)}"
              data-option-total="${optionTotal}"
              data-label="${esc([it.brand, it.itemName, it.model].filter(Boolean).join(" "))}"
              ${checked}
            />
            <div class="option-body">
              <div class="option-top">
                <div class="option-title-wrap">
                  ${it.brand ? `<span class="brand-pill">${esc(it.brand)}</span>` : ""}
                  <span class="option-name">${esc(it.itemName || "工程方案")}</span>
                </div>
                <div class="option-price">NT$ ${optionTotal.toLocaleString()}</div>
              </div>
              <div class="option-meta">
                <span>型號：<strong>${esc(it.model || "—")}</strong></span>
                <span>數量：<strong>${qty} ${esc(it.unit || "台")}</strong></span>
                <span>設備價：NT$ ${equipTotal.toLocaleString()}（單價 ${fmtMoney(unitPrice)}）</span>
                <span>施工／安裝費：${installFee > 0 ? `NT$ ${Math.round(installFee).toLocaleString()}` : "已含／無另計"}</span>
              </div>
              ${it.workContent ? `<div class="option-work">施工內容：${esc(it.workContent)}</div>` : ""}
              ${it.notes ? `<div class="option-note">備註：${esc(it.notes)}</div>` : ""}
            </div>
          </label>`;
        })
        .join("");

      return `
      <section class="group-box" data-group-box="${esc(grp.groupId)}" data-required="${grp.required ? "1" : "0"}" data-group-name="${esc(grp.groupName)}">
        <div class="group-hdr">
          <div class="group-title">
            <span class="group-idx">${gIdx + 1}</span>
            <span>${esc(grp.groupName)}</span>
          </div>
          <div class="group-badges">
            ${reqBadge}
            <span class="badge">${badgeText}</span>
          </div>
        </div>
        <div class="options-grid">
          ${optionsHtml}
        </div>
      </section>`;
    })
    .join("");

  const fixedTotal = fixedItems.reduce((sum, it) => {
    const qty = Math.max(0.01, Number(it.quantity) || 1);
    const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
    const installFee = Math.max(0, Number(it.installFee) || 0);
    return sum + Math.round(qty * unitPrice) + Math.round(installFee);
  }, 0);

  const fixedHtml =
    fixedItems.length > 0
      ? `
      <section class="group-box">
        <div class="group-hdr">
          <div class="group-title"><span>基本／共用施工項目（固定包含）</span></div>
          <span class="badge">必含項目</span>
        </div>
        <div class="fixed-list">
          ${fixedItems
            .map((it) => {
              const qty = Math.max(0.01, Number(it.quantity) || 1);
              const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
              const installFee = Math.max(0, Number(it.installFee) || 0);
              const sub = Math.round(qty * unitPrice) + Math.round(installFee);
              return `<div class="fixed-row">
                <div>
                  <strong>${esc([it.brand, it.itemName].filter(Boolean).join(" "))}</strong>
                  ${it.model ? `<span class="muted">（${esc(it.model)}）</span>` : ""}
                  <span class="muted">× ${qty} ${esc(it.unit || "式")}</span>
                  ${it.notes ? `<div class="small muted">${esc(it.notes)}</div>` : ""}
                </div>
                <div class="fw6">NT$ ${sub.toLocaleString()}</div>
              </div>`;
            })
            .join("")}
        </div>
      </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="zh-TW" data-public-quote="intent-choice-v1">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>意向選擇單 ${esc(quoteNo)} — ${COMPANY.name}</title>
${printFontLinksHtml()}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:${PRINT_CJK_FONT_STACK};
  background:#f4f5f7;color:#111;line-height:1.5;
  padding-bottom:96px;
}
.container{max-width:820px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:18px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:14px}
.co{display:flex;align-items:center;gap:12px}
.co-logo{width:52px;height:52px;object-fit:contain;border-radius:6px;border:1px solid #eee}
.co-name{font-size:18px;font-weight:700}
.co-sub{font-size:12px;color:#666}
.doc-badge{display:inline-block;background:${COLORS.primary};color:#111;font-weight:700;font-size:13px;padding:4px 10px;border-radius:6px;letter-spacing:1px}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:14px}
.meta-item .lbl{font-size:12px;color:#6b7280;display:block}
.meta-item .val{font-weight:600;color:#111}
.group-box{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:16px;margin-bottom:14px}
.group-hdr{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
.group-title{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700}
.group-idx{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#111;color:#fff;font-size:12px;font-weight:700}
.group-badges{display:flex;gap:6px;align-items:center}
.badge{font-size:11px;padding:2px 8px;border-radius:999px;background:#f3f4f6;color:#374151;font-weight:600}
.badge-req{background:#fee2e2;color:#b91c1c}
.badge-opt{background:#e0f2fe;color:#0369a1}
.options-grid{display:flex;flex-direction:column;gap:10px}
.option-card{
  display:flex;align-items:flex-start;gap:12px;
  border:2px solid #e5e7eb;border-radius:10px;padding:14px;
  cursor:pointer;transition:all 0.15s ease;background:#fff;
}
.option-card:hover{border-color:#9ca3af}
.option-card.is-checked{border-color:#059669;background:#ecfdf5/40;box-shadow:0 0 0 1px #059669}
.option-card input{margin-top:4px;width:20px;height:20px;accent-color:#059669;flex-shrink:0}
.option-body{flex:1;min-width:0}
.option-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap}
.option-title-wrap{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.brand-pill{background:#111;color:#fff;font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px}
.option-name{font-size:15px;font-weight:700;color:#111}
.option-price{font-size:16px;font-weight:700;color:#059669;white-space:nowrap}
.option-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:#4b5563;margin-top:6px}
.option-work{margin-top:6px;font-size:13px;color:#1f2937;background:#f9fafb;padding:6px 10px;border-radius:6px}
.option-note{margin-top:4px;font-size:12px;color:#6b7280}
.fixed-list{display:flex;flex-direction:column;gap:8px}
.fixed-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed #e5e7eb;font-size:14px}
.fixed-row:last-child{border-bottom:none}
.muted{color:#6b7280}
.small{font-size:12px}
.fw6{font-weight:600}
.summary-box{background:#111;color:#fff;border-radius:12px;padding:16px;margin-top:14px}
.summary-row{display:flex;justify-content:space-between;font-size:14px;padding:4px 0;color:#d1d5db}
.summary-total{display:flex;justify-content:space-between;align-items:baseline;font-size:18px;font-weight:700;color:#fff;border-top:1px solid #374151;margin-top:8px;padding-top:10px}
.summary-total .val{color:${COLORS.primary};font-size:22px}
.btn-submit{
  width:100%;margin-top:14px;padding:15px 20px;border:none;border-radius:10px;
  background:#059669;color:#fff;font-size:16px;font-weight:700;cursor:pointer;
}
.btn-submit:disabled{background:#9ca3af;cursor:not-allowed}
.alert-banner{background:#ecfdf5;border:1px solid #10b981;color:#065f46;padding:14px;border-radius:10px;margin-bottom:14px;font-size:14px}
.alert-banner a{display:inline-block;margin-top:8px;background:#059669;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;font-weight:600}
.error-msg{color:#dc2626;font-size:14px;margin-top:8px;font-weight:600;display:none}
</style>
</head>
<body>
<div class="container">
  ${
    formalShareUrl
      ? `<div class="alert-banner">
          <div><strong>✓ 您已完成方案選擇並產生正式報價單！</strong></div>
          <div>可點選下方按鈕前往正式報價單進行確認與電子簽名，或重新調整下方選項更新報價單。</div>
          <a href="${esc(formalShareUrl)}">前往正式報價單確認／簽名 →</a>
        </div>`
      : ""
  }

  <div class="card">
    <div class="hdr">
      <div class="co">
        <img src="${logoUrl(baseOrigin)}" class="co-logo" alt="">
        <div>
          <div class="co-name">${COMPANY.name}</div>
          <div class="co-sub">${COMPANY.subTitle}｜${COMPANY.phone}</div>
          <div class="co-sub">${COMPANY.address}</div>
        </div>
      </div>
      <div style="text-align:right">
        <span class="doc-badge">意向選擇單</span>
        <div style="font-size:13px;font-weight:700;margin-top:6px">${esc(quoteNo)}（v${versionNo}）</div>
        <div style="font-size:12px;color:#6b7280">報價日期：${esc(quoteDate)}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item"><span class="lbl">客戶姓名</span><span class="val">${esc(quote.customerName || "—")}</span></div>
      <div class="meta-item"><span class="lbl">聯絡電話</span><span class="val">${esc(quote.customerPhone || "—")}</span></div>
      <div class="meta-item"><span class="lbl">工程名稱</span><span class="val">${esc(quote.title || "—")}</span></div>
      <div class="meta-item"><span class="lbl">負責業務</span><span class="val">${esc(quote.salesRepName || "—")}</span></div>
      <div class="meta-item" style="grid-column:1/-1"><span class="lbl">施工地址</span><span class="val">${esc(quote.address || "—")}</span></div>
    </div>
  </div>

  <form id="intentForm" onsubmit="return false;">
    ${groupsHtml}
    ${fixedHtml}

    ${
      quote.description || quote.notes
        ? `<div class="card">
            <div style="font-weight:700;margin-bottom:6px">工程說明與備註</div>
            ${quote.description ? `<div style="font-size:14px;white-space:pre-wrap;margin-bottom:6px">${esc(quote.description)}</div>` : ""}
            ${quote.notes ? `<div style="font-size:13px;color:#4b5563;white-space:pre-wrap">${esc(quote.notes)}</div>` : ""}
          </div>`
        : ""
    }

    <div class="summary-box">
      <div style="font-weight:700;font-size:15px;margin-bottom:6px">已選方案即時試算（${esc(taxType)}）</div>
      <div id="selectedListText" style="font-size:13px;color:#9ca3af;margin-bottom:8px">請勾選上方方案…</div>
      <div class="summary-row"><span>所選設備與施工小計</span><span id="sumRaw">NT$ 0</span></div>
      ${discountAmount > 0 ? `<div class="summary-row"><span>優惠折扣</span><span>- NT$ ${discountAmount.toLocaleString()}</span></div>` : ""}
      ${taxType === "不另加稅" ? "" : `<div class="summary-row"><span>未稅金額</span><span id="sumPreTax">NT$ 0</span></div>
      <div class="summary-row"><span>營業稅 (5%)</span><span id="sumTax">NT$ 0</span></div>`}
      <div class="summary-total"><span>${taxType === "不另加稅" ? "報價總計" : "含稅總計"}</span><span class="val" id="sumTotal">NT$ 0</span></div>
      <div id="errorMsg" class="error-msg"></div>
      <button type="button" id="submitBtn" class="btn-submit">確認選擇並產生正式報價</button>
    </div>
  </form>
</div>

<script>
(function(){
  var FIXED_TOTAL = ${fixedTotal};
  var DISCOUNT = ${discountAmount};
  var TAX_TYPE = ${JSON.stringify(taxType)};
  var EXPECTED_VERSION = ${versionNo};
  var SUBMIT_URL = "/api/public/quotes/" + encodeURIComponent(${JSON.stringify(token)}) + "/select";

  function computeTax(rawTotal, disc, taxType) {
    var d = Math.max(0, Number(disc) || 0);
    var afterDisc = Math.max(0, rawTotal - d);
    if (taxType === "不另加稅") return { preTax: afterDisc, taxAmt: 0, total: afterDisc };
    if (taxType === "含稅") {
      var pre = Math.round(afterDisc / 1.05);
      return { preTax: pre, taxAmt: afterDisc - pre, total: afterDisc };
    }
    var tax = Math.round(afterDisc * 0.05);
    return { preTax: afterDisc, taxAmt: tax, total: afterDisc + tax };
  }

  function fmt(n) {
    return "NT$ " + Math.round(n).toLocaleString("zh-TW");
  }

  function updateSummary() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll("#intentForm input[data-option-total]"));
    var selectedSum = 0;
    var labels = [];
    inputs.forEach(function(inp){
      var card = inp.closest(".option-card");
      if (inp.checked) {
        if (card) card.classList.add("is-checked");
        selectedSum += Number(inp.getAttribute("data-option-total") || 0);
        labels.push(inp.getAttribute("data-label") || "");
      } else {
        if (card) card.classList.remove("is-checked");
      }
    });

    var rawTotal = selectedSum + FIXED_TOTAL;
    var res = computeTax(rawTotal, DISCOUNT, TAX_TYPE);
    document.getElementById("sumRaw").textContent = fmt(rawTotal);
    if (document.getElementById("sumPreTax")) document.getElementById("sumPreTax").textContent = fmt(res.preTax);
    if (document.getElementById("sumTax")) document.getElementById("sumTax").textContent = fmt(res.taxAmt);
    document.getElementById("sumTotal").textContent = fmt(res.total);

    var missingGroups = [];
    var groupBoxes = Array.prototype.slice.call(document.querySelectorAll("[data-group-box]"));
    groupBoxes.forEach(function(box){
      if (box.getAttribute("data-required") === "1") {
        var checkedInGroup = box.querySelectorAll("input:checked").length;
        if (checkedInGroup === 0) {
          missingGroups.push(box.getAttribute("data-group-name") || "必選項目");
        }
      }
    });

    var listEl = document.getElementById("selectedListText");
    if (labels.length > 0) {
      listEl.textContent = "已選：" + labels.join("、");
      listEl.style.color = "#a7f3d0";
    } else {
      listEl.textContent = "尚未選擇方案";
      listEl.style.color = "#fca5a5";
    }

    var btn = document.getElementById("submitBtn");
    if (missingGroups.length > 0) {
      btn.disabled = true;
      btn.textContent = "請先選擇必選項目：" + missingGroups.join("、");
    } else {
      btn.disabled = false;
      btn.textContent = "確認選擇並產生正式報價";
    }
  }

  document.getElementById("intentForm").addEventListener("change", updateSummary);
  updateSummary();

  document.getElementById("submitBtn").addEventListener("click", function(){
    var errEl = document.getElementById("errorMsg");
    errEl.style.display = "none";
    var checked = Array.prototype.slice.call(document.querySelectorAll("#intentForm input[data-option-total]:checked"));
    var selectedItemIds = checked.map(function(inp){ return Number(inp.value); });
    var btn = document.getElementById("submitBtn");
    btn.disabled = true;
    btn.textContent = "正在產生正式報價單…";

    fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedItemIds: selectedItemIds,
        expectedVersion: EXPECTED_VERSION
      })
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(res){
        if (!res.ok || !res.data.success) {
          throw new Error(res.data.error || res.data.message || "提交失敗");
        }
        if (res.data.formalShareUrl) {
          window.location.href = res.data.formalShareUrl;
        } else {
          window.location.reload();
        }
      })
      .catch(function(err){
        errEl.textContent = err.message || "提交失敗，請重試";
        errEl.style.display = "block";
        updateSummary();
      });
  });
})();
</script>
</body>
</html>`;
}

function buildPublicFormalConfirmHtml(
  quote: any,
  token: string,
  baseOrigin?: string,
  sourceIntentNumber?: string | null,
): string {
  const quotationA4Html = buildQuotationHtml(quote, baseOrigin);
  const quoteNo = formatQuoteNo(quote);
  const versionNo = Number(quote?.confirmedSnapshot?.version ?? quote?.confirmedVersion ?? 1);
  const isConfirmed = Boolean(quote?.customerConfirmedAt || quote?.confirmedSnapshot);
  const confirmedAtStr = quote?.customerConfirmedAt
    ? new Date(quote.customerConfirmedAt).toLocaleString("zh-TW", { hour12: false })
    : "";
  const workOrderNo = quote?.workOrderNumber || (quote?.workOrderId ? `#${quote.workOrderId}` : "");
  const publicUrl = `${baseOrigin || ""}/api/public/quotes/${encodeURIComponent(token)}`;
  const printUrl = `${publicUrl}?print=1`;
  const lineShareText = encodeURIComponent(
    `【晟風工程正式報價單】\n單號：${quoteNo} (v${versionNo})\n客戶：${quote.customerName || "—"}\n查看與下載連結：\n${publicUrl}`,
  );

  // Inject interactive confirmation / signature panel right before </body> while keeping A4 print clean via .no-print
  const interactivePanel = isConfirmed
    ? `
    <div class="public-confirm-panel no-print" data-confirmed="true">
      <div class="confirm-card confirmed-banner">
        <div class="confirm-title">✓ 客戶已完成正式報價確認</div>
        <div class="confirm-meta">
          <span>正式報價單號：<strong>${esc(quoteNo)}（v${versionNo}）</strong></span>
          ${sourceIntentNumber ? `<span>來源意向單：<strong>${esc(sourceIntentNumber)}</strong></span>` : ""}
          <span>確認時間：<strong>${esc(confirmedAtStr)}</strong></span>
          ${workOrderNo ? `<span>已自動建立待安排派工單：<strong>${esc(workOrderNo)}</strong></span>` : ""}
        </div>
        <div class="confirm-actions">
          <button type="button" class="btn-action btn-primary" onclick="window.print()">列印／另存正式報價單 PDF</button>
          <a class="btn-action btn-line" href="https://line.me/R/msg/text/?${lineShareText}" target="_blank" rel="noopener">分享至 LINE</a>
          <a class="btn-action btn-outline" href="${esc(printUrl)}" target="_blank" rel="noopener">開啟純列印版頁面</a>
        </div>
      </div>
    </div>`
    : `
    <div class="public-confirm-panel no-print" id="confirmSection">
      <div class="confirm-card">
        <div class="confirm-title">【確認報價】線上簽署與確認</div>
        <p class="confirm-desc">
          請確認上方報價單之設備機型、施工內容與總金額無誤。完成確認與簽名後，系統將鎖定正式確認版本（v${versionNo}）並自動為您建立待安排派工單。
        </p>

        <label class="agree-row">
          <input type="checkbox" id="agreeCheckbox" />
          <span>我已詳細閱讀並同意本報價單之設備規格、施工內容、金額與注意事項（版本 v${versionNo}）。</span>
        </label>

        <div class="sig-pad-wrap">
          <div class="sig-pad-hdr">
            <span><strong>【手機手寫簽名】</strong>（支援手指觸控、觸控筆或滑鼠簽名）</span>
            <button type="button" id="clearSigBtn" class="btn-clear">清除重簽</button>
          </div>
          <div class="canvas-holder">
            <canvas id="sigCanvas" width="680" height="220"></canvas>
            <div id="sigPlaceholder" class="sig-placeholder">請在此區域手寫簽名</div>
          </div>
        </div>

        <div id="confirmError" class="confirm-error" style="display:none"></div>

        <div class="confirm-actions">
          <button type="button" id="confirmSubmitBtn" class="btn-action btn-confirm">【確認並送出】</button>
          <button type="button" class="btn-action btn-outline" onclick="window.print()">先列印／下載 PDF</button>
          <a class="btn-action btn-line" href="https://line.me/R/msg/text/?${lineShareText}" target="_blank" rel="noopener">分享至 LINE</a>
        </div>
      </div>
    </div>
    <script>
    (function(){
      var canvas = document.getElementById("sigCanvas");
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      var placeholder = document.getElementById("sigPlaceholder");
      var drawing = false;
      var hasSignature = false;
      var EXPECTED_VERSION = ${versionNo};
      var CONFIRM_URL = "/api/public/quotes/" + encodeURIComponent(${JSON.stringify(token)}) + "/confirm";

      function setupCtx() {
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2.6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
      setupCtx();

      function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        var clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
        };
      }

      function startDraw(e) {
        e.preventDefault();
        drawing = true;
        hasSignature = true;
        if (placeholder) placeholder.style.display = "none";
        var p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      }

      function moveDraw(e) {
        if (!drawing) return;
        e.preventDefault();
        var p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      function endDraw(e) {
        if (!drawing) return;
        e.preventDefault();
        drawing = false;
      }

      canvas.addEventListener("mousedown", startDraw);
      canvas.addEventListener("mousemove", moveDraw);
      window.addEventListener("mouseup", endDraw);
      canvas.addEventListener("touchstart", startDraw, { passive: false });
      canvas.addEventListener("touchmove", moveDraw, { passive: false });
      window.addEventListener("touchend", endDraw, { passive: false });

      document.getElementById("clearSigBtn").addEventListener("click", function(){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasSignature = false;
        if (placeholder) placeholder.style.display = "flex";
      });

      document.getElementById("confirmSubmitBtn").addEventListener("click", function(){
        var errEl = document.getElementById("confirmError");
        errEl.style.display = "none";
        var agreed = document.getElementById("agreeCheckbox").checked;
        if (!agreed) {
          errEl.textContent = "請先勾選「我已詳細閱讀並同意本報價單之設備規格、施工內容、金額與注意事項」";
          errEl.style.display = "block";
          return;
        }
        var sigDataUrl = hasSignature ? canvas.toDataURL("image/png") : null;
        var btn = document.getElementById("confirmSubmitBtn");
        btn.disabled = true;
        btn.textContent = "確認送出並建立派工單中…";

        fetch(CONFIRM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agreedTerms: true,
            expectedVersion: EXPECTED_VERSION,
            signatureDataUrl: sigDataUrl,
            confirmationMethod: hasSignature ? "electronic_signature" : "electronic_check"
          })
        })
          .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
          .then(function(res){
            if (!res.ok || !res.data.ok) {
              throw new Error(res.data.error || res.data.message || "確認失敗");
            }
            window.location.reload();
          })
          .catch(function(err){
            errEl.textContent = err.message || "確認失敗，請稍後再試";
            errEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "【確認並送出】";
          });
      });
    })();
    </script>`;

  const extraCss = `
<style>
.public-confirm-panel{
  width:186mm;max-width:100%;margin:6mm auto 12mm;padding:0 2mm;
  font-family:${PRINT_CJK_FONT_STACK};
}
.confirm-card{
  background:#f8fafc;border:2px solid #0f172a;border-radius:10px;padding:18px;
}
.confirmed-banner{
  background:#ecfdf5;border-color:#059669;
}
.confirm-title{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:6px}
.confirmed-banner .confirm-title{color:#065f46}
.confirm-desc{font-size:13.5px;color:#334155;margin-bottom:12px;line-height:1.5}
.confirm-meta{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:14px;color:#065f46;margin-bottom:14px}
.agree-row{
  display:flex;align-items:flex-start;gap:10px;
  background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:12px;
  font-size:14px;font-weight:600;color:#0f172a;cursor:pointer;margin-bottom:14px;
}
.agree-row input{width:20px;height:20px;margin-top:2px;accent-color:#059669;flex-shrink:0}
.sig-pad-wrap{margin-bottom:14px}
.sig-pad-hdr{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:6px}
.btn-clear{
  background:#fff;border:1px solid #94a3b8;border-radius:6px;padding:4px 12px;
  font-size:12.5px;font-weight:600;cursor:pointer;color:#334155;
}
.canvas-holder{
  position:relative;background:#fff;border:2px dashed #64748b;border-radius:8px;
  overflow:hidden;touch-action:none;
}
#sigCanvas{display:block;width:100%;height:180px;touch-action:none;cursor:crosshair}
.sig-placeholder{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:#94a3b8;font-size:15px;pointer-events:none;
}
.confirm-error{color:#dc2626;font-size:14px;font-weight:600;margin-bottom:10px}
.confirm-actions{display:flex;flex-wrap:wrap;gap:10px}
.btn-action{
  display:inline-flex;align-items:center;justify-content:center;
  padding:12px 20px;border-radius:8px;font-size:15px;font-weight:700;
  cursor:pointer;text-decoration:none;border:none;
}
.btn-confirm{background:#059669;color:#fff;flex:1 1 220px}
.btn-primary{background:#0f172a;color:#fff}
.btn-line{background:#06C755;color:#fff}
.btn-outline{background:#fff;color:#0f172a;border:1px solid #cbd5e1}
@media (max-width: 760px){
  html,body{width:100%!important;min-height:auto!important;padding:8px!important}
  .quotation-print-page{width:100%!important;max-width:100%!important;min-height:auto!important}
  .public-confirm-panel{width:100%!important;margin:12px 0 24px!important;padding:0!important}
  .info-row,.info-row.addr-row{grid-template-columns:1fr!important}
  .notes-totals-row{flex-direction:column!important}
  .totals-column{width:100%!important;max-width:100%!important;flex:1 1 auto!important}
  .row2{flex-direction:column!important}
}
@media print{
  .no-print,.public-confirm-panel{display:none!important}
}
</style>`;

  return quotationA4Html
    .replace("</head>", `${extraCss}</head>`)
    .replace("</body>", `${interactivePanel}</body>`);
}
