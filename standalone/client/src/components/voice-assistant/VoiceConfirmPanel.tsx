import type { ParsedVoiceResult } from "../../../../shared/voice/types.ts";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-2 text-sm py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground shrink-0 w-24">{label}</span>
      <span className="flex-1 whitespace-pre-wrap break-words">{String(value)}</span>
    </div>
  );
}

export function VoiceConfirmPanel({
  parsed,
  transcript,
}: {
  parsed: ParsedVoiceResult;
  transcript: string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-muted/40 p-3 text-sm">
        <p className="text-xs font-semibold text-muted-foreground mb-1">語音原文</p>
        <p className="whitespace-pre-wrap">{transcript || "—"}</p>
      </div>

      <div className="rounded-lg border p-3 space-y-0.5">
        <p className="text-xs font-semibold text-muted-foreground mb-2">請確認以下內容（確認後填入表單，不會直接建立）</p>
        <Row label="客戶" value={parsed.customerName} />
        <Row label="電話" value={parsed.phone} />
        <Row label="地址" value={parsed.address} />
        {"title" in parsed && <Row label="工程名稱" value={parsed.title} />}
        <Row label="施工內容" value={parsed.description} />
        <Row label="備註" value={parsed.notes} />

        {parsed.formType === "work_order" && (
          <>
            <Row label="施工日期" value={parsed.scheduledDate} />
            <Row label="開始時間" value={parsed.scheduledTime} />
            <Row label="技師" value={parsed.technicians?.join("、")} />
            <Row label="工程類型" value={parsed.projectType} />
          </>
        )}

        {parsed.formType === "repair_case" && (
          <>
            <Row label="品牌" value={parsed.brand} />
            <Row label="型號" value={parsed.model} />
            <Row label="數量" value={parsed.quantity} />
            <Row label="故障描述" value={parsed.problemDescription} />
            <Row label="優先度" value={parsed.priority} />
            <Row label="預約日期" value={parsed.appointmentDate} />
            <Row label="預約時間" value={parsed.appointmentTime} />
          </>
        )}

        {parsed.items && parsed.items.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">商品 / 設備</p>
            <ul className="space-y-1.5 text-sm">
              {parsed.items.map((it, i) => (
                <li key={i} className="rounded bg-muted/30 px-2 py-1.5">
                  <span>{[it.brand, it.itemName || it.model].filter(Boolean).join(" ")}</span>
                  {it.model && it.itemName && it.model !== it.itemName && (
                    <span className="text-muted-foreground">（{it.model}）</span>
                  )}
                  <span className="text-muted-foreground"> ×{it.quantity ?? 1}{it.unit ?? "台"}</span>
                  {parsed.formType === "quote" && it.unitPrice != null && it.unitPrice > 0 && (
                    <span className="text-muted-foreground"> · NT${it.unitPrice.toLocaleString()}</span>
                  )}
                  {it.matched && (
                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700">商品庫</span>
                  )}
                  {!it.matched && (
                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-600">文字項目</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
