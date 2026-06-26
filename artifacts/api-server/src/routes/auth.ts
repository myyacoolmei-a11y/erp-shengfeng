import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { signToken, authenticate } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_PASSWORD = "12345678";

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
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (!existing) {
      await db.insert(usersTable).values({
        username: "admin",
        passwordHash,
        displayName: "系統管理員",
        role: "owner",
        isActive: true,
        mustChangePassword: false,
      });
      logger.info("預設管理員帳號已建立: admin / 12345678");
    } else {
      const valid = await bcrypt.compare(ADMIN_PASSWORD, existing.passwordHash);
      if (!valid) {
        await db
          .update(usersTable)
          .set({ passwordHash, mustChangePassword: false })
          .where(eq(usersTable.username, "admin"));
        logger.info("管理員帳號密碼已同步為: 12345678");
      }
    }
  } catch (err) {
    logger.error({ err }, "無法初始化預設帳號");
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

  const token = signToken({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ ok: true });
});

router.get("/auth/me", authenticate, (req, res): void => {
  res.json(req.user);
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

  const newToken = signToken({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: false,
  });

  res.json({
    token: newToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: false,
    },
  });
});

export default router;
