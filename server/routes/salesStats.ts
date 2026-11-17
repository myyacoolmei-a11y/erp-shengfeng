import { Router, type IRouter } from "express";
import { requireRole } from "../lib/auth";
import { computeSalesStats } from "../lib/statistics/salesStatsService";
import { resolveSalesStatsDateRange } from "../../shared/salesStats.ts";

const router: IRouter = Router();

const STATS_ROLES = ["super_admin", "owner", "admin", "accountant"] as const;

router.get("/sales-stats", requireRole(...STATS_ROLES), async (req, res): Promise<void> => {
  const { preset, from, to, salesUserId } = req.query as {
    preset?: string;
    from?: string;
    to?: string;
    salesUserId?: string;
  };

  const range = resolveSalesStatsDateRange(preset, from, to);
  if (!range) {
    res.status(400).json({ error: "請提供日期篩選條件" });
    return;
  }

  const result = await computeSalesStats({
    from: range.from,
    to: range.to,
    salesUserId: salesUserId ?? null,
  });
  res.json(result);
});

export default router;
