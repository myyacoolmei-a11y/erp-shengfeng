import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";

type RequiredDoc = {
  type: string;
  label: string;
  uploaded: boolean;
  fileName: string | null;
  uploadedAt: string | null;
  previewUrl: string | null;
  isPdf?: boolean;
};

type StatusPayload = {
  success: boolean;
  message?: string;
  brandName?: string;
  caseNo?: string | null;
  customerName?: string | null;
  programLabel?: string;
  pipelineStatus?: string;
  requiredDocs?: RequiredDoc[];
  missingLabels?: string[];
  aiTips?: string[];
  needsManualReview?: boolean;
  canSubmitComplete?: boolean;
};

type UploadState = {
  progress: number;
  message: string;
  error?: boolean;
  localPreview?: string | null;
};

async function fetchStatus(token: string): Promise<StatusPayload> {
  const res = await fetch(`/api/public/subsidy-upload/${encodeURIComponent(token)}/status`);
  const data = (await res.json().catch(() => ({}))) as StatusPayload;
  if (res.status === 404) {
    throw Object.assign(new Error(data.message || "連結無效"), { code: 404 });
  }
  if (res.status === 410) {
    throw Object.assign(new Error(data.message || "連結已過期"), { code: 410 });
  }
  if (!res.ok || !data.success) {
    throw new Error(data.message || `載入失敗（${res.status}）`);
  }
  return data;
}

function readFileAsDataUrl(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 70));
    };
    reader.onload = () => {
      onProgress(75);
      resolve(String(reader.result || ""));
    };
    reader.onerror = () => reject(new Error("讀取檔案失敗"));
    reader.readAsDataURL(file);
  });
}

export default function SubsidyUploadPage() {
  const [, params] = useRoute("/subsidy-upload/:token");
  const token = params?.token ? decodeURIComponent(params.token) : "";
  const [uploadByType, setUploadByType] = useState<Record<string, UploadState>>({});
  const [submitted, setSubmitted] = useState(false);

  const query = useQuery({
    queryKey: ["public-subsidy-upload", token],
    queryFn: () => fetchStatus(token),
    enabled: !!token,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const locked = query.data?.pipelineStatus === "applied";

  const missingText = useMemo(() => {
    const labels = query.data?.missingLabels ?? [];
    return labels.length ? labels.join("、") : "";
  }, [query.data?.missingLabels]);

  const setTypeState = useCallback((type: string, patch: Partial<UploadState>) => {
    setUploadByType((prev) => {
      const cur = prev[type] ?? { progress: 0, message: "" };
      return { ...prev, [type]: { ...cur, ...patch } };
    });
  }, []);

  const onUpload = async (docType: string, file: File | null) => {
    if (!file || !token || locked) return;
    setTypeState(docType, {
      progress: 5,
      message: "準備上傳…",
      error: false,
      localPreview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    });
    try {
      const dataUrl = await readFileAsDataUrl(file, (pct) =>
        setTypeState(docType, { progress: pct, message: "讀取檔案…" }),
      );
      setTypeState(docType, { progress: 85, message: "上傳中…" });
      const res = await fetch(`/api/public/subsidy-upload/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, fileName: file.name, dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || `上傳失敗（${res.status}）`);
      }
      setTypeState(docType, { progress: 100, message: "上傳成功", error: false });
      setSubmitted(false);
      await query.refetch();
    } catch (e) {
      setTypeState(docType, {
        progress: 0,
        message: e instanceof Error ? e.message : "上傳失敗",
        error: true,
      });
    }
  };

  if (!token) {
    return (
      <Shell>
        <h1>連結無效</h1>
        <p>缺少上傳代碼，請使用行政提供的完整連結。</p>
      </Shell>
    );
  }

  if (query.isLoading) {
    return (
      <Shell>
        <h1>晟風工程</h1>
        <p className="muted">載入補助上傳頁…</p>
      </Shell>
    );
  }

  if (query.isError) {
    const err = query.error as Error & { code?: number };
    const title = err.code === 410 ? "連結已過期" : "連結無效";
    return (
      <Shell>
        <h1>{title}</h1>
        <p>{err.message || "請聯絡晟風工程重新取得上傳連結。"}</p>
      </Shell>
    );
  }

  const data = query.data!;
  const docs = data.requiredDocs ?? [];

  return (
    <Shell>
      <header className="header">
        <p className="brand">{data.brandName || "晟風工程"}</p>
        <h1>補助資料上傳</h1>
        <p className="muted">
          {data.customerName || "客戶"} 您好
          <br />
          案件 {data.caseNo || "—"}
          {data.programLabel ? `｜${data.programLabel}` : ""}
        </p>
        <p className="hint">
          請依下列項目拍照或選擇檔案上傳。無需登入；此連結僅供本案件使用。
        </p>
      </header>

      {locked ? (
        <p className="ok-box">此案件補助已完成，無法再上傳。</p>
      ) : missingText ? (
        <p className="warn-box">尚缺：{missingText}</p>
      ) : (
        <p className="ok-box">必要文件皆已上傳，可按下方「完成送出」。</p>
      )}

      <div className="list">
        {docs.length === 0 ? (
          <p className="warn-box">行政尚未選定補助方案文件清單，請稍後再試。</p>
        ) : (
          docs.map((doc) => {
            const st = uploadByType[doc.type];
            const preview = st?.localPreview || doc.previewUrl;
            return (
              <section key={doc.type} className="card">
                <div className="row">
                  <strong>{doc.label}</strong>
                  <span className={doc.uploaded ? "badge ok" : "badge miss"}>
                    {doc.uploaded ? "已上傳" : "未上傳"}
                  </span>
                </div>
                {preview ? (
                  <img src={preview} alt={doc.label} className="thumb" />
                ) : doc.uploaded && doc.fileName ? (
                  <p className="file-name">{doc.fileName}</p>
                ) : null}
                {!locked && (
                  <>
                    <label className="file-btn">
                      {doc.uploaded ? "重新上傳" : "拍照或選擇檔案"}
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        capture="environment"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          void onUpload(doc.type, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {st?.message && (
                      <p className={st.error ? "msg err" : "msg"}>
                        {st.message}
                        {st.progress > 0 && st.progress < 100 ? ` ${st.progress}%` : ""}
                      </p>
                    )}
                    {st && st.progress > 0 && st.progress < 100 && (
                      <div className="bar">
                        <div style={{ width: `${st.progress}%` }} />
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })
        )}
      </div>

      {!locked && (
        <button
          type="button"
          className="submit"
          disabled={!data.canSubmitComplete}
          onClick={() => {
            setSubmitted(true);
            void query.refetch();
          }}
        >
          完成送出
        </button>
      )}

      {submitted && data.canSubmitComplete && (
        <p className="ok-box">
          已送出。我們會檢查您的資料
          {data.needsManualReview ? "（可能需人工確認）" : ""}
          ，若缺件會再通知您，謝謝。
        </p>
      )}

      <p className="footer muted">支援 JPG／PNG／PDF。請勿將連結轉給無關人士。</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="su-root">
      <style>{css}</style>
      <div className="su-wrap">{children}</div>
    </div>
  );
}

const css = `
.su-root{min-height:100vh;background:linear-gradient(180deg,#f3f6f4 0%,#eef2f0 40%,#f7f7f5 100%);color:#1c1c1c;
  font-family:"Noto Sans TC","PingFang TC","Hiragino Sans","Microsoft JhengHei",sans-serif;}
.su-wrap{max-width:520px;margin:0 auto;padding:20px 16px 48px}
.brand{font-size:1.35rem;font-weight:700;letter-spacing:.04em;margin:0 0 4px;color:#0f3d2e}
.header h1{font-size:1.15rem;margin:0 0 8px;font-weight:650}
.muted{color:#5c6560;font-size:.875rem;line-height:1.5;margin:0}
.hint{margin:12px 0 0;font-size:.875rem;color:#3d4a43;line-height:1.55}
.list{margin-top:16px}
.card{background:#fff;border:1px solid #d9e0db;border-radius:12px;padding:14px;margin:10px 0;box-shadow:0 1px 0 rgba(15,61,46,.04)}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.badge{font-size:.75rem;padding:2px 8px;border-radius:999px;font-weight:600}
.badge.ok{background:#dcfce7;color:#166534}.badge.miss{background:#ffedd5;color:#9a3412}
.file-btn{display:block;margin-top:8px;background:#0f3d2e;color:#fff;text-align:center;border-radius:10px;padding:12px 14px;font-size:.9rem;font-weight:600;cursor:pointer}
.file-btn input{display:none}
.file-btn:active{opacity:.9}
.thumb{display:block;width:100%;max-height:180px;object-fit:contain;border-radius:8px;background:#f4f6f5;margin-bottom:8px}
.file-name{font-size:.8rem;color:#555;margin:0 0 8px;word-break:break-all}
.msg{font-size:.8rem;margin:8px 0 0;color:#166534}.msg.err{color:#9a3412}
.bar{height:6px;background:#e5ebe7;border-radius:999px;margin-top:8px;overflow:hidden}
.bar>div{height:100%;background:#0f3d2e;transition:width .2s}
.warn-box{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:10px;padding:10px 12px;font-size:.875rem;margin:12px 0}
.ok-box{background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;border-radius:10px;padding:10px 12px;font-size:.875rem;margin:12px 0}
.submit{width:100%;margin-top:16px;background:#14532d;color:#fff;border:0;border-radius:12px;padding:14px;font-size:1rem;font-weight:700}
.submit:disabled{opacity:.4}
.footer{margin-top:20px;text-align:center}
`;
