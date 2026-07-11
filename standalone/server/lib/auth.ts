import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import {
  resolveFeaturePermissions,
  type FeatureKey,
  type PermissionUserLike,
} from "../../shared/userPermissions.ts";

export interface JwtPayload {
  id: number;
  username: string;
  displayName: string;
  role: string;
  roles: string[];
  mustChangePassword: boolean;
  linkedEmployeeId?: number | null;
  featurePermissions?: string[];
  dataPermission?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const JWT_SECRET = (() => {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    if (process.env["NODE_ENV"] !== "development") {
      logger.error("JWT_SECRET environment variable is required in non-development environments. Exiting.");
      process.exit(1);
    }
    logger.warn("JWT_SECRET is not set. Using an insecure development-only fallback. Do NOT deploy without setting JWT_SECRET.");
    return "dev-jwt-secret-change-before-deploying";
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

/** Effective roles: use the roles array when populated; fall back to primary role for old tokens */
export function effectiveRoles(user: JwtPayload): string[] {
  return user.roles?.length ? user.roles : [user.role];
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    const userRoles = effectiveRoles(req.user);
    if (!allowedRoles.some((r) => userRoles.includes(r))) {
      res.status(403).json({ error: "您沒有權限執行此操作" });
      return;
    }
    next();
  };
}

/** Feature permission gate — falls back to legacy role mapping when JWT has no explicit list */
export function requireFeature(...allowedFeatures: FeatureKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    const perms = resolveFeaturePermissions(req.user as PermissionUserLike);
    if (!allowedFeatures.some(f => perms.includes(f))) {
      res.status(403).json({ error: "您沒有權限執行此操作" });
      return;
    }
    next();
  };
}

/** Pass if user has allowed role OR allowed feature (backward compatible) */
export function requireRoleOrFeature(roles: string[], features: FeatureKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    const userRoles = effectiveRoles(req.user);
    if (roles.some(r => userRoles.includes(r))) {
      next();
      return;
    }
    const perms = resolveFeaturePermissions(req.user as PermissionUserLike);
    if (features.some(f => perms.includes(f))) {
      next();
      return;
    }
    res.status(403).json({ error: "您沒有權限執行此操作" });
  };
}
