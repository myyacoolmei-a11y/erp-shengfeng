import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const CreateUserBody = z.object({
  username: z.string().min(1, "帳號不可為空"),
  password: z.string().min(6, "密碼至少 6 位"),
  displayName: z.string().min(1, "姓名不可為空"),
  role: z.enum(["owner", "admin", "technician", "accountant"]),
});

const UpdateUserBody = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(["owner", "admin", "technician", "accountant"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

const userPublicFields = {
  id: usersTable.id,
  username: usersTable.username,
  displayName: usersTable.displayName,
  role: usersTable.role,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
};

router.get("/users", requireRole("owner"), async (_req, res): Promise<void> => {
  const users = await db
    .select(userPublicFields)
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/users", requireRole("owner"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ ...rest, passwordHash })
    .returning(userPublicFields);
  res.status(201).json(user);
});

router.patch("/users/:id", requireRole("owner"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (password) {
    updates["passwordHash"] = await bcrypt.hash(password, 10);
  }
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning(userPublicFields);
  if (!user) {
    res.status(404).json({ error: "找不到使用者" });
    return;
  }
  res.json(user);
});

export default router;
