import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { signToken, authenticate } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_DEFAULT_PASSWORD = "admin1234";

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "新密碼至少 6 位"),
});

export async function seedDefaultUser(): Promise<void> {
  try {
    const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (anyUser) return;

    const passwordHash = await bcrypt.hash(ADMIN_DEFAULT_PASSWORD, 10);
    await db.insert(usersTable).values({
      username: "admin",
      passwordHash,
      displayName: "系統管理員",
      role: "super_admin",
      roles: ["super_admin"],
      isActive: true,
      mustChangePassword: true,
    });
    logger.info("首次啟動：預設系統管理員帳號已建立 (admin / admin1234)，請首次登入後立即變更密碼");
  } catch (err) {
    logger.error({ err }, "無法初始化預設帳號");
  }
}

/**
 * One-time startup migration: if no super_admin exists yet, upgrade the
 * "admin" account (the original seeded account) to super_admin.
 */
export async function ensureSuperAdmin(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "super_admin"))
      .limit(1);
    if (existing) return;

    const [adminUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);
    if (adminUser) {
      await db
        .update(usersTable)
        .set({ role: "super_admin", roles: ["super_admin"] })
        .where(eq(usersTable.id, adminUser.id));
      logger.info('啟動遷移：帳號 "admin" 已升級為系統管理員（super_admin）');
    }
  } catch (err) {
    logger.error({ err }, "無法執行 super_admin 升級遷移");
  }
}

/**
 * One-time startup migration: for users with an empty roles array,
 * auto-populate roles from the primary role column (backward compatibility).
 */
export async function migrateUserRoles(): Promise<void> {
  try {
    const users = await db
      .select({ id: usersTable.id, role: usersTable.role, roles: usersTable.roles })
      .from(usersTable);
    const toMigrate = users.filter((u) => !u.roles || u.roles.length === 0);
    for (const u of toMigrate) {
      await db.update(usersTable).set({ roles: [u.role] }).where(eq(usersTable.id, u.id));
    }
    if (toMigrate.length > 0) {
      logger.info(`角色遷移完成：已為 ${toMigrate.length} 位使用者自動填入 roles 陣列`);
    }
  } catch (err) {
    logger.error({ err }, "角色遷移失敗");
  }
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "請輸入帳號和密碼" });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "帳號或密碼錯誤" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "帳號或密碼錯誤" });
    return;
  }

  const userRoles = user.roles?.length ? user.roles : [user.role];

  const token = signToken({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roles: userRoles,
    mustChangePassword: user.mustChangePassword,
    linkedEmployeeId: user.linkedEmployeeId ?? null,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      roles: userRoles,
      mustChangePassword: user.mustChangePassword,
      linkedEmployeeId: user.linkedEmployeeId ?? null,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ ok: true });
});

router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "找不到使用者" });
    return;
  }
  const userRoles = user.roles?.length ? user.roles : [user.role];
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roles: userRoles,
    mustChangePassword: user.mustChangePassword,
    linkedEmployeeId: user.linkedEmployeeId ?? null,
  });
});

router.patch("/auth/password", authenticate, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
  const userId = req.user!.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "找不到使用者" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "目前密碼錯誤" });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, mustChangePassword: false })
    .where(eq(usersTable.id, userId));

  const userRoles = user.roles?.length ? user.roles : [user.role];

  const newToken = signToken({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roles: userRoles,
    mustChangePassword: false,
    linkedEmployeeId: user.linkedEmployeeId ?? null,
  });

  res.json({
    token: newToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      roles: userRoles,
      mustChangePassword: false,
      linkedEmployeeId: user.linkedEmployeeId ?? null,
    },
  });
});

export default router;
