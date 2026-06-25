import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, acUnitsTable } from "@workspace/db";
import {
  CreateAcUnitBody,
  UpdateAcUnitBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/customers/:customerId/ac-units", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId;
  const customerId = parseInt(raw, 10);
  if (isNaN(customerId)) {
    res.status(400).json({ error: "Invalid customerId" });
    return;
  }
  const units = await db.select().from(acUnitsTable).where(eq(acUnitsTable.customerId, customerId)).orderBy(acUnitsTable.createdAt);
  res.json(units);
});

router.post("/customers/:customerId/ac-units", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId;
  const customerId = parseInt(raw, 10);
  if (isNaN(customerId)) {
    res.status(400).json({ error: "Invalid customerId" });
    return;
  }
  const parsed = CreateAcUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [unit] = await db.insert(acUnitsTable).values({ ...parsed.data, customerId }).returning();
  res.status(201).json(unit);
});

router.patch("/ac-units/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateAcUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [unit] = await db.update(acUnitsTable).set(parsed.data).where(eq(acUnitsTable.id, id)).returning();
  if (!unit) {
    res.status(404).json({ error: "找不到設備" });
    return;
  }
  res.json(unit);
});

router.delete("/ac-units/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [unit] = await db.delete(acUnitsTable).where(eq(acUnitsTable.id, id)).returning();
  if (!unit) {
    res.status(404).json({ error: "找不到設備" });
    return;
  }
  res.sendStatus(204);
});

export default router;
