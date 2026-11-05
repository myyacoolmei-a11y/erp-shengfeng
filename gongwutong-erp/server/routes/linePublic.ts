import { Router, type IRouter } from "express";
import { buildLineAddFriendUrl } from "../lib/line/lineConfig.ts";

const router: IRouter = Router();

/** Public config — no secrets; only LINE add-friend URL derived from env. */
router.get("/line/public-config", (_req, res): void => {
  res.json({
    addFriendUrl: buildLineAddFriendUrl(),
  });
});

export default router;
