import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

export interface JwtPayload {
  id: number;
  username: string;
  displayName: string;
  role: string;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const DEV_FALLBACK_SECRET = "dev-jwt-secret-not-for-production-use";
const JWT_SECRET = (() => {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    logger.warn(
      "JWT_SECRET environment variable is not set. Using a development fallback — do NOT use this in production.",
    );
    return DEV_FALLBACK_SECRET;
  }
  return secret;
})();

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "登入已過期，請重新登入" });
    return;
  }
  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "您沒有權限執行此操作" });
      return;
    }
    next();
  };
}
