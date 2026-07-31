import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  subsidyApplicationsTable,
  customerDocumentsTable,
  workOrdersTable,
} from "@workspace/db";
import {
  ALLOWED_SUBSIDY_UPLOAD_MIME,
  COMPANY_ASSISTED_REQUIRED_DOC_TYPES,
  SUBSIDY_DOC_TYPE_LABELS,
  SUBSIDY_UPLOAD_TOKEN_TTL_DAYS,
  missingRequiredDocs,
  parseSubsidyMeta,
  type SubsidyDocType,
} from "../../shared/subsidyDocs.ts";
import {
  mergeMetaAfterCheck,
  runSubsidyCompletenessCheck,
} from "../lib/subsidy/subsidyCheckService.ts";
import { escHtml } from "../lib/subsidy/subsidyPublicHtml.ts";

const router: IRouter = Router();

function tokenExpired(sentAt: Date | null | undefined, createdAt: Date): boolean {
  const base = sentAt ?? createdAt;
  const ms = SUBSIDY_UPLOAD_TOKEN_TTL_DAYS * 86400000;
  return Date.now() - base.getTime() > ms;
}

async function loadByToken(token: string) {
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.uploadLinkToken, token))
    .limit(1);
  if (!sub || sub.subsidyType !== "company_assisted") return null;
  if (tokenExpired(sub.uploadLinkSentAt, sub.createdAt)) {
    return { expired: true as const, sub };
  }
  const [wo] = await db
    .select({
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      customerName: workOrdersTable.customerName,
      installAddress: workOrdersTable.installAddress,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, sub.workOrderId))
    .limit(1);
  if (!wo) return null;
  const docs = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.subsidyApplicationId, sub.id));
  return { expired: false as const, sub, wo, docs };
}

async function recomputeAndSave(subId: number, workOrderId: number) {
  const [sub] = await db
    .select()
    .from(subsidyApplicationsTable)
    .where(eq(subsidyApplicationsTable.id, subId))
    .limit(1);
  if (!sub || sub.pipelineStatus === "applied") return null;

  const docs = await db
    .select()
    .from(customerDocumentsTable)
    .where(eq(customerDocumentsTable.subsidyApplicationId, subId));

  const { meta, freeNote } = parseSubsidyMeta(sub.note);
  let check;
  try {
    check = runSubsidyCompletenessCheck({
      subsidyType: "company_assisted",
      docs,
      prevMeta: meta,
    });
  } catch {
    // AI/check failure → never mark complete; wait for manual review
    check = {
      missingDocs: missingRequiredDocs(
        "company_assisted",
        docs.map((d) => d.docType),
      ),
      missingLabels: [] as string[],
      fileIssues: [] as string[],
      aiTips: ["自動檢查暫時不可用，請行政人工確認"],
      needsManualReview: true,
      allRequiredPresent: false,
      suggestedPipeline: "docs_incomplete" as const,
      displayStatus: "awaiting_manual_review" as const,
    };
    check.allRequiredPresent =
      check.missingDocs.length === 0 && docs.some((d) => d.fileUrl);
    if (check.allRequiredPresent) {
      check.needsManualReview = true;
      check.suggestedPipeline = "docs_incomplete";
    }
  }

  const note = mergeMetaAfterCheck(freeNote, meta, check);
  // Don't downgrade past awaiting_upload if still no docs
  let nextPipeline = check.suggestedPipeline;
  if (docs.filter((d) => d.fileUrl).length === 0 && sub.pipelineStatus === "awaiting_upload") {
    nextPipeline = "awaiting_upload";
  } else if (docs.filter((d) => d.fileUrl).length === 0 && sub.pipelineStatus === "link_not_sent") {
    nextPipeline = "link_not_sent";
  }

  await db
    .update(subsidyApplicationsTable)
    .set({
      pipelineStatus: nextPipeline,
      note,
      updatedAt: new Date(),
    })
    .where(eq(subsidyApplicationsTable.id, subId));

  return check;
}

/** Public HTML upload page — no login. */
router.get("/public/subsidy-upload/:token", async (req, res): Promise<void> => {
  try {
    const token = String(Array.isArray(req.params.token) ? req.params.token[0] : req.params.token || "");
    const loaded = await loadByToken(token);
    if (!loaded) {
      res.status(404).type("html").send(errorPage("連結無效", "此補助上傳連結無效。"));
      return;
    }
    if (loaded.expired) {
      res.status(410).type("html").send(errorPage("連結已過期", "請聯絡晟風工程重新取得上傳連結。"));
      return;
    }
    const { sub, wo, docs } = loaded;
    const { meta } = parseSubsidyMeta(sub.note);
    const missing = missingRequiredDocs(
      "company_assisted",
      docs.filter((d) => d.status !== "rejected").map((d) => d.docType),
    );
    res
      .status(200)
      .type("html; charset=utf-8")
      .send(
        uploadPageHtml({
          token,
          caseNo: wo.workOrderNumber || `#${wo.id}`,
          customerName: wo.customerName || "客戶",
          docs,
          missing,
          aiTips: meta.aiTips ?? [],
          pipeline: sub.pipelineStatus,
        }),
      );
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "載入失敗" });
  }
});

/** JSON summary for the token (optional clients). */
router.get("/public/subsidy-upload/:token/status", async (req, res): Promise<void> => {
  try {
    const token = String(Array.isArray(req.params.token) ? req.params.token[0] : req.params.token || "");
    const loaded = await loadByToken(token);
    if (!loaded) {
      res.status(404).json({ success: false, message: "連結無效" });
      return;
    }
    if (loaded.expired) {
      res.status(410).json({ success: false, message: "連結已過期" });
      return;
    }
    const { sub, wo, docs } = loaded;
    const { meta } = parseSubsidyMeta(sub.note);
    const missing = missingRequiredDocs(
      "company_assisted",
      docs.filter((d) => d.status !== "rejected").map((d) => d.docType),
    );
    res.json({
      success: true,
      caseNo: wo.workOrderNumber,
      customerName: wo.customerName,
      pipelineStatus: sub.pipelineStatus,
      requiredDocs: COMPANY_ASSISTED_REQUIRED_DOC_TYPES.map((t) => ({
        type: t,
        label: SUBSIDY_DOC_TYPE_LABELS[t],
      })),
      missingDocs: missing,
      uploaded: docs.map((d) => ({
        id: d.id,
        docType: d.docType,
        fileName: d.fileName,
        status: d.status,
        uploadedAt: d.uploadedAt,
      })),
      aiTips: meta.aiTips ?? [],
      needsManualReview: !!meta.needsManualReview,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "載入失敗" });
  }
});

/** Upload one document (JSON base64 data URL). */
router.post("/public/subsidy-upload/:token", async (req, res): Promise<void> => {
  try {
    const token = String(Array.isArray(req.params.token) ? req.params.token[0] : req.params.token || "");
    const loaded = await loadByToken(token);
    if (!loaded) {
      res.status(404).json({ success: false, message: "連結無效" });
      return;
    }
    if (loaded.expired) {
      res.status(410).json({ success: false, message: "連結已過期" });
      return;
    }
    if (loaded.sub.pipelineStatus === "applied") {
      res.status(400).json({ success: false, message: "補助已完成，無法再上傳" });
      return;
    }

    const docType = String(req.body?.docType ?? "").trim() as SubsidyDocType;
    const fileName = String(req.body?.fileName ?? "upload").slice(0, 200);
    const dataUrl = String(req.body?.dataUrl ?? "");

    if (!(COMPANY_ASSISTED_REQUIRED_DOC_TYPES as readonly string[]).includes(docType)) {
      res.status(400).json({ success: false, message: "不支援的文件類型" });
      return;
    }
    if (!dataUrl.startsWith("data:") || !dataUrl.includes(",")) {
      res.status(400).json({ success: false, message: "請上傳有效檔案" });
      return;
    }
    const mime = dataUrl.slice(5, dataUrl.indexOf(";")).toLowerCase();
    if (!(ALLOWED_SUBSIDY_UPLOAD_MIME as readonly string[]).includes(mime)) {
      res.status(400).json({ success: false, message: `不支援的格式：${mime}` });
      return;
    }
    const b64 = dataUrl.split(",")[1] ?? "";
    if (b64.length < 32) {
      res.status(400).json({ success: false, message: "檔案為空" });
      return;
    }
    // ~10MB base64 guard
    if (b64.length > 14_000_000) {
      res.status(413).json({ success: false, message: "檔案過大（請小於約 10MB）" });
      return;
    }

    const now = new Date();
    // Replace previous file of same docType for this subsidy app
    const existing = loaded.docs.filter((d) => d.docType === docType);
    for (const old of existing) {
      await db.delete(customerDocumentsTable).where(eq(customerDocumentsTable.id, old.id));
    }

    const [created] = await db
      .insert(customerDocumentsTable)
      .values({
        workOrderId: loaded.sub.workOrderId,
        customerId: loaded.sub.customerId,
        subsidyApplicationId: loaded.sub.id,
        docType,
        fileName,
        fileUrl: dataUrl,
        status: "uploaded",
        uploadedAt: now,
        note: "客戶上傳",
      })
      .returning();

    // Move out of link_not_sent once first upload arrives
    if (
      loaded.sub.pipelineStatus === "link_not_sent" ||
      loaded.sub.pipelineStatus === "awaiting_upload"
    ) {
      await db
        .update(subsidyApplicationsTable)
        .set({ pipelineStatus: "awaiting_upload", updatedAt: now })
        .where(eq(subsidyApplicationsTable.id, loaded.sub.id));
    }

    const check = await recomputeAndSave(loaded.sub.id, loaded.sub.workOrderId);

    res.status(201).json({
      success: true,
      documentId: created.id,
      check: check
        ? {
            missingDocs: check.missingDocs,
            missingLabels: check.missingLabels,
            fileIssues: check.fileIssues,
            aiTips: check.aiTips,
            needsManualReview: check.needsManualReview,
            displayStatus: check.displayStatus,
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "上傳失敗" });
  }
});

function errorPage(title: string, msg: string) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#222}h1{font-size:1.25rem}</style></head>
<body><h1>${escHtml(title)}</h1><p>${escHtml(msg)}</p></body></html>`;
}

function uploadPageHtml(opts: {
  token: string;
  caseNo: string;
  customerName: string;
  docs: Array<{ id: number; docType: string; fileName: string | null; status: string; uploadedAt: Date | null }>;
  missing: SubsidyDocType[];
  aiTips: string[];
  pipeline: string;
}) {
  const uploadedTypes = new Set(opts.docs.filter((d) => d.status !== "rejected").map((d) => d.docType));
  const rows = COMPANY_ASSISTED_REQUIRED_DOC_TYPES.map((t) => {
    const label = SUBSIDY_DOC_TYPE_LABELS[t];
    const done = uploadedTypes.has(t);
    return `<div class="card" data-type="${t}">
      <div class="row"><strong>${escHtml(label)}</strong>
        <span class="badge ${done ? "ok" : "miss"}">${done ? "已上傳" : "未上傳"}</span>
      </div>
      <input type="file" accept="image/*,application/pdf" ${opts.pipeline === "applied" ? "disabled" : ""} />
      <button type="button" class="btn" data-upload="${t}" ${opts.pipeline === "applied" ? "disabled" : ""}>上傳</button>
      <p class="msg" hidden></p>
    </div>`;
  }).join("");

  const missList =
    opts.missing.length === 0
      ? "<p class='ok'>目前必填文件皆已上傳（仍可能需行政確認）。</p>"
      : `<p class="warn">尚缺：${opts.missing.map((t) => escHtml(SUBSIDY_DOC_TYPE_LABELS[t])).join("、")}</p>`;

  const tips =
    opts.aiTips.length > 0
      ? `<div class="tips"><strong>提醒</strong><ul>${opts.aiTips.map((t) => `<li>${escHtml(t)}</li>`).join("")}</ul></div>`
      : "";

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>晟風工程｜補助資料上傳</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#f6f7f8;color:#1a1a1a;margin:0;padding:16px}
.wrap{max-width:560px;margin:0 auto}
h1{font-size:1.25rem;margin:0 0 4px} .sub{color:#666;font-size:.875rem;margin-bottom:16px}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px;margin:10px 0}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.badge{font-size:.75rem;padding:2px 8px;border-radius:999px}
.badge.ok{background:#dcfce7;color:#166534}.badge.miss{background:#ffedd5;color:#9a3412}
.btn{margin-top:8px;background:#111;color:#fff;border:0;border-radius:8px;padding:8px 12px;font-size:.875rem}
.btn:disabled{opacity:.4} input[type=file]{width:100%;font-size:.8rem}
.warn{color:#9a3412}.ok{color:#166534}.tips{background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px;font-size:.85rem}
.msg{font-size:.8rem;margin-top:6px;color:#166534}
</style>
</head>
<body>
<div class="wrap">
  <h1>補助資料上傳</h1>
  <p class="sub">晟風工程｜${escHtml(opts.customerName)}｜案件 ${escHtml(opts.caseNo)}<br/>此頁僅供本案件上傳，無需登入。</p>
  ${missList}
  ${tips}
  ${rows}
  <p class="sub">支援 JPG／PNG／PDF。上傳後將自動檢查是否齊全。</p>
</div>
<script>
const token=${JSON.stringify(opts.token)};
async function upload(type, input, msgEl, badge){
  const file=input.files&&input.files[0];
  if(!file){msgEl.hidden=false;msgEl.textContent='請先選擇檔案';msgEl.style.color='#9a3412';return;}
  msgEl.hidden=false;msgEl.style.color='#666';msgEl.textContent='上傳中…';
  const dataUrl=await new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=reject;
    r.readAsDataURL(file);
  });
  try{
    const res=await fetch('/api/public/subsidy-upload/'+encodeURIComponent(token),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({docType:type,fileName:file.name,dataUrl})
    });
    const data=await res.json();
    if(!res.ok||!data.success) throw new Error(data.message||('HTTP '+res.status));
    msgEl.style.color='#166534';msgEl.textContent='上傳成功';
    badge.textContent='已上傳';badge.className='badge ok';
    if(data.check&&data.check.missingLabels&&data.check.missingLabels.length){
      msgEl.textContent='上傳成功。尚缺：'+data.check.missingLabels.join('、');
    } else if(data.check&&data.check.needsManualReview){
      msgEl.textContent='上傳成功。資料待行政人工確認';
    } else if(data.check&&data.check.displayStatus==='docs_complete'){
      msgEl.textContent='上傳成功。資料已齊全，待行政申請補助';
    }
  }catch(e){
    msgEl.style.color='#9a3412';
    msgEl.textContent=String(e.message||e);
  }
}
document.querySelectorAll('[data-upload]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const type=btn.getAttribute('data-upload');
    const card=btn.closest('.card');
    const input=card.querySelector('input[type=file]');
    const msgEl=card.querySelector('.msg');
    const badge=card.querySelector('.badge');
    upload(type,input,msgEl,badge);
  });
});
</script>
</body></html>`;
}

export default router;
