import { useQuery } from "@tanstack/react-query";
import { listFieldProgress, formatTaipeiDateTime } from "@/lib/fieldProgressApi";

interface Props {
  workOrderId: number;
}

export function FieldProgressDetailSection({ workOrderId }: Props) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["field-progress", workOrderId],
    queryFn: () => listFieldProgress(workOrderId),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        載入施工進度中…
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">施工進度與工時</p>
        <p className="text-xs text-muted-foreground">尚無施工進度紀錄</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3 text-sm">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">施工進度與工時</p>
      {records.map((r) => (
        <div key={r.id} className="border-t pt-2 first:border-t-0 first:pt-0 space-y-1 text-xs">
          <p className="font-medium text-sm">{r.engineerName}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <p><span className="text-muted-foreground">前往案場：</span>{formatTaipeiDateTime(r.departedAt)}</p>
            <p><span className="text-muted-foreground">到達施工：</span>{formatTaipeiDateTime(r.arrivedAt)}</p>
            <p><span className="text-muted-foreground">完工離場：</span>{formatTaipeiDateTime(r.completedAt)}</p>
            <p><span className="text-muted-foreground">路程時間：</span>{r.completedAt ? r.travelDurationLabel : "尚未記錄"}</p>
            <p><span className="text-muted-foreground">施工時間：</span>{r.completedAt ? r.workDurationLabel : "尚未記錄"}</p>
            <p><span className="text-muted-foreground">總耗時：</span>{r.completedAt ? r.totalDurationLabel : "尚未記錄"}</p>
          </div>
          {r.unableToCompleteAt && (
            <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-900">
              <p><span className="text-muted-foreground">無法完成原因：</span>{r.unableReason}
                {r.unableReason === "其他" && r.unableNote ? `（${r.unableNote}）` : ""}
              </p>
              <p><span className="text-muted-foreground">回報人：</span>{r.engineerName}</p>
              <p><span className="text-muted-foreground">回報時間：</span>{formatTaipeiDateTime(r.unableToCompleteAt)}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
