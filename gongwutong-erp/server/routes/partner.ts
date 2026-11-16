import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import {
  getPartnerHome,
  listPartnerSuggestions,
  submitPartnerSuggestion,
  updatePartnerContent,
} from "../lib/partner/partnerService.ts";
import type { PartnerBoardKey } from "@workspace/db";

const router: IRouter = Router();

const ENGINEER_ROLES = ["engineer", "technician"] as const;
const ADMIN_ROLES = ["super_admin", "owner", "admin"] as const;
const FIELD_ROLES = [...ENGINEER_ROLES, ...ADMIN_ROLES] as const;

const ContentSchema = z.object({
  key: z.enum(["daily_quote", "announcement", "applause"]),
  content: z.string().min(1).max(2000),
});

const SuggestionSchema = z.object({
  content: z.string().min(1).max(2000),
  isAnonymous: z.boolean().optional().default(false),
});

router.get("/partner/home", requireRole(...FIELD_ROLES), async (_req, res) => {
  try {
    res.json(await getPartnerHome());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "載入失敗" });
  }
});

router.patch("/partner/content", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = ContentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  try {
    const result = await updatePartnerContent(
      parsed.data.key as PartnerBoardKey,
      parsed.data.content,
      req.user.id,
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "更新失敗" });
  }
});

router.post("/partner/suggestions", requireRole(...ENGINEER_ROLES), async (req, res) => {
  const parsed = SuggestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  try {
    res.json(await submitPartnerSuggestion({
      content: parsed.data.content,
      isAnonymous: parsed.data.isAnonymous ?? false,
      userId: req.user.id,
      displayName: req.user.displayName,
    }));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "送出失敗" });
  }
});

router.get("/partner/suggestions", requireRole(...ADMIN_ROLES), async (_req, res) => {
  try {
    res.json(await listPartnerSuggestions());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "載入失敗" });
  }
});

export default router;
