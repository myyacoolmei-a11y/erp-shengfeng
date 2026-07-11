import { useQuery } from "@tanstack/react-query";
import {
  listFieldProgress,
  listFieldProgressSnapshots,
  formatTaipeiDateTime,
  type FieldProgressRecord,
  type FieldProgressSnapshotRecord,
} from "@/lib/fieldProgressApi";

interface Props {
  workOrderId: number;
}

function ProgressRecordBlock({
  record,
  archivedAt,
}: {
  record: FieldProgressRecord;
  archivedAt?: string | null;
}) {
  return (
    <div className="border-t pt-2 first:border-t-0 first:pt-0 space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <p className="font-medium text-sm">{record.engineerName}</p>
        {archivedAt && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            歷史 · {formatTaipeiDateTime(archivedAt)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        <p><span className="text-muted-foreground">前往案場：</span>{formatTaipeiDateTime(record.departedAt)}</p>
        <p><span className="text-muted-foreground">到達施工：</span>{formatTaipeiDateTime(record.arrivedAt)}</p>
        <p><span className="text-muted-foreground">完工離場：</span>{formatTaipeiDateTime(record.completedAt)}</p>
        <p><span className="text-muted-foreground">路程時間：</span>{record.completedAt ? record.travelDurationLabel : "尚未記錄"}</p>
        <p><span className="text-muted-foreground">施工時間：</span>{record.completedAt ? record.workDurationLabel : "尚未記錄"}</p>
        <p><span className="text-muted-foreground">總耗時：</span>{record.completedAt ? record.totalDurationLabel : "尚未記錄"}</p>
      </div>
      {record.unableToCompleteAt && (
        <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-900">
          <p><span className="text-muted-foreground">無法完成原因：</span>{record.unableReason}
            {record.unableReason === "其他" && record.unableNote ? `（${record.unableNote}）` : ""}
          </p>
          <p><span className="text-muted-foreground">回報人：</span>{record.engineerName}</p>
          <p><span className="text-muted-foreground">回報時間：</span>{formatTaipeiDateTime(record.unableToCompleteAt)}</p>
        </div>
      )}
    </div>
  );
}

export function FieldProgressDetailSection({ workOrderId }: Props) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["field-progress", workOrderId],
    queryFn: () => listFieldProgress(workOrderId),
  });

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery({
    queryKey: ["field-progress-snapshots", workOrderId],
    queryFn: () => listFieldProgressSnapshots(workOrderId),
  });

  if (isLoading || snapshotsLoading) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        載入施工進度中…
      </div>
    );
  }

  const activeRecords = records.filter(
    r => r.departedAt || r.arrivedAt || r.completedAt || r.unableToCompleteAt,
  );

  if (activeRecords.length === 0 && snapshots.length === 0) {
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
      {activeRecords.length === 0 ? (
        <p className="text-xs text-muted-foreground">目前尚無進行中的施工紀錄</p>
      ) : (
        activeRecords.map(r => <ProgressRecordBlock key={r.id} record={r} />)
      )}
      {snapshots.length > 0 && (
        <div className="border-t pt-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">歷史施工紀錄</p>
          {snapshots.map((r: FieldProgressSnapshotRecord) => (
            <ProgressRecordBlock key={`snap-${r.id}`} record={r} archivedAt={r.archivedAt} />
          ))}
        </div>
      )}
    </div>
  );
}
