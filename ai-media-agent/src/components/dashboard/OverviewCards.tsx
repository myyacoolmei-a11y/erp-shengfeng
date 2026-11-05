import type { OverviewCounts } from "@/lib/data/mock-content";

interface OverviewCardsProps {
  counts: OverviewCounts;
}

export function OverviewCards({ counts }: OverviewCardsProps) {
  const cards: Array<{ label: string; value: number }> = [
    { label: "今日新增", value: counts.todayCreated },
    { label: "處理中", value: counts.processing },
    { label: "待確認", value: counts.awaitingReview },
    { label: "已發布", value: counts.published },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-2xl border border-warm-600/15 bg-ink-900/60 px-5 py-5"
        >
          <p className="text-xs font-medium text-warm-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-warm-100">{value}</p>
        </div>
      ))}
    </div>
  );
}
