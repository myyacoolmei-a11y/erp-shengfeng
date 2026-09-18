import { Router, type IRouter } from "express";
import { runReceivableCollectionReminder } from "../lib/reminders/reminderSettingsService.ts";

const router: IRouter = Router();

/** External cron hook — Authorization: Bearer CRON_SECRET */
router.post("/jobs/receivable-collection-reminder", async (req, res): Promise<void> => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: "CRON_SECRET not configured" });
    return;
  }

  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const result = await runReceivableCollectionReminder();
  res.json(result);
});

export default router;
