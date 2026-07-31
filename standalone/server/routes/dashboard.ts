import { Router, type IRouter } from "express";
import { getDashboardSummary } from "../lib/statistics/statisticsService";
import { requireFeature } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireFeature("dashboard"), async (_req, res): Promise<void> => {
  const summary = await getDashboardSummary();
  res.json(summary);
});

export default router;
