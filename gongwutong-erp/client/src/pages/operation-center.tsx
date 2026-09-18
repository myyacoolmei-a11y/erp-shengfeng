import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, BarChart3, CheckCircle2, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchCaseTimeline,
  fetchOperationCenter,
  fetchOperationCenterCases,
  type OperationCaseItem,
} from "@/lib/operationCenterApi";
import type { ProgressTone } from "../../../shared/operationCenterConstants.ts";

function toneClass(tone: ProgressTone) {
  if (tone === "done") return "bg-emerald-100 text-emerald-900";
  if (tone === "current") return "bg-amber-100 text-amber-900";
  if (tone === "skipped") return "bg-muted text-muted-foreground line-through";
  return "bg-gray-50 text-muted-foreground";
}

function toneDot(tone: ProgressTone) {
  if (tone === "done") return "🟢";
  if (tone === "current") return "🟡";
  if (tone === "skipped") return "⚪";
  return "⚪";
}

function CaseProgressBar({
  progress,
}: {
  progress: OperationCaseItem["progress"];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {progress.map(p => (
        <span
          key={p.step}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${toneClass(p.tone)}`}
          title={p.label}
        >
          <span aria-hidden>{toneDot(p.tone)}</span>
          {p.label}
        </span>
      ))}
    </div>
  );
}

function BucketGrid({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: Array<{ id: string; label: string; count: number }>;
  onOpen: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className="flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
          >
            <span className="text-sm">{item.label}</span>
            <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
              {item.count}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function CaseListDialog({
  department,
  bucket,
  open,
  onClose,
  onPickCase,
}: {
  department: "engineering" | "admin" | "sales";
  bucket: string | null;
  open: boolean;
  onClose: () => void;
  onPickCase: (id: number) => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["operation-center-cases", department, bucket],
    queryFn: () => fetchOperationCenterCases(department, bucket!),
    enabled: open && !!bucket,
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.label || "案件列表"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}
          {isError && (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "載入失敗"}
            </p>
          )}
          {data && data.items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">此分類尚無案件</p>
          )}
          {data?.items.map(item => (
            <button
              key={item.workOrderId}
              type="button"
              className="w-full rounded-md border p-3 text-left hover:bg-muted/40"
              onClick={() => onPickCase(item.workOrderId)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {item.customerName || "—"} · {item.workOrderNumber || item.workOrderId}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.installAddress || "—"}</p>
                  <p className="mt-1 text-xs text-amber-800">目前：{item.summary}</p>
                </div>
                <Link
                  href={`/work-orders?highlight=${item.workOrderId}`}
                  className="text-xs text-primary underline"
                  onClick={e => e.stopPropagation()}
                >
                  開啟案件
                </Link>
              </div>
              <div className="mt-2">
                <CaseProgressBar progress={item.progress} />
              </div>
            </button>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CaseDetailDialog({
  workOrderId,
  open,
  onClose,
}: {
  workOrderId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["operation-center-case", workOrderId],
    queryFn: () => fetchCaseTimeline(workOrderId!),
    enabled: open && workOrderId != null,
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {data?.case.customerName || "案件"} · {data?.case.workOrderNumber || workOrderId}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}
          {data && (
            <>
              <div className="space-y-1 text-xs">
                <p>
                  <span className="text-muted-foreground">電話：</span>
                  {data.case.mobilePhone || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">地址：</span>
                  {data.case.installAddress || "—"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold">案件流程</p>
                <CaseProgressBar progress={data.progress} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold">案件操作紀錄</p>
                {data.timeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground">尚無操作紀錄</p>
                ) : (
                  <ul className="space-y-3 border-l-2 border-muted pl-3">
                    {data.timeline.map((t, i) => (
                      <li key={`${t.at}-${i}`} className="text-xs">
                        <p className="font-medium">
                          {new Date(t.at).toLocaleString("zh-TW")} · {t.operator}
                        </p>
                        <p>{t.action}</p>
                        {(t.fromStatus || t.toStatus) && (
                          <p className="text-muted-foreground">
                            {t.fromStatus ?? "—"} → {t.toStatus ?? "—"}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button asChild size="sm" variant="outline">
                <Link href={`/work-orders?highlight=${data.case.workOrderId}`}>前往案件頁</Link>
              </Button>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OperationCenterPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["operation-center"],
    queryFn: fetchOperationCenter,
  });

  const [listDept, setListDept] = useState<"engineering" | "admin" | "sales" | null>(null);
  const [listBucket, setListBucket] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="mx-auto max-w-lg border-destructive/40">
        <CardContent className="space-y-3 py-8 text-center">
          <AlertCircle className="mx-auto h-7 w-7 text-destructive" />
          <p className="font-medium text-destructive">營運中心載入失敗</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "請稍後再試"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            重新整理
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-10">
      <div className="flex items-start gap-3">
        <BarChart3 className="mt-0.5 h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">營運中心</h1>
          <p className="text-sm text-muted-foreground">
            Owner 專用 · 查看工程 / 行政 / 業務流程 · {data.today}
          </p>
        </div>
      </div>

      <BucketGrid
        title="工程部"
        items={data.engineering}
        onOpen={id => {
          setListDept("engineering");
          setListBucket(id);
        }}
      />
      <BucketGrid
        title="行政部"
        items={data.admin}
        onOpen={id => {
          setListDept("admin");
          setListBucket(id);
        }}
      />
      <BucketGrid
        title="業務部"
        items={data.sales}
        onOpen={id => {
          setListDept("sales");
          setListBucket(id);
        }}
      />

      <Card>
        <CardContent className="flex items-start gap-2 py-4 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p>
            點分類即可查看案件；每案可看流程進度與操作紀錄。補助完成驗收在行政工作台／案件頁操作，不影響工程師現場流程。
          </p>
        </CardContent>
      </Card>

      {listDept && listBucket && (
        <CaseListDialog
          department={listDept}
          bucket={listBucket}
          open
          onClose={() => {
            setListDept(null);
            setListBucket(null);
          }}
          onPickCase={id => setDetailId(id)}
        />
      )}
      {detailId != null && (
        <CaseDetailDialog
          workOrderId={detailId}
          open
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
