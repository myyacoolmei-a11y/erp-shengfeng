import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const ALL_ROLES = [
  "owner",
  "admin",
  "sales",
  "engineer",
  "technician",
  "accountant",
  "distributor",
] as const;

const CreateUserBody = z.object({
  username: z.string().min(1, "帳號不可為空"),
  password: z.string().min(6, "密碼至少 6 位"),
  displayName: z.string().min(1, "姓名不可為空"),
  role: z.enum(ALL_ROLES),
});

const UpdateUserBody = z.object({
  displayName: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  role: z.enum(ALL_ROLES).optional(),
  isActive: z.boolean().optional(),
});

const ResetPasswordBody = z.object({
  newPassword: z.string().min(6, "密碼至少 6 位"),
});

const userPublicFields = {
  id: usersTable.id,
  username: usersTable.username,
  displayName: usersTable.displayName,
  role: usersTable.role,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
};

function parseId(raw: unknown): number | null {
  const id = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return isNaN(id) ? null : id;
}

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

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, rest.username));
  if (existing) {
    res.status(409).json({ error: "帳號已被使用" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ ...rest, passwordHash, mustChangePassword: true })
    .returning(userPublicFields);
  res.status(201).json(user);
});

router.patch("/users/:id", requireRole("owner"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.username) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.username, parsed.data.username), ne(usersTable.id, id)));
    if (existing) {
      res.status(409).json({ error: "帳號已被使用" });
      return;
    }
  }

  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, id))
    .returning(userPublicFields);
  if (!user) { res.status(404).json({ error: "找不到使用者" }); return; }
  res.json(user);
});

router.post("/users/:id/reset-password", requireRole("owner"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到使用者" }); return; }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(usersTable.id, id));

  res.json({ ok: true });
});

router.delete("/users/:id", requireRole("owner"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const callerId = req.user!.id;
  if (id === callerId) {
    res.status(400).json({ error: "不能刪除自己的帳號" });
    return;
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "找不到使用者" }); return; }

  if (target.role === "owner") {
    const [otherOwner] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "owner"),
          eq(usersTable.isActive, true),
          ne(usersTable.id, id),
        )
      );
    if (!otherOwner) {
      res.status(400).json({ error: "無法刪除最後一位啟用的老闆帳號" });
      return;
    }
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;
