import { Router, type IRouter } from "express";
import { getDashboardSummary } from "../lib/statistics/statisticsService";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireRole("super_admin", "owner", "admin", "accountant"), async (_req, res): Promise<void> => {
  const summary = await getDashboardSummary();
  res.json(summary);
});

export default router;
