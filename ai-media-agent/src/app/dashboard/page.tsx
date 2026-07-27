import { OverviewCards } from "@/components/dashboard/OverviewCards";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentContentList } from "@/components/dashboard/RecentContentList";
import { getOverviewCounts, getRecentContent } from "@/lib/data/mock-content";

export default async function DashboardOverviewPage() {
  const [counts, recentContent] = await Promise.all([
    getOverviewCounts(),
    getRecentContent(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-warm-100 sm:text-2xl">總覽</h1>
        <p className="mt-1 text-sm text-warm-500">掌握內容處理進度與最新動態</p>
      </div>

      <OverviewCards counts={counts} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-warm-300">快速操作</h2>
        <QuickActions />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-warm-300">最近內容</h2>
        <RecentContentList items={recentContent} />
      </div>
    </div>
  );
}
