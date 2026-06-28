import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const ALL_ROLES = [
  "super_admin",
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

/**
 * GET /users
 * super_admin → sees everyone (including other super_admins)
 * owner       → sees everyone EXCEPT super_admin accounts
 */
router.get("/users", requireRole("super_admin", "owner"), async (req, res): Promise<void> => {
  const callerRole = req.user!.role;

  const users =
    callerRole === "super_admin"
      ? await db.select(userPublicFields).from(usersTable).orderBy(usersTable.createdAt)
      : await db
          .select(userPublicFields)
          .from(usersTable)
          .where(ne(usersTable.role, "super_admin"))
          .orderBy(usersTable.createdAt);

  res.json(users);
});

/**
 * POST /users
 * owner cannot create a super_admin account.
 */
router.post("/users", requireRole("super_admin", "owner"), async (req, res): Promise<void> => {
  const callerRole = req.user!.role;

  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (callerRole !== "super_admin" && parsed.data.role === "super_admin") {
    res.status(403).json({ error: "您沒有權限建立系統管理員帳號" });
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

/**
 * PATCH /users/:id
 * Rules for super_admin targets:
 *   • Only the super_admin themselves can edit their own account.
 *   • Role and isActive fields are stripped — super_admin cannot be downgraded or disabled.
 * Rules for everyone:
 *   • owner cannot set any account's role to super_admin.
 */
router.patch("/users/:id", requireRole("super_admin", "owner"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const callerId = req.user!.id;
  const callerRole = req.user!.role;

  const [target] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "找不到使用者" }); return; }

  if (target.role === "super_admin" && callerId !== id) {
    res.status(403).json({ error: "系統管理員帳號只能由本人修改" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data: Partial<typeof parsed.data> = { ...parsed.data };

  if (target.role === "super_admin") {
    delete data.role;
    delete data.isActive;
  }

  if (callerRole !== "super_admin" && data.role === "super_admin") {
    res.status(403).json({ error: "您沒有權限設定系統管理員角色" });
    return;
  }

  if (data.username) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.username, data.username), ne(usersTable.id, id)));
    if (existing) {
      res.status(409).json({ error: "帳號已被使用" });
      return;
    }
  }

  const [user] = await db
    .update(usersTable)
    .set(data)
    .where(eq(usersTable.id, id))
    .returning(userPublicFields);
  if (!user) { res.status(404).json({ error: "找不到使用者" }); return; }
  res.json(user);
});

/**
 * POST /users/:id/reset-password
 * super_admin passwords can NEVER be reset via this endpoint.
 * They must use PATCH /auth/password (self-service with current password).
 */
router.post("/users/:id/reset-password", requireRole("super_admin", "owner"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到使用者" }); return; }

  if (existing.role === "super_admin") {
    res.status(403).json({ error: "系統管理員密碼只能由本人透過「修改密碼」功能自行變更" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(usersTable.id, id));

  res.json({ ok: true });
});

/**
 * DELETE /users/:id
 * super_admin accounts cannot be deleted by anyone.
 */
router.delete("/users/:id", requireRole("super_admin", "owner"), async (req, res): Promise<void> => {
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

  if (target.role === "super_admin") {
    res.status(403).json({ error: "系統管理員帳號不可被刪除" });
    return;
  }

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
