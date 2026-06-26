import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { signToken, authenticate } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function seedDefaultUser(): Promise<void> {
  try {
    const existing = await db.select().from(usersTable).limit(1);
    if (existing.length === 0) {
      const passwordHash = await bcrypt.hash("admin1234", 10);
      await db.insert(usersTable).values({
        username: "admin",
        passwordHash,
        displayName: "系統管理員",
        role: "owner",
        isActive: true,
      });
      logger.info("預設管理員帳號已建立: admin / admin1234");
    }
  } catch (err) {
    logger.error({ err }, "無法建立預設帳號");
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
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ ok: true });
});

router.get("/auth/me", authenticate, (req, res): void => {
  res.json(req.user);
});

export default router;
